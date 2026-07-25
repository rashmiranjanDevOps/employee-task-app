import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from '../context/AuthContext';
import * as api from '../services/api';

vi.mock('../services/api', () => ({
  authAPI: {
    me: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    register: vi.fn(),
  },
}));

function TestConsumer() {
  const { user, loading, login, logout } = useAuth();
  if (loading) return <div>Loading</div>;
  if (!user) return <button onClick={() => login({ email: 'a@b.com', password: 'pw' })}>Login</button>;
  return (
    <>
      <span>{user.email}</span>
      <button onClick={logout}>Logout</button>
    </>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('shows unauthenticated when no token', async () => {
    api.authAPI.me.mockRejectedValue(new Error('no token'));
    render(<AuthProvider><TestConsumer /></AuthProvider>);
    await waitFor(() => expect(screen.getByText('Login')).toBeTruthy());
  });

  it('loads user from stored token on mount', async () => {
    localStorage.setItem('accessToken', 'tok');
    api.authAPI.me.mockResolvedValue({ data: { data: { user: { email: 'u@x.com' } } } });
    render(<AuthProvider><TestConsumer /></AuthProvider>);
    await waitFor(() => expect(screen.getByText('u@x.com')).toBeTruthy());
  });

  it('login stores tokens and sets user', async () => {
    api.authAPI.me.mockRejectedValue(new Error('no token'));
    api.authAPI.login.mockResolvedValue({
      data: { data: { user: { email: 'u@x.com' }, accessToken: 'at', refreshToken: 'rt' } },
    });
    render(<AuthProvider><TestConsumer /></AuthProvider>);
    await waitFor(() => screen.getByText('Login'));
    await act(async () => userEvent.click(screen.getByText('Login')));
    await waitFor(() => expect(screen.getByText('u@x.com')).toBeTruthy());
    expect(localStorage.getItem('accessToken')).toBe('at');
  });

  it('logout clears tokens and user', async () => {
    localStorage.setItem('accessToken', 'tok');
    api.authAPI.me.mockResolvedValue({ data: { data: { user: { email: 'u@x.com' } } } });
    api.authAPI.logout.mockResolvedValue({});
    render(<AuthProvider><TestConsumer /></AuthProvider>);
    await waitFor(() => screen.getByText('u@x.com'));
    await act(async () => userEvent.click(screen.getByText('Logout')));
    await waitFor(() => expect(screen.getByText('Login')).toBeTruthy());
    expect(localStorage.getItem('accessToken')).toBeNull();
  });
});
