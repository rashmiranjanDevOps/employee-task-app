import { describe, it, expect, vi } from 'vitest';

// Simple unit tests for API module helper behaviour
// (axios calls are mocked at the module level)

vi.mock('axios', () => {
  const mockCreate = vi.fn(() => ({
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
    defaults: { headers: { common: {} } },
  }));
  return { default: { create: mockCreate, post: vi.fn() } };
});

describe('api module', () => {
  it('exports authAPI with expected methods', async () => {
    const { authAPI } = await import('../services/api');
    expect(typeof authAPI.login).toBe('function');
    expect(typeof authAPI.register).toBe('function');
    expect(typeof authAPI.logout).toBe('function');
    expect(typeof authAPI.me).toBe('function');
    expect(typeof authAPI.refresh).toBe('function');
    expect(typeof authAPI.changePassword).toBe('function');
  });

  it('exports tasksAPI with expected methods', async () => {
    const { tasksAPI } = await import('../services/api');
    expect(typeof tasksAPI.list).toBe('function');
    expect(typeof tasksAPI.get).toBe('function');
    expect(typeof tasksAPI.create).toBe('function');
    expect(typeof tasksAPI.update).toBe('function');
    expect(typeof tasksAPI.assign).toBe('function');
    expect(typeof tasksAPI.delete).toBe('function');
    expect(typeof tasksAPI.stats).toBe('function');
  });

  it('exports adminAPI with expected methods', async () => {
    const { adminAPI } = await import('../services/api');
    expect(typeof adminAPI.dashboard).toBe('function');
    expect(typeof adminAPI.listUsers).toBe('function');
    expect(typeof adminAPI.getUser).toBe('function');
    expect(typeof adminAPI.updateUser).toBe('function');
    expect(typeof adminAPI.deleteUser).toBe('function');
    expect(typeof adminAPI.auditLogs).toBe('function');
  });
});
