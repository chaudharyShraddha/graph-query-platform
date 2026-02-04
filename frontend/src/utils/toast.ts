/**
 * Toast notification utility functions
 */
import { store } from '@/store';
import { addNotification } from '@/store/slices/uiSlice';

export const toast = {
  success: (message: string, title?: string, duration?: number) => {
    store.dispatch(
      addNotification({
        type: 'success',
        message,
        title,
        duration,
      })
    );
  },
  error: (message: string, title?: string, duration?: number) => {
    store.dispatch(
      addNotification({
        type: 'error',
        message,
        title,
        duration,
      })
    );
  },
  warning: (message: string, title?: string, duration?: number) => {
    store.dispatch(
      addNotification({
        type: 'warning',
        message,
        title,
        duration,
      })
    );
  },
  info: (message: string, title?: string, duration?: number) => {
    store.dispatch(
      addNotification({
        type: 'info',
        message,
        title,
        duration,
      })
    );
  },
};

