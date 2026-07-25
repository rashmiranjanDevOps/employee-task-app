'use strict';

const request = require('supertest');

jest.mock('../../src/config/database', () => ({
  sequelize: {
    authenticate: jest.fn().mockResolvedValue(true),
    close: jest.fn().mockResolvedValue(true),
    define: jest.fn().mockReturnValue({
      belongsTo: jest.fn(),
      hasMany: jest.fn(),
      beforeCreate: jest.fn(),
      beforeUpdate: jest.fn(),
    }),
  },
}));

jest.mock('../../src/models', () => ({
  User: {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
  },
  Task: {},
  AuditLog: { create: jest.fn() },
}));

const app = require('../../src/app');

describe('Auth Validation', () => {
  describe('POST /api/v1/auth/register', () => {
    it('should reject registration with invalid email', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          firstName: 'Test',
          lastName: 'User',
          email: 'not-an-email',
          password: 'ValidPass@123',
        });
      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });

    it('should reject registration with weak password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          firstName: 'Test',
          lastName: 'User',
          email: 'test@example.com',
          password: 'weak',
        });
      expect(res.status).toBe(422);
    });

    it('should reject registration with missing firstName', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          lastName: 'User',
          email: 'test@example.com',
          password: 'ValidPass@123',
        });
      expect(res.status).toBe(422);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should reject login with missing password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'test@example.com' });
      expect(res.status).toBe(422);
    });

    it('should reject login with invalid email format', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'invalid', password: 'somepassword' });
      expect(res.status).toBe(422);
    });
  });
});

describe('Task route ordering', () => {
  it('GET /api/v1/tasks/stats should not be caught by /:id param validator', async () => {
    // Without the fix, Express matches "stats" as a UUID and returns 422.
    // With the fix (/stats registered before /:id), we get 401 (unauthenticated)
    // which proves the route was found and auth middleware ran.
    const res = await request(app)
      .get('/api/v1/tasks/stats');
    // 401 = route found, auth rejected (correct). 422 = bug (stats treated as UUID param).
    expect(res.status).toBe(401);
    expect(res.status).not.toBe(422);
  });
});
