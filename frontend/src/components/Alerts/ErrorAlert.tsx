interface ErrorAlertProps {
  title?: string;
  errors: string[];
  onDismiss: (index: number) => void;
  onDismissAll: () => void;
}

export function ErrorAlert({ title = 'Errors', errors, onDismiss, onDismissAll }: ErrorAlertProps) {
  if (errors.length === 0) return null;
  return (
    <div className="error-alert">
      <div className="error-alert-header">
        <strong>{title}</strong>
        <button type="button" className="error-dismiss-all" onClick={onDismissAll} aria-label="Dismiss all">×</button>
      </div>
      <ul className="error-list">
        {errors.map((error, i) => (
          <li key={i} className="error-item">
            <span className="error-text">{error}</span>
            <button type="button" className="error-dismiss" onClick={() => onDismiss(i)} aria-label="Dismiss">×</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
