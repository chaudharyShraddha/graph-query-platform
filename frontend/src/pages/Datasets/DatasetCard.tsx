/**
 * Dataset Card Component - Click anywhere to open detail page.
 */
import { memo, useCallback } from 'react';
import type { Dataset } from '@/types';
import './DatasetCard.css';

interface DatasetCardProps {
  dataset: Dataset;
  viewMode: 'grid' | 'list';
  onView: () => void;
}

const DatasetCard = memo(({ dataset, viewMode, onView }: DatasetCardProps) => {
  const handleCardKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onView();
      }
    },
    [onView]
  );

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

  const statusClass = `status-${dataset.status}`;

  if (viewMode === 'list') {
    return (
      <div
        className={`dataset-card list-view ${statusClass}`}
        onClick={onView}
        onKeyDown={handleCardKeyDown}
        role="button"
        tabIndex={0}
        aria-label={`View dataset ${dataset.name}`}
      >
        <div className="dataset-card-main">
          <div className="dataset-card-header">
            <h3 className="dataset-title">{dataset.name}</h3>
            <span
              className="dataset-status"
              style={{ color: getStatusColor(dataset.status) }}
            >
              {dataset.status}
            </span>
          </div>
          <div className="dataset-stats">
            <span>{dataset.total_nodes ?? 0} nodes</span>
            <span>{dataset.total_relationships ?? 0} relationships</span>
            <span>{dataset.total_files ?? 0} files</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`dataset-card grid-view ${statusClass}`}
      onClick={onView}
      onKeyDown={handleCardKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`View dataset ${dataset.name}`}
    >
      <div className="dataset-card-header">
        <h3 className="dataset-title">{dataset.name}</h3>
        <span
          className="dataset-status"
          style={{ color: getStatusColor(dataset.status) }}
        >
          {dataset.status}
        </span>
      </div>

      <div className="dataset-options">
        {dataset.cascade_delete && (
          <span className="cascade-badge">Cascade Delete</span>
        )}
      </div>

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
          {new Date(dataset.created_at).toLocaleDateString()}
        </span>
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

