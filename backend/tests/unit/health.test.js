'use strict';

const request = require('supertest');

// Mock the database to avoid requiring a real MySQL connection in unit tests
jest.mock('../../src/config/database', () => ({
  sequelize: {
    authenticate: jest.fn().mockResolvedValue(true),
    close: jest.fn().mockResolvedValue(true),
    define: jest.fn().mockReturnValue({
      belongsTo: jest.fn(),
      hasMany: jest.fn(),
      beforeCreate: jest.fn(),
      beforeUpdate: jest.fn(),
      prototype: {},
    }),
  },
}));

const app = require('../../src/app');

describe('Health Endpoints', () => {
  describe('GET /health', () => {
    it('should return 200 and status ok', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('employee-task-api');
    });
  });

  describe('GET /ready', () => {
    it('should return 200 when database is reachable', async () => {
      const res = await request(app).get('/ready');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ready');
    });
  });

  describe('GET /live', () => {
    it('should return 200 with memory stats', async () => {
      const res = await request(app).get('/live');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('live');
      expect(res.body.memory).toBeDefined();
    });
  });

  describe('GET /unknown-route', () => {
    it('should return 404 for unknown routes', async () => {
      const res = await request(app).get('/unknown-route');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });
});
