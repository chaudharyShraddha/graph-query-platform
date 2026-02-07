/**
 * Query History Component
 */
import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { fetchQueryHistory } from '@/store/slices/queriesSlice';
import { HistoryIcon } from '@/components/Icons/Icons';
import type { QueryExecution } from '@/types';
import './QueryHistory.css';

interface QueryHistoryProps {
  onSelectQuery?: (query: string) => void;
  maxItems?: number;
}

const QueryHistory = ({ onSelectQuery, maxItems = 20 }: QueryHistoryProps) => {
  const dispatch = useAppDispatch();
  const { history, loading } = useAppSelector((state) => state.queries);

  useEffect(() => {
    dispatch(fetchQueryHistory());
  }, [dispatch]);

  const displayHistory = history.slice(0, maxItems);

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const truncateQuery = (query: string, maxLength: number = 80) => {
    if (query.length <= maxLength) return query;
    return query.substring(0, maxLength) + '...';
  };

  if (loading) {
    return (
      <div className="query-history">
        <div className="query-history-header">
          <HistoryIcon size={16} />
          <h3>Query History</h3>
        </div>
        <div className="query-history-loading">Loading history...</div>
      </div>
    );
  }

  if (!history || history.length === 0) {
    return (
      <div className="query-history">
        <div className="query-history-header">
          <HistoryIcon size={16} />
          <h3>Query History</h3>
        </div>
        <div className="query-history-empty">No query history yet</div>
      </div>
    );
  }

  return (
    <div className="query-history">
      <div className="query-history-header">
        <HistoryIcon size={16} />
        <h3>Query History</h3>
        <span className="history-count">{history.length}</span>
      </div>
      <div className="query-history-list">
        {displayHistory.map((execution: QueryExecution) => (
          <div
            key={execution.id}
            className={`history-item ${execution.status === 'error' ? 'error' : ''}`}
            onClick={() => onSelectQuery?.(execution.cypher_query)}
          >
            <div className="history-item-header">
              <span className="history-status" data-status={execution.status}>
                {execution.status === 'success' ? '✓' : execution.status === 'error' ? '✗' : '⏱'}
              </span>
              <span className="history-time">{formatTime(execution.executed_at)}</span>
            </div>
            <div className="history-query">{truncateQuery(execution.cypher_query)}</div>
            {execution.status === 'success' && (
              <div className="history-meta">
                {execution.rows_returned !== undefined && (
                  <span className="history-meta-item">
                    {execution.rows_returned.toLocaleString()} rows
                  </span>
                )}
                {execution.execution_time !== undefined && (
                  <span className="history-meta-item">
                    {execution.execution_time.toFixed(2)}s
                  </span>
                )}
              </div>
            )}
            {execution.status === 'error' && execution.error_message && (
              <div className="history-error">{execution.error_message}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default QueryHistory;

