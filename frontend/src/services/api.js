import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'https://api.rashmidevops.xyz';

const api = axios.create({
  baseURL: `${BASE_URL}/api/v1`,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor – attach access token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor – handle 401 / token refresh
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((p) => (error ? p.reject(error) : p.resolve(token)));
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    if (error.response?.status === 401 && !original._retry) {
      if (error.response?.data?.code === 'TOKEN_EXPIRED') {
        if (isRefreshing) {
          return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          }).then((token) => {
            original.headers.Authorization = `Bearer ${token}`;
            return api(original);
          });
        }

        original._retry = true;
        isRefreshing = true;

        try {
          const refreshToken = localStorage.getItem('refreshToken');
          if (!refreshToken) throw new Error('No refresh token');

          const { data } = await axios.post(`${BASE_URL}/api/v1/auth/refresh`, { refreshToken });
          const { accessToken, refreshToken: newRefreshToken } = data.data;

          localStorage.setItem('accessToken', accessToken);
          localStorage.setItem('refreshToken', newRefreshToken);

          api.defaults.headers.common.Authorization = `Bearer ${accessToken}`;
          processQueue(null, accessToken);
          return api(original);
        } catch (refreshError) {
          processQueue(refreshError, null);
          localStorage.clear();
          window.location.href = '/login';
          return Promise.reject(refreshError);
        } finally {
          isRefreshing = false;
        }
      }

      // Non-TOKEN_EXPIRED 401
      localStorage.clear();
      window.location.href = '/login';
    }

    return Promise.reject(error);
  }
);

// ─── Auth ────────────────────────────────────────────────────────────────────
export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  register: (data) => api.post('/auth/register', data),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  changePassword: (data) => api.put('/auth/change-password', data),
  refresh: (data) => api.post('/auth/refresh', data),
};

// ─── Tasks ───────────────────────────────────────────────────────────────────
export const tasksAPI = {
  list: (params) => api.get('/tasks', { params }),
  get: (id) => api.get(`/tasks/${id}`),
  create: (data) => api.post('/tasks', data),
  update: (id, data) => api.put(`/tasks/${id}`, data),
  assign: (id, data) => api.patch(`/tasks/${id}/assign`, data),
  delete: (id) => api.delete(`/tasks/${id}`),
  stats: () => api.get('/tasks/stats'),
};

// ─── Users ───────────────────────────────────────────────────────────────────
export const usersAPI = {
  list: () => api.get('/users'),
  getProfile: () => api.get('/users/profile'),
  updateProfile: (data) => api.put('/users/profile', data),
};

// ─── Admin ───────────────────────────────────────────────────────────────────
export const adminAPI = {
  dashboard: () => api.get('/admin/dashboard'),
  listUsers: (params) => api.get('/admin/users', { params }),
  getUser: (id) => api.get(`/admin/users/${id}`),
  updateUser: (id, data) => api.put(`/admin/users/${id}`, data),
  deleteUser: (id) => api.delete(`/admin/users/${id}`),
  auditLogs: (params) => api.get('/admin/audit-logs', { params }),
};

export default api;
