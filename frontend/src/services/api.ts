/** Central API client: auth, error toasts, base URL. */
import axios, { AxiosError } from 'axios';
import type { AxiosInstance } from 'axios';
import type { ApiError } from '@/types';
import { toast } from '@/utils/toast';
import { API_TIMEOUT, STORAGE_KEYS } from '@/constants';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error: AxiosError<ApiError>) => {
    const method = error.config?.method?.toUpperCase() || 'GET';
    const url = (error.config?.baseURL ?? '') + (error.config?.url ?? '');
    const skipToast = url.includes('upload-nodes') || url.includes('upload-relationships') || url.includes('/datasets/create/');
    const showToast = (method !== 'GET' || error.response?.status === 401) && !skipToast;

    if (error.response?.status === 401) {
      localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
      toast.error('Session expired. Please login again.', 'Unauthorized');
      window.location.href = '/login';
      return Promise.reject(error);
    }

    if (showToast) {
      const status = error.response?.status;
      const msg = error.response?.data?.error || error.message || 'An error occurred';
      if (error.response) {
        const titles: Record<number, string> = { 400: 'Bad Request', 403: 'Forbidden', 404: 'Not Found', 500: 'Server Error' };
        toast.error(msg, titles[status!] ?? `Error ${status}`);
      } else if (error.request) {
        toast.error('Unable to connect to the server. Please check your connection.', 'Network Error', 8000);
      } else {
        toast.error(error.message || 'An unexpected error occurred', 'Error');
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;

