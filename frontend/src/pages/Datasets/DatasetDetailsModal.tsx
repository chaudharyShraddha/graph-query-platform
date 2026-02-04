/**
 * Professional Dataset Details Modal
 */
import { useEffect, useState } from 'react';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { fetchDatasets } from '@/store/slices/datasetsSlice';
import { datasetsApi } from '@/services/datasets';
import { toast } from '@/utils/toast';
import { CloseIcon, DownloadIcon, DeleteIcon, NodeIcon, RelationshipIcon } from '@/components/Icons/Icons';
import './DatasetDetailsModal.css';

interface DatasetDetailsModalProps {
  datasetId: number | null;
  onClose: () => void;
  onDownload: (datasetId: number, options?: {
    fileType?: 'node' | 'relationship';
    nodeLabel?: string;
    relationshipType?: string;
    asZip?: boolean;
  }) => void;
  onDelete: (datasetId: number) => void;
  openFromUpload?: boolean;
}

const DatasetDetailsModal = ({ datasetId, onClose, onDownload, onDelete, openFromUpload = false }: DatasetDetailsModalProps) => {
  const dispatch = useAppDispatch();
  const datasets = useAppSelector((state) => state.datasets.datasets);
  const [dataset, setDataset] = useState(datasets.find((d) => d.id === datasetId));
  const [metadata, setMetadata] = useState<any>(null);
  const [loadingMetadata, setLoadingMetadata] = useState(false);
  const [loadingDataset, setLoadingDataset] = useState(false);
  // Set initial tab: 'files' if opened from upload, 'overview' if opened from card
  const [activeTab, setActiveTab] = useState<'overview' | 'schema' | 'files'>(openFromUpload ? 'files' : 'overview');

  const loadDatasetDetails = async () => {
    if (!datasetId) return;
    setLoadingDataset(true);
    try {
      const data = await datasetsApi.getDataset(datasetId);
      setDataset(data);
      // Don't fetch all datasets - only update the current dataset in Redux if needed
      // This prevents unnecessary re-renders of all cards
    } catch (error) {
      // Error handled by API interceptor
    } finally {
      setLoadingDataset(false);
    }
  };

  const loadMetadata = async () => {
    if (!datasetId) return;
    setLoadingMetadata(true);
    try {
      const data = await datasetsApi.getDatasetMetadata(datasetId);
      setMetadata(data);
    } catch (error) {
      // Error handled by API interceptor
    } finally {
      setLoadingMetadata(false);
    }
  };

  useEffect(() => {
    if (datasetId) {
      loadDatasetDetails();
      loadMetadata();
      // Reset tab when dataset changes: 'files' if from upload, 'overview' if from card
      setActiveTab(openFromUpload ? 'files' : 'overview');
    }
  }, [datasetId, openFromUpload]);

  // Auto-refresh dataset details if there are processing tasks
  useEffect(() => {
    if (!dataset || !datasetId) return;
    
    const hasProcessingTasks = dataset.upload_tasks?.some(
      (t) => t.status === 'processing' || t.status === 'pending'
    );
    
    if (hasProcessingTasks) {
      const interval = setInterval(() => {
        loadDatasetDetails();
      }, 3000);
      
      return () => clearInterval(interval);
    }
  }, [dataset?.upload_tasks, datasetId]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && datasetId) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [datasetId, onClose]);

  if (!datasetId) return null;

  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this dataset? This action cannot be undone.')) {
      onDelete(datasetId);
      onClose();
    }
  };

  return (
    <div className="dataset-modal-overlay" onClick={onClose}>
      <div className="dataset-modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="dataset-modal-header">
          <div className="dataset-modal-header-content">
            <h2 className="dataset-modal-title">{dataset?.name || 'Loading...'}</h2>
            {dataset && (
              <span className={`status-badge badge-${dataset.status}`}>
                {dataset.status}
              </span>
            )}
          </div>
          <button className="dataset-modal-close" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        {/* Tabs */}
        <div className="dataset-modal-tabs">
          <button
            className={`dataset-modal-tab ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            Overview
          </button>
          <button
            className={`dataset-modal-tab ${activeTab === 'schema' ? 'active' : ''}`}
            onClick={() => setActiveTab('schema')}
          >
            Schema
          </button>
          <button
            className={`dataset-modal-tab ${activeTab === 'files' ? 'active' : ''}`}
            onClick={() => setActiveTab('files')}
          >
            Files ({dataset?.upload_tasks?.length || 0})
          </button>
        </div>

        {/* Content */}
        <div className="dataset-modal-content">
          {loadingDataset && !dataset ? (
            <div className="dataset-modal-loading">
              <div className="spinner"></div>
              <p>Loading dataset details...</p>
            </div>
          ) : !dataset ? (
            <div className="dataset-modal-error">Failed to load dataset</div>
          ) : (
            <>
              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <div className="dataset-modal-section">
                  {dataset.description && (
                    <div className="info-section">
                      <label>Description</label>
                      <p>{dataset.description}</p>
                    </div>
                  )}

                  <div className="info-section">
                    <label>Statistics</label>
                    <div className="stats-grid">
                      <div className="stat-card">
                        <div className="stat-content">
                          <div className="stat-value">{dataset.total_nodes.toLocaleString()}</div>
                          <div className="stat-label">Nodes</div>
                        </div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-content">
                          <div className="stat-value">{dataset.total_relationships.toLocaleString()}</div>
                          <div className="stat-label">Relationships</div>
                        </div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-content">
                          <div className="stat-value">{dataset.total_files}</div>
                          <div className="stat-label">Files</div>
                        </div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-content">
                          <div className="stat-value">{dataset.processed_files}</div>
                          <div className="stat-label">Processed</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="info-section">
                    <label>Timeline</label>
                    <div className="timeline">
                      <span>Created: {new Date(dataset.created_at).toLocaleString()}</span>
                      <span>•</span>
                      <span>Updated: {new Date(dataset.updated_at).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Schema Tab */}
              {activeTab === 'schema' && (
                <div className="dataset-modal-section">
                  {loadingMetadata ? (
                    <div className="dataset-modal-loading">
                      <div className="spinner"></div>
                      <p>Loading schema...</p>
                    </div>
                  ) : metadata ? (
                    <>
                      <div className="schema-section">
                        <h3>Node Labels</h3>
                        {metadata.node_labels && Object.keys(metadata.node_labels).length > 0 ? (
                          <div className="schema-list">
                            {Object.entries(metadata.node_labels).map(([label, data]: [string, any]) => (
                              <div key={label} className="schema-item">
                                <div className="schema-item-header">
                                  <div className="schema-item-title">
                                    <span className="schema-label">{label}</span>
                                    <span className="schema-count">{data.count?.toLocaleString() || 0} nodes</span>
                                  </div>
                                  <button
                                    className="btn btn-sm btn-secondary"
                                    onClick={() => {
                                      onDownload(datasetId, { nodeLabel: label });
                                      toast.success(`Downloading ${label} nodes...`);
                                    }}
                                  >
                                    <DownloadIcon size={14} />
                                  </button>
                                </div>
                                {data.properties && data.properties.length > 0 && (
                                  <div className="schema-properties">
                                    <strong>Properties:</strong>
                                    <div className="property-tags">
                                      {data.properties.map((prop: string) => (
                                        <span key={prop} className="property-tag">{prop}</span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {metadata.sample_data && metadata.sample_data[label] && metadata.sample_data[label].length > 0 && (
                                  <div className="schema-sample">
                                    <strong>Sample Data (first {Math.min(metadata.sample_data[label].length, 10)} rows):</strong>
                                    <div className="sample-data-table">
                                      <table>
                                        <thead>
                                          <tr>
                                            {Object.keys(metadata.sample_data[label][0]?.n || {}).map((key) => (
                                              <th key={key}>{key}</th>
                                            ))}
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {metadata.sample_data[label].slice(0, 10).map((row: any, idx: number) => (
                                            <tr key={idx}>
                                              {Object.values(row.n || {}).map((val: any, i: number) => (
                                                <td key={i}>{String(val)}</td>
                                              ))}
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="empty-state">No node labels found</p>
                        )}
                      </div>

                      <div className="schema-section">
                        <h3>Relationship Types</h3>
                        {metadata.relationship_types && Object.keys(metadata.relationship_types).length > 0 ? (
                          <div className="schema-list">
                            {Object.entries(metadata.relationship_types).map(([type, data]: [string, any]) => (
                              <div key={type} className="schema-item">
                                <div className="schema-item-header">
                                  <div className="schema-item-title">
                                    <span className="schema-label">{type}</span>
                                    <span className="schema-count">{data.count?.toLocaleString() || 0} relationships</span>
                                  </div>
                                  <button
                                    className="btn btn-sm btn-secondary"
                                    onClick={() => {
                                      onDownload(datasetId, { relationshipType: type });
                                      toast.success(`Downloading ${type} relationships...`);
                                    }}
                                  >
                                    <DownloadIcon size={14} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="empty-state">No relationship types found</p>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="dataset-modal-error">Failed to load schema</div>
                  )}
                </div>
              )}

              {/* Files Tab */}
              {activeTab === 'files' && (
                <div className="dataset-modal-section">
                  {dataset.upload_tasks && dataset.upload_tasks.length > 0 ? (
                    <div className="files-list">
                      {dataset.upload_tasks.map((task) => (
                        <div key={task.id} className="file-card">
                          <div className="file-card-header">
                            <div className="file-card-title">
                              <span className="file-name">{task.file_name}</span>
                              <span className={`file-type-badge type-${task.file_type}`}>
                                {task.file_type === 'node' ? (
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
                              </span>
                              <span className={`file-status badge-${task.status}`}>
                                {task.status}
                              </span>
                            </div>
                          </div>
                          
                          <div className="file-card-body">
                            {task.status === 'processing' && task.progress_percentage !== undefined && (
                              <div className="file-progress">
                                <div className="progress-bar">
                                  <div
                                    className="progress-fill"
                                    style={{ width: `${task.progress_percentage}%` }}
                                  />
                                </div>
                                <span className="progress-text">{Math.round(task.progress_percentage)}%</span>
                              </div>
                            )}

                            <div className="file-info-row">
                              {task.processed_rows !== undefined && task.total_rows !== undefined && (
                                <span className="file-stats">
                                  Rows: {task.processed_rows.toLocaleString()} / {task.total_rows.toLocaleString()}
                                </span>
                              )}
                              <span className="file-meta">
                                Uploaded: {new Date(task.created_at).toLocaleString()}
                                {task.completed_at && (
                                  <> • Completed: {new Date(task.completed_at).toLocaleString()}</>
                                )}
                              </span>
                            </div>

                            {task.error_message && (
                              <div className="file-error">
                                <span className="file-error-icon">⚠</span>
                                <span className="file-error-message">{task.error_message}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-state">
                      <p>No files uploaded yet</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="dataset-modal-footer">
          <div className="dataset-modal-footer-actions">
            <button className="btn btn-secondary" onClick={() => onDownload(datasetId, { asZip: true })}>
              <DownloadIcon size={16} />
              <span>Download All</span>
            </button>
            <button className="btn btn-danger" onClick={handleDelete}>
              <DeleteIcon size={16} />
              <span>Delete</span>
            </button>
          </div>
          <button className="btn btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default DatasetDetailsModal;

