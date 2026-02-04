/**
 * Dataset Details Side Panel
 */
import { useEffect, useState } from 'react';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { fetchDatasets } from '@/store/slices/datasetsSlice';
import { datasetsApi } from '@/services/datasets';
import './DatasetPanel.css';

interface DatasetPanelProps {
  datasetId: number | null;
  onClose: () => void;
  onDownload: (datasetId: number, options?: {
    fileType?: 'node' | 'relationship';
    nodeLabel?: string;
    relationshipType?: string;
    asZip?: boolean;
  }) => void;
  onDelete: (datasetId: number) => void;
}

const DatasetPanel = ({ datasetId, onClose, onDownload, onDelete }: DatasetPanelProps) => {
  const dispatch = useAppDispatch();
  const datasets = useAppSelector((state) => state.datasets.datasets);
  const [dataset, setDataset] = useState(datasets.find((d) => d.id === datasetId));
  const [metadata, setMetadata] = useState<any>(null);
  const [loadingMetadata, setLoadingMetadata] = useState(false);
  const [loadingDataset, setLoadingDataset] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'metadata' | 'files'>('overview');

  const loadDatasetDetails = async () => {
    if (!datasetId) return;
    setLoadingDataset(true);
    try {
      const data = await datasetsApi.getDataset(datasetId);
      setDataset(data);
      dispatch(fetchDatasets());
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetId]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset?.upload_tasks, datasetId]);

  if (!datasetId) return null;

  return (
    <>
      <div className="panel-overlay" onClick={onClose} />
      <div className="dataset-panel">
        {/* Header */}
        <div className="panel-header">
          <div className="panel-header-content">
            <h2>{dataset?.name || 'Loading...'}</h2>
            {dataset && (
              <span className={`status-badge status-${dataset.status}`}>
                {dataset.status}
              </span>
            )}
          </div>
          <button className="panel-close" onClick={onClose} aria-label="Close panel">
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="panel-tabs">
          <button
            className={`panel-tab ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            Overview
          </button>
          <button
            className={`panel-tab ${activeTab === 'metadata' ? 'active' : ''}`}
            onClick={() => setActiveTab('metadata')}
          >
            Schema
          </button>
          <button
            className={`panel-tab ${activeTab === 'files' ? 'active' : ''}`}
            onClick={() => setActiveTab('files')}
          >
            Files ({dataset?.upload_tasks?.length || 0})
          </button>
        </div>

        {/* Content */}
        <div className="panel-content">
          {loadingDataset && !dataset ? (
            <div className="panel-loading">
              <div className="spinner"></div>
              <p>Loading dataset...</p>
            </div>
          ) : !dataset ? (
            <div className="panel-error">Failed to load dataset</div>
          ) : (
            <>
              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <div className="panel-section">
                  {dataset.description && (
                    <div className="info-group">
                      <label>Description</label>
                      <p>{dataset.description}</p>
                    </div>
                  )}

                  <div className="info-group">
                    <label>Statistics</label>
                    <div className="stats-grid">
                      <div className="stat-card">
                        <div className="stat-icon">📊</div>
                        <div className="stat-content">
                          <div className="stat-value">{dataset.total_nodes.toLocaleString()}</div>
                          <div className="stat-label">Nodes</div>
                        </div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-icon">🔗</div>
                        <div className="stat-content">
                          <div className="stat-value">{dataset.total_relationships.toLocaleString()}</div>
                          <div className="stat-label">Relationships</div>
                        </div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-icon">📁</div>
                        <div className="stat-content">
                          <div className="stat-value">{dataset.total_files}</div>
                          <div className="stat-label">Files</div>
                        </div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-icon">✓</div>
                        <div className="stat-content">
                          <div className="stat-value">{dataset.processed_files}</div>
                          <div className="stat-label">Processed</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="info-group">
                    <label>Timeline</label>
                    <div className="timeline">
                      <span>Created: {new Date(dataset.created_at).toLocaleString()}</span>
                      <span>•</span>
                      <span>Updated: {new Date(dataset.updated_at).toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="info-group">
                    <label>Quick Actions</label>
                    <div className="action-buttons-grid">
                      <button
                        className="btn btn-primary"
                        onClick={() => onDownload(datasetId, { asZip: true })}
                      >
                        ⬇️ Download All
                      </button>
                      <button
                        className="btn btn-secondary"
                        onClick={() => onDownload(datasetId, { fileType: 'node', asZip: true })}
                      >
                        📊 Download Nodes
                      </button>
                      <button
                        className="btn btn-secondary"
                        onClick={() => onDownload(datasetId, { fileType: 'relationship', asZip: true })}
                      >
                        🔗 Download Relationships
                      </button>
                      <button
                        className="btn btn-danger"
                        onClick={() => {
                          if (window.confirm('Are you sure you want to delete this dataset?')) {
                            onDelete(datasetId);
                            onClose();
                          }
                        }}
                      >
                        🗑️ Delete Dataset
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Metadata Tab */}
              {activeTab === 'metadata' && (
                <div className="panel-section">
                  {loadingMetadata ? (
                    <div className="panel-loading">
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
                                    onClick={() => onDownload(datasetId, { nodeLabel: label })}
                                  >
                                    ⬇️
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
                                    onClick={() => onDownload(datasetId, { relationshipType: type })}
                                  >
                                    ⬇️
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
                    <div className="panel-error">Failed to load schema</div>
                  )}
                </div>
              )}

              {/* Files Tab */}
              {activeTab === 'files' && (
                <div className="panel-section">
                  {dataset.upload_tasks && dataset.upload_tasks.length > 0 ? (
                    <div className="files-list">
                      {dataset.upload_tasks.map((task) => (
                        <div key={task.id} className="file-card">
                          <div className="file-card-header">
                            <div className="file-card-title">
                              <span className="file-name">{task.file_name}</span>
                              <span className={`file-type-badge type-${task.file_type}`}>
                                {task.file_type === 'node' ? '📊 Node' : '🔗 Relationship'}
                              </span>
                              <span className={`file-status status-${task.status}`}>
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
      </div>
    </>
  );
};

export default DatasetPanel;

