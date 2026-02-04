/**
 * Error Modal Component for Detailed Error Display
 */
import './ErrorModal.css';

interface ErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  message: string;
  details?: string;
  errorCode?: string | number;
  stackTrace?: string;
}

const ErrorModal = ({
  isOpen,
  onClose,
  title = 'Error',
  message,
  details,
  errorCode,
  stackTrace,
}: ErrorModalProps) => {
  if (!isOpen) return null;

  return (
    <div className="error-modal-overlay" onClick={onClose}>
      <div className="error-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="error-modal-header">
          <div className="error-modal-title-section">
            <div className="error-icon">✕</div>
            <h2>{title}</h2>
            {errorCode && (
              <span className="error-code">Code: {errorCode}</span>
            )}
          </div>
          <button className="error-modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="error-modal-body">
          <div className="error-message-section">
            <p className="error-message">{message}</p>
            {details && (
              <div className="error-details">
                <strong>Details:</strong>
                <pre>{details}</pre>
              </div>
            )}
            {stackTrace && (
              <details className="error-stack">
                <summary>Stack Trace</summary>
                <pre>{stackTrace}</pre>
              </details>
            )}
          </div>
        </div>

        <div className="error-modal-footer">
          <button className="btn btn-primary" onClick={onClose}>
            Close
          </button>
          {stackTrace && (
            <button
              className="btn btn-secondary"
              onClick={() => {
                navigator.clipboard.writeText(stackTrace);
              }}
            >
              Copy Stack Trace
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ErrorModal;

