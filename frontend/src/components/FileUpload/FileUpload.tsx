/**
 * File Upload Component with drag-and-drop support
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { uploadFiles } from '@/store/slices/datasetsSlice';
import { toast } from '@/utils/toast';
import { UploadIcon, NodeIcon, RelationshipIcon } from '@/components/Icons/Icons';
import TaskProgress from '../TaskProgress/TaskProgress';
import './FileUpload.css';

interface FileUploadProps {
  onUploadComplete?: (datasetId: number) => void;
  onUploadError?: (error: string) => void;
}

interface FileWithStatus {
  file: File;
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'error';
  error?: string;
  taskId?: number;
  fileType?: 'node' | 'relationship';
  labelOrType?: string;
  validationError?: string;
}

const FileUpload = ({ onUploadComplete, onUploadError }: FileUploadProps) => {
  const dispatch = useAppDispatch();
  const [files, setFiles] = useState<FileWithStatus[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [datasetName, setDatasetName] = useState('');
  const [description, setDescription] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const taskStatuses = useAppSelector((state) => state.datasets.taskStatuses);

  // Detect file type from filename (simple heuristic)
  const detectFileType = (fileName: string): { type: 'node' | 'relationship'; labelOrType: string } => {
    const nameWithoutExt = fileName.replace(/\.csv$/i, '');
    // Common relationship indicators in filename
    const relationshipKeywords = ['follows', 'purchased', 'likes', 'knows', 'related', 'connected'];
    const isLikelyRelationship = relationshipKeywords.some(keyword => 
      nameWithoutExt.toLowerCase().includes(keyword)
    );
    
    if (isLikelyRelationship) {
      return { type: 'relationship', labelOrType: nameWithoutExt };
    }
    // Default to node, label is the filename without extension
    return { type: 'node', labelOrType: nameWithoutExt };
  };

  // Validate CSV file
  const validateCSVFile = (file: File): { isValid: boolean; error?: string } => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      return { isValid: false, error: 'Only CSV files are allowed' };
    }
    if (file.size === 0) {
      return { isValid: false, error: 'File is empty' };
    }
    if (file.size > 100 * 1024 * 1024) {
      return { isValid: false, error: 'File size exceeds 100MB limit' };
    }
    return { isValid: true };
  };

  // Handle file selection
  const handleFileSelect = useCallback((selectedFiles: FileList | null) => {
    if (!selectedFiles) return;

    const newFiles: FileWithStatus[] = [];
    const errors: string[] = [];

    Array.from(selectedFiles).forEach((file) => {
      const validation = validateCSVFile(file);
      if (!validation.isValid) {
        errors.push(`${file.name}: ${validation.error}`);
        newFiles.push({
          file,
          status: 'error',
          validationError: validation.error,
        });
      } else {
        const { type, labelOrType } = detectFileType(file.name);
        newFiles.push({
          file,
          status: 'pending',
          fileType: type,
          labelOrType: labelOrType,
        });
      }
    });

    if (errors.length > 0) {
      const errorMessage = errors.join('\n');
      toast.error(errorMessage, 'File Validation Error');
      onUploadError?.(errorMessage);
    }

    if (newFiles.length > 0) {
      setFiles((prev) => [...prev, ...newFiles]);
    }
  }, [onUploadError]);

  // Handle drag and drop
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const droppedFiles = e.dataTransfer.files;
      handleFileSelect(droppedFiles);
    },
    [handleFileSelect]
  );

  // Remove file
  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Handle upload
  const handleUpload = useCallback(async () => {
    // Filter out files with validation errors
    const validFiles = files.filter((f) => !f.validationError && f.status !== 'error');
    
    if (validFiles.length === 0) {
      const errorMessage = 'Please select at least one valid file';
      toast.error(errorMessage, 'Upload Error');
      onUploadError?.(errorMessage);
      return;
    }

    setIsUploading(true);
    const filesToUpload = validFiles.map((f) => f.file);

    try {
      const result = await dispatch(
        uploadFiles({
          files: filesToUpload,
          datasetName: datasetName || undefined,
          description: description || undefined,
        })
      ).unwrap();

      // Update file statuses with task IDs
      if (result.upload_tasks) {
        setFiles((prev) =>
          prev.map((fileWithStatus, index) => {
            const task = result.upload_tasks?.[index];
            return {
              ...fileWithStatus,
              status: task ? 'processing' : 'pending',
              taskId: task?.id,
            };
          })
        );
      }

      // Call completion callback
      if (result.id) {
        onUploadComplete?.(result.id);
      }
    } catch (error: any) {
      const errorMessage = error?.message || 'Upload failed';
      toast.error(errorMessage, 'Upload Error');
      onUploadError?.(errorMessage);
      setFiles((prev) =>
        prev.map((f) => ({
          ...f,
          status: 'error',
          error: errorMessage,
        }))
      );
    } finally {
      setIsUploading(false);
    }
  }, [files, datasetName, description, dispatch, onUploadComplete, onUploadError]);

  // Update file statuses based on task progress
  const updateFileStatuses = useCallback(() => {
    setFiles((prev) =>
      prev.map((fileWithStatus) => {
        if (!fileWithStatus.taskId) return fileWithStatus;

        const taskStatus = taskStatuses[fileWithStatus.taskId];
        if (taskStatus) {
          return {
            ...fileWithStatus,
            status:
              taskStatus.status === 'completed'
                ? 'completed'
                : taskStatus.status === 'failed'
                  ? 'error'
                  : taskStatus.status === 'processing'
                    ? 'processing'
                    : fileWithStatus.status,
            error: taskStatus.error,
          };
        }
        return fileWithStatus;
      })
    );
  }, [taskStatuses]);

  // Update statuses when task statuses change
  useEffect(() => {
    updateFileStatuses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskStatuses]);

  return (
    <div className="file-upload">
      <div className="file-upload-header">
        <h2>Upload CSV Files</h2>
        <p>Upload node and relationship CSV files to create a dataset</p>
      </div>

      {/* Dataset Info */}
      <div className="file-upload-form">
        <div className="form-group">
          <label htmlFor="dataset-name">Dataset Name (Optional)</label>
          <input
            id="dataset-name"
            type="text"
            value={datasetName}
            onChange={(e) => setDatasetName(e.target.value)}
            placeholder="Enter dataset name"
            disabled={isUploading}
          />
        </div>
        <div className="form-group">
          <label htmlFor="dataset-description">Description (Optional)</label>
          <textarea
            id="dataset-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Enter dataset description"
            rows={3}
            disabled={isUploading}
          />
        </div>
      </div>

      {/* Drag and Drop Area */}
      <div
        className={`file-upload-dropzone ${isDragging ? 'dragging' : ''}`}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".csv"
          onChange={(e) => handleFileSelect(e.target.files)}
          style={{ display: 'none' }}
          disabled={isUploading}
        />
        <div className="dropzone-content">
          <div className="dropzone-icon">📁</div>
          <p className="dropzone-text">
            {isDragging ? 'Drop files here' : 'Drag and drop CSV files here'}
          </p>
          <p className="dropzone-subtext">or click to browse</p>
          <p className="dropzone-hint">Supports multiple CSV files</p>
        </div>
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="file-upload-list">
          <h3>Selected Files ({files.length})</h3>
          {files.map((fileWithStatus, index) => (
            <div key={index} className="file-item">
              <div className="file-item-content">
                <div className="file-item-info">
                  <div className="file-item-main">
                    <span className="file-item-name" title={fileWithStatus.file.name}>
                      {fileWithStatus.file.name}
                    </span>
                    {fileWithStatus.fileType && (
                      <span className={`file-item-type type-${fileWithStatus.fileType}`}>
                        {fileWithStatus.fileType === 'node' ? (
                          <>
                            <NodeIcon size={12} />
                            <span>Node</span>
                          </>
                        ) : (
                          <>
                            <RelationshipIcon size={12} />
                            <span>Relationship</span>
                          </>
                        )}
                        {fileWithStatus.labelOrType && ` (${fileWithStatus.labelOrType})`}
                      </span>
                    )}
                  </div>
                  <div className="file-item-meta">
                    <span className="file-item-size">
                      {(fileWithStatus.file.size / 1024).toFixed(2)} KB
                    </span>
                    <span className={`file-item-status status-${fileWithStatus.status}`}>
                      {fileWithStatus.status}
                    </span>
                  </div>
                </div>
                
                {/* Remove Button */}
                {fileWithStatus.status !== 'processing' && (
                  <button
                    className="file-item-remove"
                    onClick={() => removeFile(index)}
                    disabled={isUploading}
                    aria-label="Remove file"
                    title="Remove file"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Progress Bar */}
              {fileWithStatus.taskId && (
                <TaskProgress
                  taskId={fileWithStatus.taskId}
                  onComplete={() => {
                    setFiles((prev) =>
                      prev.map((f, i) =>
                        i === index ? { ...f, status: 'completed' } : f
                      )
                    );
                  }}
                  onError={(error) => {
                    setFiles((prev) =>
                      prev.map((f, i) =>
                        i === index ? { ...f, status: 'error', error } : f
                      )
                    );
                  }}
                />
              )}

              {/* Validation Error */}
              {fileWithStatus.validationError && (
                <div className="file-item-error file-item-validation-error">
                  <strong>Validation Error:</strong> {fileWithStatus.validationError}
                </div>
              )}
              
              {/* Upload/Processing Error */}
              {fileWithStatus.error && !fileWithStatus.validationError && (
                <div className="file-item-error">{fileWithStatus.error}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Upload Button */}
      <div className="file-upload-actions">
        <button
          className="btn btn-primary"
          onClick={handleUpload}
          disabled={files.length === 0 || isUploading}
        >
          <UploadIcon size={16} />
          <span>{isUploading ? 'Uploading...' : `Upload ${files.length} File${files.length !== 1 ? 's' : ''}`}</span>
        </button>
        {files.length > 0 && (
          <button
            className="btn btn-secondary"
            onClick={() => {
              setFiles([]);
              setDatasetName('');
              setDescription('');
            }}
            disabled={isUploading}
          >
            Clear All
          </button>
        )}
      </div>
    </div>
  );
};

export default FileUpload;

