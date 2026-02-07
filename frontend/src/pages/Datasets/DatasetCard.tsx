/**
 * Dataset Card Component
 */
import { useState, memo } from 'react';
import type { Dataset } from '@/types';
import { ViewIcon, DownloadIcon, DeleteIcon, MoreDotsIcon } from '@/components/Icons/Icons';
import './DatasetCard.css';

interface DatasetCardProps {
  dataset: Dataset;
  viewMode: 'grid' | 'list';
  onView: () => void;
  onDownload: (
    datasetId: number,
    options?: {
      fileType?: 'node' | 'relationship';
      nodeLabel?: string;
      relationshipType?: string;
      asZip?: boolean;
    }
  ) => void;
  onDelete: (datasetId: number) => void;
}

const DatasetCard = memo(({ dataset, viewMode, onView, onDownload, onDelete }: DatasetCardProps) => {
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return '#2e7d32';
      case 'processing':
        return '#7c3aed';
      case 'failed':
        return '#c62828';
      default:
        return '#666';
    }
  };

  const getStatusIcon = (status: string) => {
    return '';
  };

  if (viewMode === 'list') {
    return (
      <div className="dataset-card list-view">
        <div className="dataset-card-main">
          <div className="dataset-card-header">
            <h3 onClick={onView} className="dataset-title">
              {dataset.name}
            </h3>
            <span
              className="dataset-status"
              style={{ color: getStatusColor(dataset.status) }}
            >
              {dataset.status}
            </span>
          </div>
          {dataset.description && (
            <p className="dataset-description">{dataset.description}</p>
          )}
          <div className="dataset-stats">
            <span>{dataset.total_nodes ?? 0} nodes</span>
            <span>{dataset.total_relationships ?? 0} relationships</span>
            <span>{dataset.total_files ?? 0} files</span>
          </div>
        </div>
        <div className="dataset-card-actions">
          <div className="actions-menu-container">
            <button
              className="btn btn-sm btn-actions-menu"
              onClick={() => setShowActionsMenu(!showActionsMenu)}
              title="More actions"
              aria-label="More actions"
            >
              <MoreDotsIcon size={20} />
            </button>
            {showActionsMenu && (
              <>
                <div className="actions-menu-overlay" onClick={() => setShowActionsMenu(false)} />
                <div className="actions-menu">
                  <button className="actions-menu-item" onClick={() => { onView(); setShowActionsMenu(false); }}>
                    <ViewIcon size={16} />
                    <span>View Details</span>
                  </button>
                  <button className="actions-menu-item" onClick={() => { onDownload(dataset.id); setShowActionsMenu(false); }}>
                    <DownloadIcon size={16} />
                    <span>Download All</span>
                  </button>
                  <button className="actions-menu-item" onClick={() => { onDelete(dataset.id); setShowActionsMenu(false); }}>
                    <DeleteIcon size={16} />
                    <span>Delete</span>
                  </button>
                </div>
              </>
            )}
          </div>
          <button className="btn btn-sm btn-primary" onClick={onView}>
            <ViewIcon size={16} />
            <span>View Details</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="dataset-card grid-view">
      <div className="dataset-card-header">
        <h3 onClick={onView} className="dataset-title">
          {dataset.name}
        </h3>
        <span
          className="dataset-status"
          style={{ color: getStatusColor(dataset.status) }}
        >
          {dataset.status}
        </span>
      </div>

      {dataset.description && (
        <p className="dataset-description">{dataset.description}</p>
      )}

      <div className="dataset-stats">
        <div className="stat-item">
          <span className="stat-label">Nodes</span>
          <span className="stat-value">{dataset.total_nodes ?? 0}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Relationships</span>
          <span className="stat-value">{dataset.total_relationships ?? 0}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Files</span>
          <span className="stat-value">{dataset.total_files ?? 0}</span>
        </div>
      </div>

      <div className="dataset-card-footer">
        <span className="dataset-date">
          Created: {new Date(dataset.created_at).toLocaleDateString()}
        </span>
      </div>

      <div className="dataset-card-actions">
        <div className="actions-menu-container">
          <button
            className="btn btn-sm btn-actions-menu"
            onClick={() => setShowActionsMenu(!showActionsMenu)}
            title="More actions"
            aria-label="More actions"
            >
              <MoreDotsIcon size={20} />
            </button>
          {showActionsMenu && (
            <>
              <div className="actions-menu-overlay" onClick={() => setShowActionsMenu(false)} />
              <div className="actions-menu">
                <button className="actions-menu-item" onClick={() => { onView(); setShowActionsMenu(false); }}>
                  <ViewIcon size={16} />
                  <span>View Details</span>
                </button>
                <button className="actions-menu-item" onClick={() => { onDownload(dataset.id); setShowActionsMenu(false); }}>
                  <DownloadIcon size={16} />
                  <span>Download All</span>
                </button>
                <button className="actions-menu-item" onClick={() => { onDelete(dataset.id); setShowActionsMenu(false); }}>
                  <DeleteIcon size={16} />
                  <span>Delete</span>
                </button>
              </div>
            </>
          )}
        </div>
        <button className="btn btn-sm btn-primary" onClick={onView}>
          <ViewIcon size={16} />
          <span>View Details</span>
        </button>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Only re-render if dataset data actually changes
  return (
    prevProps.dataset.id === nextProps.dataset.id &&
    prevProps.dataset.name === nextProps.dataset.name &&
    prevProps.dataset.status === nextProps.dataset.status &&
    prevProps.dataset.total_nodes === nextProps.dataset.total_nodes &&
    prevProps.dataset.total_relationships === nextProps.dataset.total_relationships &&
    prevProps.dataset.total_files === nextProps.dataset.total_files &&
    prevProps.dataset.description === nextProps.dataset.description &&
    prevProps.dataset.created_at === nextProps.dataset.created_at &&
    prevProps.viewMode === nextProps.viewMode
  );
});

DatasetCard.displayName = 'DatasetCard';

export default DatasetCard;

