/**
 * Toast Notification Component
 */
import { useEffect } from 'react';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { removeNotification } from '@/store/slices/uiSlice';
import { CheckIcon, ErrorIcon, WarningIcon, InfoIcon, CloseIcon } from '@/components/Icons/Icons';
import './Toast.css';

const Toast = () => {
  const dispatch = useAppDispatch();
  const notifications = useAppSelector((state) => state.ui.notifications);

  useEffect(() => {
    notifications.forEach((notification) => {
      const timer = setTimeout(() => {
        dispatch(removeNotification(notification.id));
      }, notification.duration || 5000);

      return () => clearTimeout(timer);
    });
  }, [notifications, dispatch]);

  if (notifications.length === 0) return null;

  return (
    <div className="toast-container">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={`toast toast-${notification.type}`}
          onClick={() => dispatch(removeNotification(notification.id))}
        >
          <div className="toast-icon">
            {notification.type === 'success' && <CheckIcon size={16} />}
            {notification.type === 'error' && <ErrorIcon size={16} />}
            {notification.type === 'warning' && <WarningIcon size={16} />}
            {notification.type === 'info' && <InfoIcon size={16} />}
          </div>
          <div className="toast-content">
            <div className="toast-message">{notification.message}</div>
            {notification.title && (
              <div className="toast-title">{notification.title}</div>
            )}
          </div>
          <button
            className="toast-close"
            onClick={(e) => {
              e.stopPropagation();
              dispatch(removeNotification(notification.id));
            }}
            aria-label="Close notification"
          >
            <CloseIcon size={16} />
          </button>
        </div>
      ))}
    </div>
  );
};

export default Toast;

