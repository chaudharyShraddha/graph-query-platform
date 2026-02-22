/**
 * Relationship Upload Page
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { uploadRelationships, fetchDataset } from '@/store/slices/datasetsSlice';
import { useAutoDismiss } from '@/hooks/useAutoDismiss';
import { UPLOAD_WIZARD_STEPS } from '@/constants';
import { validateCSVFile } from '@/utils/fileValidation';
import TaskProgress from '@/components/TaskProgress/TaskProgress';
import UploadWizard from '@/components/UploadWizard/UploadWizard';
import { BackIcon, RelationshipIcon } from '@/components/Icons/Icons';
import './RelationshipUploadPage.css';

type UploadItemStatus = 'pending' | 'uploading' | 'accepted' | 'failed';

type UploadItem = {
  key: string;
  file: File;
  status: UploadItemStatus;
  task_id?: number;
  error?: string;
};

export default function RelationshipUploadPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const datasetId = id ? parseInt(id) : null;
  const dispatch = useAppDispatch();
  const dataset = useAppSelector((state) =>
    state.datasets.datasets.find((d) => d.id === datasetId) || state.datasets.currentDataset
  );
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useAutoDismiss(errors.length > 0, () => setErrors([]), 7000);

  useEffect(() => {
    if (datasetId && !dataset) dispatch(fetchDataset(datasetId));
  }, [datasetId, dataset, dispatch]);

  if (!datasetId) {
    return (
      <div className="relationship-upload-page">
        <div className="error-state">
          <h2>Invalid Dataset ID</h2>
          <button onClick={() => navigate('/datasets')} className="btn btn-primary">
            Back to Datasets
          </button>
        </div>
      </div>
    );
  }

  const handleFileSelect = useCallback((selectedFiles: FileList | null) => {
    if (!selectedFiles) return;
    const validFiles: File[] = [];
    const newErrors: string[] = [];
    Array.from(selectedFiles).forEach((file) => {
      const validation = validateCSVFile(file);
      if (!validation.isValid) {
        newErrors.push(`${file.name}: ${validation.error}`);
      } else {
        validFiles.push(file);
      }
    });
    if (newErrors.length > 0) setErrors((prev) => [...prev, ...newErrors]);
    if (validFiles.length > 0) {
      const base = Date.now();
      setUploadItems((prev) => [
        ...prev,
        ...validFiles.map((file, i) => ({
          key: `${base}-${i}-${file.name}`,
          file,
          status: 'pending' as UploadItemStatus,
        })),
      ]);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const removeItem = (index: number) => {
    setUploadItems((prev) => prev.filter((_, i) => i !== index));
  };

  const clearAll = () => {
    setUploadItems([]);
    setErrors([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleUpload = async () => {
    const pending = uploadItems.filter((i) => i.status === 'pending');
    if (pending.length === 0) {
      setErrors(['Add at least one file to upload']);
      return;
    }
    const filesToUpload = pending.map((i) => i.file);
    setUploadItems((prev) =>
      prev.map((item) => (item.status === 'pending' ? { ...item, status: 'uploading' as const } : item))
    );
    setIsUploading(true);
    setErrors([]);
    try {
      const result = await dispatch(uploadRelationships({ datasetId, files: filesToUpload })).unwrap();
      if (result.file_results && Array.isArray(result.file_results)) {
        const fileResults = result.file_results as Array<{ file_name: string; status: string; task_id?: number; error?: string }>;
        setUploadItems((prev) =>
          prev.map((item) => {
            if (item.status !== 'uploading') return item;
            const fr = fileResults.find((r) => r.file_name === item.file.name);
            if (!fr) return { ...item, status: 'failed' as const, error: 'Upload failed' };
            return {
              ...item,
              status: fr.status === 'accepted' ? 'accepted' : 'failed',
              task_id: fr.task_id,
              error: fr.status === 'failed' ? (fr.error ?? 'Upload failed') : undefined,
            };
          })
        );
      } else {
        setUploadItems((prev) =>
          prev.map((item) => (item.status === 'uploading' ? { ...item, status: 'accepted' as const } : item))
        );
      }
      await dispatch(fetchDataset(datasetId));
    } catch (err: unknown) {
      type FileResult = { file_name: string; status?: string; task_id?: number; error?: string };
      // err is the response body (rejectWithValue) when backend returns 400: { dataset, file_results, summary }
      const data = err && typeof err === 'object' && 'file_results' in err ? (err as { file_results?: FileResult[] }) : undefined;
      const fileResults = data?.file_results ?? (err && typeof err === 'object' && 'response' in err ? (err as { response?: { data?: { file_results?: FileResult[] } } }).response?.data?.file_results : undefined);
      if (fileResults && Array.isArray(fileResults)) {
        setUploadItems((prev) =>
          prev.map((item) => {
            if (item.status !== 'uploading') return item;
            const name = item.file.name;
            let fr = fileResults.find((r) => r.file_name === name);
            if (!fr && fileResults.length === 1) fr = fileResults[0];
            if (!fr) return { ...item, status: 'failed' as const, error: 'Upload failed' };
            return {
              ...item,
              status: fr.status === 'accepted' ? 'accepted' : 'failed',
              task_id: fr.task_id,
              error: fr.status === 'failed' ? (fr.error ?? 'Upload failed') : undefined,
            };
          })
        );
      } else {
        setUploadItems((prev) =>
          prev.map((item) => (item.status === 'uploading' ? { ...item, status: 'failed' as const, error: 'Upload failed' } : item))
        );
        const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : 'Upload failed';
        setErrors([msg]);
      }
    } finally {
      setIsUploading(false);
    }
  };

  const pendingCount = uploadItems.filter((i) => i.status === 'pending').length;
  const hasItems = uploadItems.length > 0;

  return (
    <div className="relationship-upload-page">
      <div className="back-row">
        <button type="button" onClick={() => navigate(`/datasets/${datasetId}/upload-nodes`)} className="back-button">
          <BackIcon size={14} />
          Node files
        </button>
      </div>
      <div className="page-header">
        <h1>Step 3: Upload Relationship Files</h1>
        <div className="page-header-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate(`/datasets/${datasetId}`)}>
            View Dataset →
          </button>
        </div>
      </div>

      <UploadWizard currentStep={3} steps={[...UPLOAD_WIZARD_STEPS]} datasetName={dataset?.name} />

      <div className="page-content">
        <div className="upload-section">
          <div
            className={`drop-zone ${isDragging ? 'dragging' : ''}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
          >
            <RelationshipIcon />
            <p className="drop-zone-text">Drag and drop relationship CSV files here, or click to browse</p>
            <p className="drop-zone-hint">Files must have Label:source_id and Label:target_id columns</p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".csv"
              onChange={(e) => handleFileSelect(e.target.files)}
              style={{ display: 'none' }}
            />
          </div>

          {hasItems && (
            <div className="file-list file-list-with-status">
              <div className="file-list-header">
                <h3>Selected Files ({uploadItems.length})</h3>
                <button type="button" className="btn btn-sm btn-secondary" onClick={clearAll} disabled={isUploading}>
                  Clear all
                </button>
              </div>
              <ul>
                {uploadItems.map((item, index) => (
                  <li key={item.key} className={`file-list-item status-${item.status}`}>
                    <div className="file-list-item-main">
                      <span className="file-name">{item.file.name}</span>
                      <span className="file-size">{(item.file.size / 1024).toFixed(2)} KB</span>
                      {item.status === 'pending' && (
                        <button
                          type="button"
                          className="remove-file"
                          onClick={() => removeItem(index)}
                          disabled={isUploading}
                          aria-label="Remove file"
                        >
                          ×
                        </button>
                      )}
                      {item.status === 'uploading' && <span className="file-status-badge uploading">Uploading…</span>}
                      {item.status === 'accepted' && <span className="file-status-badge success">✓ Success</span>}
                      {item.status === 'failed' && <span className="file-status-badge failed">✗ Failed</span>}
                    </div>
                    {item.status === 'accepted' && item.task_id != null && (
                      <div className="file-list-item-progress">
                        <TaskProgress taskId={item.task_id} />
                      </div>
                    )}
                    {item.status === 'failed' && (
                      <div className="file-list-item-error">
                        <span className="file-list-item-error-label">Error:</span>{' '}
                        {item.error || 'Upload failed'}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="upload-actions">
            <button
              type="button"
              onClick={handleUpload}
              disabled={isUploading || pendingCount === 0}
              className="btn btn-primary"
            >
              {isUploading ? 'Uploading…' : `Upload ${pendingCount > 0 ? pendingCount : uploadItems.length} File(s)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
