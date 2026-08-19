import axios from 'axios';

const apiRoot = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

const api = axios.create({
  baseURL: apiRoot ? `${apiRoot}/api` : '/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      const path = window.location.pathname;
      if (!['/login', '/register', '/forgot-password', '/reset-password'].includes(path)) {
        window.location.href = '/login';
      }
    }
    if (error.response?.status === 402 && window.location.pathname !== '/membership') {
      window.location.href = '/membership';
    }
    return Promise.reject(error);
  }
);

export default api;
