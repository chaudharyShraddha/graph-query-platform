/**
 * Dataset Creation Page
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch } from '@/store/hooks';
import { createDataset } from '@/store/slices/datasetsSlice';
import { useAutoDismiss } from '@/hooks/useAutoDismiss';
import { UPLOAD_WIZARD_STEPS } from '@/constants';
import UploadWizard from '@/components/UploadWizard/UploadWizard';
import { SuccessAlert } from '@/components/Alerts/SuccessAlert';
import { ErrorAlert } from '@/components/Alerts/ErrorAlert';
import { BackIcon, InfoIcon } from '@/components/Icons/Icons';
import './DatasetCreatePage.css';

const CASCADE_DELETE_TOOLTIP = 'When enabled, deleting relationships will also delete all related relationships connected to the same nodes.';

export default function DatasetCreatePage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [cascadeDelete, setCascadeDelete] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useAutoDismiss(errors.length > 0, () => setErrors([]), 7000);
  useAutoDismiss(!!successMessage, () => setSuccessMessage(null), 5000);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrors(['Dataset name is required']);
      return;
    }
    setIsCreating(true);
    setErrors([]);
    setSuccessMessage(null);
    try {
      const result = await dispatch(createDataset({
        name: name.trim(),
        description: description.trim(),
        cascadeDelete,
      })).unwrap();
      setSuccessMessage(`Dataset "${result.name}" created successfully!`);
      setTimeout(() => navigate(`/datasets/${result.id}/upload-nodes`), 1000);
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string }; message?: string }; message?: string }).response?.data?.error
          || (err as { message?: string }).message
        : 'Failed to create dataset';
      setErrors([msg || 'Failed to create dataset']);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="dataset-create-page">
      <div className="back-row">
        <button type="button" onClick={() => navigate('/datasets')} className="back-button">
          <BackIcon size={14} />
          Datasets
        </button>
      </div>
      <div className="page-header">
        <h1>Step 1: Create Dataset</h1>
      </div>

      <UploadWizard currentStep={1} steps={[...UPLOAD_WIZARD_STEPS]} />

      <div className="page-content">
        {successMessage && <SuccessAlert message={successMessage} onDismiss={() => setSuccessMessage(null)} />}
        {errors.length > 0 && (
          <ErrorAlert
            errors={errors}
            onDismiss={(i) => setErrors((prev) => prev.filter((_, idx) => idx !== i))}
            onDismissAll={() => setErrors([])}
          />
        )}

        <form onSubmit={handleSubmit} className="dataset-create-form">
          <div className="form-group">
            <label htmlFor="dataset-name">Dataset Name <span className="required">*</span></label>
            <input
              id="dataset-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Movie Industry Dataset"
              required
              disabled={isCreating}
            />
          </div>
          <div className="form-group">
            <label htmlFor="dataset-description">Description</label>
            <textarea
              id="dataset-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description of your dataset"
              rows={4}
              disabled={isCreating}
            />
          </div>
          <div className="form-group checkbox-group">
            <label className="checkbox-label">
              <input type="checkbox" checked={cascadeDelete} onChange={(e) => setCascadeDelete(e.target.checked)} disabled={isCreating} />
              <span>Cascade Delete</span>
              <span className="cascade-info-icon" title={CASCADE_DELETE_TOOLTIP} aria-label={CASCADE_DELETE_TOOLTIP}>
                <InfoIcon size={14} />
              </span>
            </label>
          </div>
          <div className="form-actions">
            <button type="button" onClick={() => navigate('/datasets')} disabled={isCreating} className="btn btn-secondary">Cancel</button>
            <button type="submit" disabled={isCreating || !name.trim()} className="btn btn-primary">{isCreating ? 'Creating...' : 'Create Dataset'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
