'use strict';

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { User } = require('../models');
const logger = require('../utils/logger');
const { createAuditLog } = require('../services/audit.service');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME = 15 * 60 * 1000; // 15 minutes

// Hash a refresh token for safe DB storage (SHA-256, no bcrypt — tokens are
// already high-entropy random values so a fast hash is sufficient here).
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateTokens(userId, role) {
  const payload = { sub: userId, role };
  const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN, algorithm: 'HS256' });
  const refreshToken = jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRES_IN, algorithm: 'HS256' });
  return { accessToken, refreshToken };
}

exports.register = async (req, res, next) => {
  try {
    const { firstName, lastName, email, password, department, jobTitle } = req.body;

    const existing = await User.findOne({ where: { email } });
    if (existing) {
      return res.status(409).json({ success: false, error: 'Email already registered' });
    }

    const user = await User.create({ firstName, lastName, email, password, department, jobTitle });

    await createAuditLog({
      userId: user.id,
      action: 'USER_REGISTERED',
      resource: 'User',
      resourceId: user.id,
      newValues: { email, firstName, lastName },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    const { accessToken, refreshToken } = generateTokens(user.id, user.role);
    await User.update({ refreshToken: hashToken(refreshToken), lastLoginAt: new Date() }, { where: { id: user.id } });

    logger.info({ msg: 'User registered', userId: user.id, email });

    return res.status(201).json({
      success: true,
      data: {
        user: user.toPublicJSON(),
        accessToken,
        refreshToken,
        expiresIn: JWT_EXPIRES_IN,
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.scope('withPassword').findOne({ where: { email } });
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, error: 'Account is deactivated' });
    }

    if (user.isLocked()) {
      const remaining = Math.ceil((user.lockedUntil - Date.now()) / 60000);
      return res.status(423).json({ success: false, error: `Account locked. Try again in ${remaining} minutes.` });
    }

    const isValid = await user.validatePassword(password);
    if (!isValid) {
      const attempts = user.loginAttempts + 1;
      const updateData = { loginAttempts: attempts };
      if (attempts >= MAX_LOGIN_ATTEMPTS) {
        updateData.lockedUntil = new Date(Date.now() + LOCK_TIME);
        logger.warn({ msg: 'Account locked due to failed attempts', email });
      }
      await User.update(updateData, { where: { id: user.id } });
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const { accessToken, refreshToken } = generateTokens(user.id, user.role);
    await User.update({
      refreshToken: hashToken(refreshToken),
      lastLoginAt: new Date(),
      loginAttempts: 0,
      lockedUntil: null,
    }, { where: { id: user.id } });

    await createAuditLog({
      userId: user.id,
      action: 'USER_LOGIN',
      resource: 'User',
      resourceId: user.id,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    logger.info({ msg: 'User logged in', userId: user.id, role: user.role });

    return res.json({
      success: true,
      data: {
        user: user.toPublicJSON(),
        accessToken,
        refreshToken,
        expiresIn: JWT_EXPIRES_IN,
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(401).json({ success: false, error: 'Refresh token required' });
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    } catch {
      return res.status(401).json({ success: false, error: 'Invalid or expired refresh token' });
    }

    // Compare hash, not plaintext
    const user = await User.scope('withSensitive').findOne({
      where: { id: decoded.sub, refreshToken: hashToken(refreshToken) },
    });
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, error: 'Token revoked or user inactive' });
    }

    const tokens = generateTokens(user.id, user.role);
    await User.update({ refreshToken: hashToken(tokens.refreshToken) }, { where: { id: user.id } });

    return res.json({ success: true, data: { ...tokens, expiresIn: JWT_EXPIRES_IN } });
  } catch (err) {
    next(err);
  }
};

exports.logout = async (req, res, next) => {
  try {
    await User.update({ refreshToken: null }, { where: { id: req.user.id } });

    await createAuditLog({
      userId: req.user.id,
      action: 'USER_LOGOUT',
      resource: 'User',
      resourceId: req.user.id,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    return res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
};

exports.me = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    return res.json({ success: true, data: { user } });
  } catch (err) {
    next(err);
  }
};

exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.scope('withPassword').findByPk(req.user.id);

    const isValid = await user.validatePassword(currentPassword);
    if (!isValid) return res.status(400).json({ success: false, error: 'Current password is incorrect' });

    // Invalidate all refresh tokens on password change
    await user.update({ password: newPassword, refreshToken: null });

    await createAuditLog({
      userId: req.user.id,
      action: 'PASSWORD_CHANGED',
      resource: 'User',
      resourceId: req.user.id,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    return res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    next(err);
  }
};
