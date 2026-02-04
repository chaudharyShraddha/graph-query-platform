/**
 * API client configuration and base functions
 */
import axios, { AxiosError } from 'axios';
import type { AxiosInstance } from 'axios';
import type { ApiError } from '@/types';
import { toast } from '@/utils/toast';

// API base URL - adjust based on your backend
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

/**
 * Create axios instance with default configuration
 */
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // 30 seconds
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Request interceptor - add auth token if available
 */
apiClient.interceptors.request.use(
  (config) => {
    // Add auth token if available
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * Response interceptor - handle errors globally
 */
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error: AxiosError<ApiError>) => {
    // Get the request method and config
    const method = error.config?.method?.toUpperCase() || 'GET';
    const url = error.config?.url || '';
    
    // Only show error toasts for non-GET requests (POST, PUT, DELETE, PATCH)
    // GET requests are typically just loading data, so we don't want to show popups
    // unless it's a critical error like 401 (unauthorized)
    const shouldShowToast = method !== 'GET' || error.response?.status === 401;
    
    // Handle common errors
    if (error.response) {
      // Server responded with error status
      const status = error.response.status;
      const errorMessage = error.response.data?.error || error.message || 'An error occurred';
      
      switch (status) {
        case 401:
          // Unauthorized - always show this as it's critical
          localStorage.removeItem('auth_token');
          toast.error('Session expired. Please login again.', 'Unauthorized');
          window.location.href = '/login';
          break;
        case 403:
          if (shouldShowToast) {
            toast.error('You do not have permission to access this resource', 'Forbidden');
          }
          break;
        case 404:
          // Don't show toast for 404 on GET requests (just loading data)
          if (shouldShowToast) {
            toast.error('The requested resource does not exist', 'Not Found');
          }
          break;
        case 500:
          if (shouldShowToast) {
            toast.error('Something went wrong on the server. Please try again later.', 'Server Error');
          }
          break;
        case 400:
          if (shouldShowToast) {
            toast.error(errorMessage, 'Bad Request');
          }
          break;
        default:
          if (shouldShowToast) {
            toast.error(errorMessage, `Error ${status}`);
          }
      }
    } else if (error.request) {
      // Request was made but no response received - Network error
      // Only show for non-GET requests
      if (shouldShowToast) {
        toast.error(
          'Unable to connect to the server. Please check your internet connection.',
          'Network Error',
          8000
        );
      }
    } else {
      // Something else happened - only show for non-GET requests
      if (shouldShowToast) {
        toast.error(error.message || 'An unexpected error occurred', 'Error');
      }
    }
    
    return Promise.reject(error);
  }
);

export default apiClient;

