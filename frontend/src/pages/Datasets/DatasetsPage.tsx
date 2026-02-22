/** Datasets list: search, filters, pagination, view detail. */
import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { fetchDatasets } from '@/store/slices/datasetsSlice';
import { toast } from '@/utils/toast';
import type { Dataset } from '@/types';
import { UploadIcon, RefreshIcon } from '@/components/Icons/Icons';
import DatasetCard from './DatasetCard';
import './DatasetsPage.css';

const DatasetsPage = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { datasets, loading, error } = useAppSelector((state) => state.datasets);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [viewMode] = useState<'grid' | 'list'>('grid');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(12);

  useEffect(() => {
    dispatch(fetchDatasets());
  }, [dispatch]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, statusFilter, dateFilter]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await dispatch(fetchDatasets()).unwrap();
      toast.success('Datasets refreshed successfully');
    } catch {
      // Error shown by API interceptor
    } finally {
      setIsRefreshing(false);
    }
  }, [dispatch]);

  const filteredDatasets = useMemo(() => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = (d: Dataset) =>
      !q || d.name.toLowerCase().includes(q) || (d.description?.toLowerCase() ?? '').includes(q);
    const matchesStatus = (d: Dataset) =>
      statusFilter === 'all' || d.status === statusFilter;

    let dateBound = 0;
    if (dateFilter !== 'all') {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      if (dateFilter === 'today') dateBound = today;
      else if (dateFilter === 'yesterday') dateBound = today - 86400000;
      else if (dateFilter === 'week') dateBound = today - 7 * 86400000;
      else if (dateFilter === 'month') dateBound = today - 30 * 86400000;
    }

    const matchesDate = (d: Dataset) => {
      if (dateFilter === 'all') return true;
      const t = new Date(d.created_at).getTime();
      if (dateFilter === 'yesterday') return t >= dateBound && t < dateBound + 86400000;
      return t >= dateBound;
    };

    return datasets.filter((d) => matchesSearch(d) && matchesStatus(d) && matchesDate(d));
  }, [datasets, searchQuery, statusFilter, dateFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredDatasets.length / pageSize));
  const paginatedDatasets = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredDatasets.slice(start, start + pageSize);
  }, [filteredDatasets, page, pageSize]);

  const handleViewDataset = useCallback((datasetId: number) => {
    navigate(`/datasets/${datasetId}`);
  }, [navigate]);

  const handleCreateDataset = () => {
    navigate('/datasets/create');
  };

  return (
    <div className="datasets-page">
      <div className="datasets-header">
        <div>
          <h1>Datasets</h1>
          <p>Manage your graph database datasets</p>
        </div>
        <div className="datasets-header-actions">
          <button 
            className="btn btn-secondary" 
            onClick={handleRefresh}
            disabled={isRefreshing || loading}
            title="Refresh datasets"
          >
            <RefreshIcon size={16} className={isRefreshing ? 'spinning' : ''} />
            <span>Refresh</span>
          </button>
          <button className="btn btn-primary" onClick={handleCreateDataset}>
            <UploadIcon size={16} />
            Create Dataset
          </button>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="datasets-controls">
        <div className="datasets-search">
          <input
            type="text"
            placeholder="Search datasets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>

        <div className="datasets-filters">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>

          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Dates</option>
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="week">Last 7 Days</option>
            <option value="month">Last 30 Days</option>
          </select>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="error-message">
          <span>{error}</span>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading datasets...</p>
        </div>
      )}

      {/* Datasets Grid/List */}
      {!loading && filteredDatasets.length === 0 && (
        <div className="empty-state">
          <h3>No datasets found</h3>
          <p>
            {datasets.length === 0
              ? 'Get started by uploading your first dataset'
              : 'Try adjusting your search or filter criteria'}
          </p>
          {datasets.length === 0 && (
            <button className="btn btn-primary" onClick={handleCreateDataset}>
              Create Dataset
            </button>
          )}
        </div>
      )}

      {!loading && filteredDatasets.length > 0 && (
        <>
          <div className={`datasets-container ${viewMode}`}>
            {paginatedDatasets.map((dataset) => (
              <DatasetCard
                key={dataset.id}
                dataset={dataset}
                viewMode={viewMode}
                onView={() => handleViewDataset(dataset.id)}
              />
            ))}
          </div>
          {totalPages > 1 && (
            <nav className="datasets-pagination" aria-label="Datasets pagination">
              <span className="pagination-info">
                {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, filteredDatasets.length)} of {filteredDatasets.length}
              </span>
              <div className="pagination-controls">
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-label="Previous page"
                >
                  Previous
                </button>
                <span className="pagination-page">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  aria-label="Next page"
                >
                  Next
                </button>
              </div>
            </nav>
          )}
        </>
      )}
    </div>
  );
};

export default DatasetsPage;

