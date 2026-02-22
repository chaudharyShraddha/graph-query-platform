/**
 * Query Results Component.
 * 
 * Displays query execution results in both table and JSON formats
 * with sorting, pagination, and export functionality.
 */
import { useState, useMemo, type ReactNode } from 'react';
import { DownloadIcon, CopyIcon } from '@/components/Icons/Icons';
import { toast } from '@/utils/toast';
import { ROWS_PER_PAGE } from '@/constants';
import './QueryResults.css';

interface QueryResultsProps {
  results: any[];
  executionTime?: number;
  rowsReturned?: number;
  error?: string | null;
}

type ViewMode = 'table' | 'json';

const QueryResults = ({ results, executionTime, error }: QueryResultsProps) => {
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [expandedJsonPaths, setExpandedJsonPaths] = useState<Set<string>>(new Set());

  // Get column names from first result
  const columns = useMemo(() => {
    if (!results || results.length === 0) return [];
    return Object.keys(results[0]);
  }, [results]);

  // Sort results
  const sortedResults = useMemo(() => {
    if (!sortColumn || !results) return results;
    
    return [...results].sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];
      
      // Handle null/undefined values - always put them at the end
      const aIsNull = aVal === null || aVal === undefined;
      const bIsNull = bVal === null || bVal === undefined;
      
      if (aIsNull && bIsNull) return 0;
      if (aIsNull) return 1;
      if (bIsNull) return -1;
      
      // Handle boolean values
      if (typeof aVal === 'boolean' && typeof bVal === 'boolean') {
        return sortDirection === 'asc' 
          ? (aVal === bVal ? 0 : aVal ? 1 : -1)
          : (aVal === bVal ? 0 : aVal ? -1 : 1);
      }
      
      // Handle numeric values
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }
      
      // Handle dates (if they're strings that look like dates)
      const aDate = new Date(aVal);
      const bDate = new Date(bVal);
      if (!isNaN(aDate.getTime()) && !isNaN(bDate.getTime()) && 
          typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc'
          ? aDate.getTime() - bDate.getTime()
          : bDate.getTime() - aDate.getTime();
      }
      
      // Handle strings and other types
      const aStr = String(aVal);
      const bStr = String(bVal);
      
      return sortDirection === 'asc'
        ? aStr.localeCompare(bStr, undefined, { numeric: true, sensitivity: 'base' })
        : bStr.localeCompare(aStr, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [results, sortColumn, sortDirection]);

  // Paginated results
  const paginatedResults = useMemo(() => {
    const start = (currentPage - 1) * ROWS_PER_PAGE;
    const end = start + ROWS_PER_PAGE;
    return sortedResults.slice(start, end);
  }, [sortedResults, currentPage]);

  const totalPages = Math.ceil((results?.length || 0) / ROWS_PER_PAGE);

  // Handle column sort
  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (!results || results.length === 0) return;

    const csvRows: string[] = [];
    
    // Header
    csvRows.push(columns.map(col => `"${col}"`).join(','));

    // Data rows
    results.forEach((row) => {
      const values = columns.map((col) => {
        const value = row[col];
        if (value === null || value === undefined) return '';
        if (typeof value === 'boolean') return value ? 'true' : 'false';
        if (typeof value === 'object') {
          return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
        }
        return `"${String(value).replace(/"/g, '""')}"`;
      });
      csvRows.push(values.join(','));
    });

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `query-results-${new Date().toISOString()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Format value for display
  const formatValue = (value: any): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  };

  // Check if value is object/array
  const isComplexValue = (value: any): boolean => {
    return typeof value === 'object' && value !== null;
  };

  // Copy JSON to clipboard
  const handleCopyJSON = () => {
    const jsonString = JSON.stringify(results, null, 2);
    navigator.clipboard.writeText(jsonString).then(() => {
      toast.success('JSON copied to clipboard', 'Success');
    }).catch(() => {
      toast.error('Failed to copy JSON', 'Error');
    });
  };

  // Toggle JSON path expansion
  const toggleJsonPath = (path: string) => {
    const newExpanded = new Set(expandedJsonPaths);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedJsonPaths(newExpanded);
  };

  // Render JSON with collapsible nested objects
  const renderJSONValue = (value: any, path: string = '', depth: number = 0): ReactNode => {
    if (value === null) {
      return <span className="json-null">null</span>;
    }
    if (value === undefined) {
      return <span className="json-undefined">undefined</span>;
    }
    if (typeof value === 'boolean') {
      return <span className="json-boolean">{value ? 'true' : 'false'}</span>;
    }
    if (typeof value === 'number') {
      return <span className="json-number">{value}</span>;
    }
    if (typeof value === 'string') {
      return <span className="json-string">"{value}"</span>;
    }
    if (Array.isArray(value)) {
      const isExpanded = expandedJsonPaths.has(path);
      return (
        <div className="json-array">
          <span
            className="json-toggle"
            onClick={() => toggleJsonPath(path)}
            style={{ cursor: 'pointer', userSelect: 'none' }}
          >
            {isExpanded ? '▼' : '▶'} [
          </span>
          {isExpanded ? (
            <>
              <div style={{ marginLeft: `${(depth + 1) * 20}px` }}>
                {value.map((item, idx) => (
                  <div key={idx}>
                    {renderJSONValue(item, `${path}[${idx}]`, depth + 1)}
                    {idx < value.length - 1 && <span>,</span>}
                  </div>
                ))}
              </div>
              <span style={{ marginLeft: `${depth * 20}px` }}>]</span>
            </>
          ) : (
            <span>...{value.length} items]</span>
          )}
        </div>
      );
    }
    if (typeof value === 'object') {
      const isExpanded = expandedJsonPaths.has(path);
      const keys = Object.keys(value);
      return (
        <div className="json-object">
          <span
            className="json-toggle"
            onClick={() => toggleJsonPath(path)}
            style={{ cursor: 'pointer', userSelect: 'none' }}
          >
            {isExpanded ? '▼' : '▶'} {'{'}
          </span>
          {isExpanded ? (
            <>
              <div style={{ marginLeft: `${(depth + 1) * 20}px` }}>
                {keys.map((key, idx) => (
                  <div key={key}>
                    <span className="json-key">"{key}"</span>: {renderJSONValue(value[key], `${path}.${key}`, depth + 1)}
                    {idx < keys.length - 1 && <span>,</span>}
                  </div>
                ))}
              </div>
              <span style={{ marginLeft: `${depth * 20}px` }}>{'}'}</span>
            </>
          ) : (
            <span>...{keys.length} keys{'}'}</span>
          )}
        </div>
      );
    }
    return <span>{String(value)}</span>;
  };

  if (error) {
    return (
      <div className="query-results">
        <div className="results-header">
          <h3>Results</h3>
        </div>
        <div className="query-error">
          <span className="error-icon">⚠</span>
          <div className="error-content">
            <span className="error-title">Query Execution Error</span>
            <span className="error-message">{error}</span>
          </div>
        </div>
      </div>
    );
  }

  if (!results || results.length === 0) {
    return (
      <div className="query-results">
        <div className="results-header">
          <h3>Results</h3>
        </div>
        <div className="empty-results">
          <p>No results returned</p>
        </div>
      </div>
    );
  }

  return (
    <div className="query-results">
      <div className="results-header">
        <div className="results-header-left">
          <h3>Results</h3>
          {executionTime !== undefined && (
            <div className="execution-stats">
              <span className="stat-item">
                <strong>{results.length.toLocaleString()}</strong> rows
              </span>
              {executionTime !== undefined && (
                <span className="stat-item">
                  <strong>{executionTime.toFixed(2)}</strong>s
                </span>
              )}
            </div>
          )}
        </div>
        <div className="results-header-actions">
          <div className="view-mode-toggle">
            <button
              className={`view-mode-btn ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
            >
              Table
            </button>
            <button
              className={`view-mode-btn ${viewMode === 'json' ? 'active' : ''}`}
              onClick={() => setViewMode('json')}
            >
              JSON
            </button>
          </div>
          {viewMode === 'json' && (
            <button className="btn btn-sm btn-secondary" onClick={handleCopyJSON}>
              <CopyIcon size={14} />
              <span>Copy JSON</span>
            </button>
          )}
          <button className="btn btn-sm btn-secondary" onClick={handleExportCSV}>
            <DownloadIcon size={14} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {viewMode === 'table' ? (
        <div className="results-table-container">
          <table className="results-table">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th
                    key={column}
                    onClick={() => handleSort(column)}
                    className={sortColumn === column ? `sortable sorted-${sortDirection}` : 'sortable'}
                  >
                    {column}
                    {sortColumn === column && (
                      <span className="sort-indicator">
                        {sortDirection === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedResults.map((row, idx) => {
                const globalIndex = (currentPage - 1) * ROWS_PER_PAGE + idx;
                return (
                  <tr key={globalIndex}>
                    {columns.map((column) => {
                      const value = row[column];
                      const isComplex = isComplexValue(value);
                      return (
                        <td key={column} className={isComplex ? 'complex-value' : ''}>
                          {isComplex ? (
                            <details>
                              <summary className="complex-summary">
                                {Array.isArray(value) ? `Array[${value.length}]` : 'Object'}
                              </summary>
                              <pre className="complex-content">{formatValue(value)}</pre>
                            </details>
                          ) : (
                            formatValue(value)
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="results-pagination">
              <button
                className="pagination-btn"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </button>
              <span className="pagination-info">
                Page {currentPage} of {totalPages} ({results.length.toLocaleString()} total rows)
              </span>
              <button
                className="pagination-btn"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Next
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="results-json-container">
          <div className="json-view">
            {results.map((result, idx) => (
              <div key={idx} className="json-item">
                {renderJSONValue(result, `result[${idx}]`, 0)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default QueryResults;

