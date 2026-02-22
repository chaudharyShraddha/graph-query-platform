/** Dataset detail: stats, nodes/relationships tabs, node sample, download, delete. */
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { fetchDataset, deleteDataset, updateDataset } from '@/store/slices/datasetsSlice';
import { datasetsApi } from '@/services/datasets';
import { toast } from '@/utils/toast';
import { BackIcon, DownloadIcon, DeleteIcon, NodeIcon, RelationshipIcon, UploadIcon } from '@/components/Icons/Icons';
import './DatasetDetailsPage.css';

const DatasetDetailsPage = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const datasetId = id ? parseInt(id) : null;
  const dispatch = useAppDispatch();
  const dataset = useAppSelector((state) => {
    if (state.datasets.currentDataset?.id === datasetId) return state.datasets.currentDataset;
    return state.datasets.datasets.find(d => d.id === datasetId) ?? state.datasets.currentDataset;
  });
  const loadingDataset = useAppSelector((state) => state.datasets.loading);
  const [activeTab, setActiveTab] = useState<'nodes' | 'relationships' | 'files'>('nodes');
  const [nodesPage, setNodesPage] = useState(1);
  const [relationshipsPage, setRelationshipsPage] = useState(1);
  const [expandedNodeLabel, setExpandedNodeLabel] = useState<string | null>(null);
  const [nodeSampleCache, setNodeSampleCache] = useState<Record<string, { columns: string[]; rows: Record<string, unknown>[] }>>({});
  const [loadingSampleLabel, setLoadingSampleLabel] = useState<string | null>(null);
  const PAGE_SIZE = 5;

  useEffect(() => {
    if (datasetId) dispatch(fetchDataset({ id: datasetId, includeMetadata: true }));
  }, [datasetId, dispatch]);

  useEffect(() => {
    if (!dataset || !datasetId) return;
    const hasProcessingTasks = dataset.upload_tasks?.some(
      (t) => t.status === 'processing' || t.status === 'pending'
    );
    if (hasProcessingTasks) {
      const interval = setInterval(() => {
        dispatch(fetchDataset({ id: datasetId, includeMetadata: true }));
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [dataset?.upload_tasks, datasetId, dispatch]);

  useEffect(() => {
    if (!expandedNodeLabel || !datasetId || nodeSampleCache[expandedNodeLabel]) return;
    setLoadingSampleLabel(expandedNodeLabel);
    datasetsApi
      .getNodeSample(datasetId, expandedNodeLabel, 5)
      .then((data) => {
        setNodeSampleCache((prev) => ({ ...prev, [expandedNodeLabel!]: { columns: data.columns, rows: data.rows } }));
      })
      .catch(() => {
        setNodeSampleCache((prev) => ({ ...prev, [expandedNodeLabel!]: { columns: [], rows: [] } }));
      })
      .finally(() => setLoadingSampleLabel(null));
  }, [expandedNodeLabel, datasetId]);

  const handleDownload = async (options?: {
    fileType?: 'node' | 'relationship';
    nodeLabel?: string;
    relationshipType?: string;
    asZip?: boolean;
  }) => {
    if (!datasetId) return;
    try {
      const { blob, headers } = await datasetsApi.downloadDataset(datasetId, options);
      
      let filename: string | null = null;
      const contentDisposition = headers['content-disposition'] || headers['Content-Disposition'];
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1].replace(/['"]/g, '');
        }
      }
      
      if (!filename) {
        if (options?.nodeLabel) {
          filename = `${options.nodeLabel}.csv`;
        } else if (options?.relationshipType) {
          filename = `${options.relationshipType}.csv`;
        } else {
          filename = `${dataset?.name}_dataset.zip`;
        }
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success('Dataset downloaded successfully');
    } catch (error: any) {
      toast.error(error.message || 'Failed to download dataset', 'Download Error');
    }
  };

  const handleDelete = async () => {
    if (!datasetId) return;
    if (window.confirm('Are you sure you want to delete this dataset?')) {
      try {
        await dispatch(deleteDataset(datasetId)).unwrap();
        toast.success('Dataset deleted successfully');
        navigate('/datasets');
      } catch (error: any) {
        toast.error(error.message || 'Failed to delete dataset', 'Delete Error');
      }
    }
  };

  // From simplified API: node_summary and relationship_summary
  const nodeSummary = dataset?.node_summary ?? [];
  const relationshipSummary = dataset?.relationship_summary ?? [];
  const nodeLabelsList = nodeSummary.map((n) => n.name);
  const relationshipTypesList = relationshipSummary.map((r) => r.name);
  const nodeCountsMap = useMemo(
    () => Object.fromEntries(nodeSummary.map((n) => [n.name, n.total_rows])),
    [nodeSummary]
  );
  const relationshipCountsMap = useMemo(
    () => Object.fromEntries(relationshipSummary.map((r) => [r.name, r.total_rows])),
    [relationshipSummary]
  );

  if (!datasetId) {
    return (
      <div className="dataset-details-page">
        <div className="error-state">
          <h2>Invalid Dataset ID</h2>
          <button onClick={() => navigate('/datasets')} className="btn btn-primary">
            Back to Datasets
          </button>
        </div>
      </div>
    );
  }

  if (!dataset) {
    return (
      <div className="dataset-details-page">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading dataset...</p>
        </div>
      </div>
    );
  }

  const summary = dataset.summary;
  const tasks = dataset.upload_tasks || [];
  const totalFiles = summary?.total_files ?? tasks.length;
  const successFiles = summary?.success_files ?? tasks.filter((t) => t.status === 'completed').length;
  const failedFiles = summary?.failed_files ?? tasks.filter((t) => t.status === 'failed').length;
  // Total Nodes / Total Relationships = count of nodes and relationships in the graph (from metadata), not CSV row counts
  const totalNodes =
    nodeSummary.length > 0
      ? nodeSummary.reduce((sum, n) => sum + (n.total_rows ?? 0), 0)
      : (summary?.total_nodes ?? dataset.total_nodes ?? 0);
  const totalRelationships =
    relationshipSummary.length > 0
      ? relationshipSummary.reduce((sum, r) => sum + (r.total_rows ?? 0), 0)
      : (summary?.total_relationships ?? dataset.total_relationships ?? 0);

  return (
    <div className="dataset-details-page">
      <div className="details-back-row">
        <button type="button" onClick={() => navigate('/datasets')} className="details-back">
          <BackIcon size={14} />
          Datasets
        </button>
      </div>
      <header className="details-row details-row-1">
        <div className="details-header-main">
          <div className="details-header-left">
            <h1 className="details-title">{dataset.name}</h1>
            <p className={`details-desc ${!dataset.description ? 'details-desc-empty' : ''}`}>
              {dataset.description || 'No description'}
            </p>
            <label className="details-cascade-option">
              <input
                type="checkbox"
                checked={dataset.cascade_delete ?? false}
                onChange={async (e) => {
                  const newValue = e.target.checked;
                  if (!datasetId) return;
                  try {
                    await dispatch(updateDataset({ id: datasetId, cascade_delete: newValue })).unwrap();
                    await dispatch(fetchDataset({ id: datasetId, includeMetadata: true }));
                    toast.success(newValue ? 'Cascade delete enabled' : 'Cascade delete disabled');
                  } catch (err: any) {
                    toast.error(err?.message || 'Failed to update cascade delete option');
                  }
                }}
              />
              <span>Delete cascade</span>
            </label>
          </div>
          <div className="details-header-actions">
            <button type="button" onClick={() => handleDownload()} className="btn-icon" title="Download All">
              <DownloadIcon size={20} />
            </button>
            <button type="button" onClick={handleDelete} className="btn-icon btn-icon-danger" title="Delete">
              <DeleteIcon size={20} />
            </button>
            <button className="btn btn-primary" onClick={() => navigate(`/datasets/${datasetId}/upload-nodes`)}>
              <NodeIcon size={16} />
              Upload Nodes
            </button>
            <button className="btn btn-primary" onClick={() => navigate(`/datasets/${datasetId}/upload-relationships`)}>
              <RelationshipIcon size={16} />
              Upload Relationships
            </button>
          </div>
        </div>
      </header>

      {/* Row 2: Statistics */}
      <div className="details-row details-stats-row">
        <div className="stat-item">
          <span className="stat-label">Total Nodes</span>
          <span className="stat-value">{totalNodes.toLocaleString()}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Total Relationships</span>
          <span className="stat-value">{totalRelationships.toLocaleString()}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Total Files Uploaded</span>
          <span className="stat-value">{totalFiles.toLocaleString()}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Success Files</span>
          <span className="stat-value">{successFiles.toLocaleString()}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Failed Files</span>
          <span className="stat-value">{failedFiles.toLocaleString()}</span>
        </div>
      </div>

      {/* Row 3: Tabs + content */}
      <div className="details-row details-body">
        <div className="tabs">
          <button
            className={`tab ${activeTab === 'nodes' ? 'active' : ''}`}
            onClick={() => setActiveTab('nodes')}
          >
            Nodes ({nodeLabelsList.length})
          </button>
          <button
            className={`tab ${activeTab === 'relationships' ? 'active' : ''}`}
            onClick={() => setActiveTab('relationships')}
          >
            Relationships ({relationshipTypesList.length})
          </button>
          <button
            className={`tab ${activeTab === 'files' ? 'active' : ''}`}
            onClick={() => setActiveTab('files')}
          >
            Files ({totalFiles})
          </button>
        </div>

        <div className="tab-content">
        {activeTab === 'nodes' && (
          <div className="nodes-tab">
            {loadingDataset ? (
              <div className="loading-state">
                <div className="spinner"></div>
                <p>Loading...</p>
              </div>
            ) : nodeLabelsList.length > 0 ? (
              <>
                <div className="entries-table-wrap entries-table-card">
                  <table className="entries-table">
                    <thead>
                      <tr>
                        <th>Node name</th>
                        <th>Entries</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {nodeLabelsList
                        .slice((nodesPage - 1) * PAGE_SIZE, nodesPage * PAGE_SIZE)
                        .map((label) => {
                          const isExpanded = expandedNodeLabel === label;
                          const cached = nodeSampleCache[label];
                          const sampleRows = cached?.rows ?? [];
                          const columns = cached?.columns ?? [];
                          const loadingSample = loadingSampleLabel === label;
                          return (
                            <Fragment key={label}>
                              <tr
                                className={`entries-row-clickable ${isExpanded ? 'entries-row-expanded' : ''}`}
                                onClick={() => setExpandedNodeLabel(isExpanded ? null : label)}
                              >
                                <td>
                                  <span className="entry-name">
                                    <NodeIcon size={16} />
                                    {label}
                                    <span className="entry-expand-icon" aria-hidden>{isExpanded ? '▼' : '▶'}</span>
                                  </span>
                                </td>
                                <td className="entries-count">{(nodeCountsMap[label] ?? 0).toLocaleString()}</td>
                                <td onClick={(e) => e.stopPropagation()}>
                                  <button
                                    onClick={() => handleDownload({ fileType: 'node', nodeLabel: label })}
                                    className="btn btn-sm btn-secondary"
                                  >
                                    <DownloadIcon size={14} />
                                    Download
                                  </button>
                                </td>
                              </tr>
                              {isExpanded && (
                                <tr key={`${label}-detail`} className="entries-detail-row">
                                  <td colSpan={3} className="entries-detail-cell">
                                    <div className="entries-inner-table-wrap">
                                      {loadingSample ? (
                                        <div className="loading-state">
                                          <div className="spinner"></div>
                                          <p>Loading sample...</p>
                                        </div>
                                      ) : sampleRows.length > 0 && columns.length > 0 ? (
                                        <table className="entries-table entries-inner-table">
                                          <thead>
                                            <tr>
                                              {columns.map((col) => (
                                                <th key={col}>{col}</th>
                                              ))}
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {sampleRows.map((row, idx) => (
                                              <tr key={idx}>
                                                {columns.map((col) => (
                                                  <td key={col}>{row[col] != null ? String(row[col]) : '—'}</td>
                                                ))}
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      ) : (
                                        <p className="node-sample-empty">No sample data available.</p>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
                {nodeLabelsList.length > PAGE_SIZE && (
                  <div className="entries-pagination">
                    <button
                      className="btn btn-sm btn-secondary"
                      disabled={nodesPage <= 1}
                      onClick={() => setNodesPage((p) => p - 1)}
                    >
                      Previous
                    </button>
                    <span className="entries-page-info">
                      Page {nodesPage} of {Math.ceil(nodeLabelsList.length / PAGE_SIZE)}
                    </span>
                    <button
                      className="btn btn-sm btn-secondary"
                      disabled={nodesPage >= Math.ceil(nodeLabelsList.length / PAGE_SIZE)}
                      onClick={() => setNodesPage((p) => p + 1)}
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            ) : (
              <p className="empty-message">No nodes found</p>
            )}
          </div>
        )}

        {activeTab === 'relationships' && (
          <div className="relationships-tab">
            {loadingDataset ? (
              <div className="loading-state">
                <div className="spinner"></div>
                <p>Loading...</p>
              </div>
            ) : relationshipTypesList.length > 0 ? (
              <>
                <div className="entries-table-wrap entries-table-card">
                  <table className="entries-table">
                    <thead>
                      <tr>
                        <th>Relationship</th>
                        <th>Entries</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {relationshipTypesList
                        .slice((relationshipsPage - 1) * PAGE_SIZE, relationshipsPage * PAGE_SIZE)
                        .map((type) => (
                          <tr key={type}>
                            <td>
                              <span className="entry-name">
                                <RelationshipIcon size={16} />
                                {type}
                              </span>
                            </td>
                            <td className="entries-count">{(relationshipCountsMap[type] ?? 0).toLocaleString()}</td>
                            <td>
                              <button
                                onClick={() => handleDownload({ fileType: 'relationship', relationshipType: type })}
                                className="btn btn-sm btn-secondary"
                              >
                                <DownloadIcon size={14} />
                                Download
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                {relationshipTypesList.length > PAGE_SIZE && (
                  <div className="entries-pagination">
                    <button
                      className="btn btn-sm btn-secondary"
                      disabled={relationshipsPage <= 1}
                      onClick={() => setRelationshipsPage((p) => p - 1)}
                    >
                      Previous
                    </button>
                    <span className="entries-page-info">
                      Page {relationshipsPage} of {Math.ceil(relationshipTypesList.length / PAGE_SIZE)}
                    </span>
                    <button
                      className="btn btn-sm btn-secondary"
                      disabled={relationshipsPage >= Math.ceil(relationshipTypesList.length / PAGE_SIZE)}
                      onClick={() => setRelationshipsPage((p) => p + 1)}
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            ) : (
              <p className="empty-message">No relationships found</p>
            )}
          </div>
        )}

        {activeTab === 'files' && (
          <div className="files-tab">
            {tasks.length > 0 ? (
              <>
                <div className="files-table-wrap entries-table-card">
                  <table className="entries-table files-table">
                    <thead>
                      <tr>
                        <th>File name</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th>Failure reason</th>
                        <th>Uploaded date & time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tasks.map((task) => (
                        <tr key={task.id}>
                          <td className="file-name-cell">{task.file_name}</td>
                          <td>
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
                          </td>
                          <td>
                            <span className={`file-status badge-${task.status}`}>
                              {task.status === 'completed' ? 'Complete' : task.status === 'failed' ? 'Failed' : task.status}
                            </span>
                          </td>
                          <td className="file-reason-cell">
                            {task.status === 'failed' && task.error_message
                              ? task.error_message
                              : '—'}
                          </td>
                          <td className="file-date-cell">
                            {new Date(task.created_at).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="empty-state">
                <p>No files uploaded yet</p>
                <div className="empty-state-hint">
                  <button
                    className="btn btn-primary"
                    onClick={() => navigate(`/datasets/${datasetId}/upload-nodes`)}
                  >
                    <UploadIcon size={16} />
                    Add Node Files
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={() => navigate(`/datasets/${datasetId}/upload-relationships`)}
                  >
                    <UploadIcon size={16} />
                    Add Relationship Files
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        </div>
      </div>

    </div>
  );
};

export default DatasetDetailsPage;
