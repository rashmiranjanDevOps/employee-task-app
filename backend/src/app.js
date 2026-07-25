'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const pinoHttp = require('pino-http');
const rateLimit = require('express-rate-limit');

const logger = require('./utils/logger');
const { metricsMiddleware, metricsEndpoint } = require('./utils/metrics');
const errorHandler = require('./middleware/errorHandler');
const { notFound } = require('./middleware/notFound');

// Route imports
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const taskRoutes = require('./routes/task.routes');
const adminRoutes = require('./routes/admin.routes');
const healthRoutes = require('./routes/health.routes');
const healthController = require('./controllers/health.controller');

const app = express();

// ─── Security Headers ──────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// ─── CORS ──────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',');
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  exposedHeaders: ['X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
}));

// ─── Compression ───────────────────────────────────────────────────────────
app.use(compression());

// ─── Request Logging ───────────────────────────────────────────────────────
app.use(pinoHttp({
  logger,
  customLogLevel: (req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    if (req.url === '/health' || req.url === '/ready' || req.url === '/live') return 'trace';
    return 'info';
  },
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      remoteAddress: req.remoteAddress,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
}));

// ─── Metrics ───────────────────────────────────────────────────────────────
app.use(metricsMiddleware);

// ─── Body Parsing ──────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Trust Proxy (for load balancers) ─────────────────────────────────────
app.set('trust proxy', 1);

// ─── Global Rate Limiter ───────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX || '200'),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later.' },
  skip: (req) => req.path === '/metrics' || req.path === '/health' || req.path === '/ready' || req.path === '/live',
});
app.use(globalLimiter);

// ─── Auth Rate Limiter ─────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many authentication attempts.' },
});

// ─── Routes ────────────────────────────────────────────────────────────────
app.use('/health', healthRoutes);
app.get('/ready', healthController.ready);
app.get('/live', healthController.live);
app.get('/metrics', metricsEndpoint);

app.use('/api/v1/auth', authLimiter, authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/tasks', taskRoutes);
app.use('/api/v1/admin', adminRoutes);

// ─── 404 Handler ───────────────────────────────────────────────────────────
app.use(notFound);

// ─── Global Error Handler ──────────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;
