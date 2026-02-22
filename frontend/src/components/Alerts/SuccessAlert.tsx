interface SuccessAlertProps {
  message: string;
  onDismiss: () => void;
}

export function SuccessAlert({ message, onDismiss }: SuccessAlertProps) {
  return (
    <div className="success-alert">
      <span className="success-icon">✓</span>
      <span className="success-text">{message}</span>
      <button type="button" onClick={onDismiss} className="dismiss-success" aria-label="Dismiss">×</button>
    </div>
  );
}
