/**
 * Dataset Details Modal
 */
import { useEffect, useState } from 'react';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { fetchDatasets } from '@/store/slices/datasetsSlice';
import { datasetsApi } from '@/services/datasets';
import './DatasetModal.css';

interface DatasetModalProps {
  datasetId: number;
  onClose: () => void;
  onDownload: (datasetId: number, options?: {
    fileType?: 'node' | 'relationship';
    nodeLabel?: string;
    relationshipType?: string;
    asZip?: boolean;
  }) => void;
  onDelete: (datasetId: number) => void;
}

const DatasetModal = ({ datasetId, onClose, onDownload, onDelete }: DatasetModalProps) => {
  const dispatch = useAppDispatch();
  const datasets = useAppSelector((state) => state.datasets.datasets);
  const [dataset, setDataset] = useState(datasets.find((d) => d.id === datasetId));
  const [metadata, setMetadata] = useState<any>(null);
  const [loadingMetadata, setLoadingMetadata] = useState(false);
  const [loadingDataset, setLoadingDataset] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'metadata' | 'tasks'>('details');

  const loadDatasetDetails = async () => {
    setLoadingDataset(true);
    try {
      const data = await datasetsApi.getDataset(datasetId);
      setDataset(data);
      
      // Refresh the datasets list to update the Redux store with latest status
      // This ensures the card shows the correct status
      dispatch(fetchDatasets());
    } catch (error) {
      // Error handled by API interceptor
    } finally {
      setLoadingDataset(false);
    }
  };

  const loadMetadata = async () => {
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
    if (!dataset) return;
    
    const hasProcessingTasks = dataset.upload_tasks?.some(
      (t) => t.status === 'processing' || t.status === 'pending'
    );
    
    if (hasProcessingTasks) {
      const interval = setInterval(() => {
        loadDatasetDetails();
      }, 3000); // Refresh every 3 seconds
      
      return () => clearInterval(interval);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset?.upload_tasks, datasetId]);

  if (!dataset) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="loading">Loading dataset...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{dataset.name}</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-tabs">
          <button
            className={`tab ${activeTab === 'details' ? 'active' : ''}`}
            onClick={() => setActiveTab('details')}
          >
            Details
          </button>
          <button
            className={`tab ${activeTab === 'metadata' ? 'active' : ''}`}
            onClick={() => setActiveTab('metadata')}
          >
            Metadata
          </button>
          <button
            className={`tab ${activeTab === 'tasks' ? 'active' : ''}`}
            onClick={() => setActiveTab('tasks')}
          >
            Tasks ({dataset.upload_tasks?.length || 0})
          </button>
        </div>

        <div className="modal-body">
          {activeTab === 'details' && (
            <div className="modal-section">
              <div className="detail-group">
                <label>Status</label>
                <span className={`status-badge status-${dataset.status}`}>
                  {dataset.status}
                </span>
              </div>
              {dataset.description && (
                <div className="detail-group">
                  <label>Description</label>
                  <p>{dataset.description}</p>
                </div>
              )}
              <div className="detail-group">
                <label>Statistics</label>
                <div className="stats-grid">
                  <div className="stat-box">
                    <span className="stat-label">Total Nodes</span>
                    <span className="stat-value">{dataset.total_nodes}</span>
                  </div>
                  <div className="stat-box">
                    <span className="stat-label">Total Relationships</span>
                    <span className="stat-value">{dataset.total_relationships}</span>
                  </div>
                  <div className="stat-box">
                    <span className="stat-label">Total Files</span>
                    <span className="stat-value">{dataset.total_files}</span>
                  </div>
                  <div className="stat-box">
                    <span className="stat-label">Processed Files</span>
                    <span className="stat-value">{dataset.processed_files}</span>
                  </div>
                </div>
              </div>
              <div className="detail-group">
                <label>Created</label>
                <p>{new Date(dataset.created_at).toLocaleString()}</p>
              </div>
              <div className="detail-group">
                <label>Last Updated</label>
                <p>{new Date(dataset.updated_at).toLocaleString()}</p>
              </div>
              <div className="detail-group">
                <label>Download Options</label>
                <div className="download-options">
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => onDownload(datasetId, { asZip: true })}
                  >
                    Download All Files (ZIP)
                  </button>
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => onDownload(datasetId, { fileType: 'node', asZip: true })}
                  >
                    Download All Nodes (ZIP)
                  </button>
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => onDownload(datasetId, { fileType: 'relationship', asZip: true })}
                  >
                    Download All Relationships (ZIP)
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'metadata' && (
            <div className="modal-section">
              {loadingMetadata ? (
                <div className="loading">Loading metadata...</div>
              ) : metadata ? (
                <>
                  <div className="metadata-section">
                    <h3>Node Labels</h3>
                    {metadata.node_labels && Object.keys(metadata.node_labels).length > 0 ? (
                      <div className="metadata-list">
                        {Object.entries(metadata.node_labels).map(([label, data]: [string, any]) => (
                          <div key={label} className="metadata-item">
                            <div className="metadata-item-header">
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span className="metadata-label">{label}</span>
                                <span className="metadata-count">{data.count || 0} nodes</span>
                              </div>
                              <button
                                className="btn btn-sm btn-secondary"
                                onClick={() => onDownload(datasetId, { nodeLabel: label })}
                                title={`Download ${label}.csv`}
                              >
                                Download
                              </button>
                            </div>
                            {data.properties && data.properties.length > 0 && (
                              <div className="metadata-properties">
                                <strong>Properties:</strong> {data.properties.join(', ')}
                              </div>
                            )}
                            {metadata.sample_data && metadata.sample_data[label] && metadata.sample_data[label].length > 0 && (
                              <div className="metadata-sample">
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
                      <p className="empty-message">No node labels found</p>
                    )}
                  </div>
                  <div className="metadata-section">
                    <h3>Relationship Types</h3>
                    {metadata.relationship_types && Object.keys(metadata.relationship_types).length > 0 ? (
                      <div className="metadata-list">
                        {Object.entries(metadata.relationship_types).map(([type, data]: [string, any]) => (
                          <div key={type} className="metadata-item">
                            <div className="metadata-item-header">
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span className="metadata-label">{type}</span>
                                <span className="metadata-count">{data.count || 0} relationships</span>
                              </div>
                              <button
                                className="btn btn-sm btn-secondary"
                                onClick={() => onDownload(datasetId, { relationshipType: type })}
                                title={`Download ${type}.csv`}
                              >
                                Download
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="empty-message">No relationship types found</p>
                    )}
                  </div>
                  <div className="metadata-section">
                    <h3>Upload History</h3>
                    {dataset.upload_tasks && dataset.upload_tasks.length > 0 ? (
                      <div className="upload-history">
                        {dataset.upload_tasks.map((task) => (
                          <div key={task.id} className="history-item">
                            <div className="history-item-header">
                              <span className="history-file">{task.file_name}</span>
                              <span className={`history-status status-${task.status}`}>{task.status}</span>
                            </div>
                            <div className="history-item-details">
                              <span>Type: {task.file_type}</span>
                              {task.node_label && <span>Label: {task.node_label}</span>}
                              {task.relationship_type && <span>Type: {task.relationship_type}</span>}
                              <span>
                                Uploaded: {new Date(task.created_at).toLocaleString()}
                                {task.completed_at && (
                                  <> • Completed: {new Date(task.completed_at).toLocaleString()}</>
                                )}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="empty-message">No upload history available</p>
                    )}
                  </div>
                </>
              ) : (
                <div className="error-message">Failed to load metadata</div>
              )}
            </div>
          )}

          {activeTab === 'tasks' && (
            <div className="modal-section">
              {loadingDataset ? (
                <div className="loading">Loading tasks...</div>
              ) : dataset.upload_tasks && dataset.upload_tasks.length > 0 ? (
                <div className="tasks-list">
                  {dataset.upload_tasks.map((task) => (
                    <div key={task.id} className="task-item">
                      <div className="task-header">
                        <span className="task-name">{task.file_name}</span>
                        <span className={`task-status status-${task.status}`}>
                          {task.status}
                        </span>
                      </div>
                      <div className="task-info">
                        <span>Type: {task.file_type}</span>
                        {task.progress_percentage !== undefined && (
                          <span>Progress: {task.progress_percentage.toFixed(1)}%</span>
                        )}
                        {task.processed_rows !== undefined && task.total_rows !== undefined && (
                          <span>Rows: {task.processed_rows} / {task.total_rows}</span>
                        )}
                        {task.error_message && (
                          <div className="task-error">{task.error_message}</div>
                        )}
                      </div>
                      {task.status === 'processing' && task.progress_percentage !== undefined && (
                        <div className="task-progress-bar">
                          <div
                            className="task-progress-bar-fill"
                            style={{ width: `${task.progress_percentage}%` }}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-message">No tasks found</p>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => onDownload(datasetId, { asZip: true })}>
            Download All
          </button>
          <button className="btn btn-danger" onClick={() => onDelete(datasetId)}>
            Delete Dataset
          </button>
          <button className="btn btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default DatasetModal;

