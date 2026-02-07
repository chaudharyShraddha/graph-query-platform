/**
 * Datasets Dashboard Page.
 * 
 * Main page for managing datasets with upload, view, download, and delete functionality.
 * Includes filtering, search, and real-time progress tracking.
 */
import { useEffect, useState, useMemo, useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { fetchDatasets, deleteDataset, setCurrentDataset } from '@/store/slices/datasetsSlice';
import { datasetsApi } from '@/services/datasets';
import { toast } from '@/utils/toast';
import { UploadIcon, RefreshIcon } from '@/components/Icons/Icons';
import FileUpload from '@/components/FileUpload/FileUpload';
import DatasetCard from './DatasetCard';
import DatasetDetailsModal from './DatasetDetailsModal';
import './DatasetsPage.css';

const DatasetsPage = () => {
  const dispatch = useAppDispatch();
  const { datasets, loading, error } = useAppSelector((state) => state.datasets);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [viewMode] = useState<'grid' | 'list'>('grid');
  const [selectedDataset, setSelectedDataset] = useState<number | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [openFromUpload, setOpenFromUpload] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch datasets on mount only
  useEffect(() => {
    dispatch(fetchDatasets());
  }, [dispatch]);

  // Handle refresh
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await dispatch(fetchDatasets()).unwrap();
      toast.success('Datasets refreshed successfully');
    } catch (error) {
      // Error handled by API interceptor
    } finally {
      setIsRefreshing(false);
    }
  }, [dispatch]);

  // Filter datasets - memoized to prevent recalculation on every render
  const filteredDatasets = useMemo(() => {
    return datasets.filter((dataset) => {
      const matchesSearch =
        searchQuery === '' ||
        dataset.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        dataset.description?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = statusFilter === 'all' || dataset.status === statusFilter;

      // Date filter
      let matchesDate = true;
      if (dateFilter !== 'all') {
        const datasetDate = new Date(dataset.created_at);
        const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const lastWeek = new Date(today);
      lastWeek.setDate(lastWeek.getDate() - 7);
      const lastMonth = new Date(today);
      lastMonth.setMonth(lastMonth.getMonth() - 1);

      switch (dateFilter) {
        case 'today':
          matchesDate = datasetDate >= today;
          break;
        case 'yesterday':
          matchesDate = datasetDate >= yesterday && datasetDate < today;
          break;
        case 'week':
          matchesDate = datasetDate >= lastWeek;
          break;
        case 'month':
          matchesDate = datasetDate >= lastMonth;
          break;
        default:
          matchesDate = true;
      }
    }

    return matchesSearch && matchesStatus && matchesDate;
    });
  }, [datasets, searchQuery, statusFilter, dateFilter]);


  // Handle dataset deletion
  const handleDelete = async (datasetId: number) => {
    if (window.confirm('Are you sure you want to delete this dataset?')) {
      try {
        await dispatch(deleteDataset(datasetId)).unwrap();
        toast.success('Dataset deleted successfully');
      } catch (error: any) {
        toast.error(
          error.message || 'Failed to delete dataset',
          'Delete Error'
        );
      }
    }
  };

  // Handle download
  const handleDownload = async (
    datasetId: number, 
    options?: {
      fileType?: 'node' | 'relationship';
      nodeLabel?: string;
      relationshipType?: string;
      asZip?: boolean;
    }
  ) => {
    try {
      // If no options provided (card view "Download All"), force ZIP download
      const downloadOptions = options || { asZip: true };
      const { blob, headers } = await datasetsApi.downloadDataset(datasetId, downloadOptions);
      const dataset = datasets.find((d) => d.id === datasetId);
      
      // Extract filename from Content-Disposition header if available
      let filename: string | null = null;
      const contentDisposition = headers['content-disposition'] || headers['Content-Disposition'];
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1].replace(/['"]/g, '');
        }
      }
      
      // Fallback to default filename if not found in headers
      if (!filename) {
        // Check if it's a single file download (nodeLabel or relationshipType without asZip)
        const isSingleFile = (downloadOptions?.nodeLabel || downloadOptions?.relationshipType) && !downloadOptions?.asZip;
        
        if (isSingleFile) {
          // Single file - use the file name directly
          if (downloadOptions?.nodeLabel) {
            filename = `${downloadOptions.nodeLabel}.csv`;
          } else if (downloadOptions?.relationshipType) {
            filename = `${downloadOptions.relationshipType}.csv`;
          }
        } else {
          // Multiple files or forced zip - use zip extension
          filename = `${dataset?.name}_dataset.zip`;
          if (downloadOptions?.nodeLabel) {
            filename = `${dataset?.name}_${downloadOptions.nodeLabel}.zip`;
          } else if (downloadOptions?.relationshipType) {
            filename = `${dataset?.name}_${downloadOptions.relationshipType}.zip`;
          } else if (downloadOptions?.fileType) {
            filename = `${dataset?.name}_${downloadOptions.fileType}s.zip`;
          }
        }
      }

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || 'dataset.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success('Dataset downloaded successfully');
    } catch (error: any) {
      toast.error(
        error.message || 'Failed to download dataset',
        'Download Error'
      );
    }
  };

  // Handle view dataset - memoized to prevent card re-renders
  const handleViewDataset = useCallback((datasetId: number, fromUpload: boolean = false) => {
    setOpenFromUpload(fromUpload);
    setSelectedDataset(datasetId);
  }, []);

  // Handle upload complete
  const handleUploadComplete = (datasetId: number) => {
    setShowUpload(false);
    dispatch(fetchDatasets());
    dispatch(setCurrentDataset(datasets.find((d) => d.id === datasetId) || null));
    handleViewDataset(datasetId, true); // Mark that modal is opening from upload
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
          <button className="btn btn-primary" onClick={() => setShowUpload(!showUpload)}>
            <UploadIcon size={16} />
            {showUpload ? 'Cancel' : 'Upload Dataset'}
          </button>
        </div>
      </div>

      {/* Upload Section */}
      {showUpload && (
        <div className="datasets-upload-section">
          <FileUpload
            onUploadComplete={handleUploadComplete}
            onUploadError={(error) => {
              toast.error(error, 'Upload Error');
            }}
          />
        </div>
      )}

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
            <button className="btn btn-primary" onClick={() => setShowUpload(true)}>
              Upload Dataset
            </button>
          )}
        </div>
      )}

      {!loading && filteredDatasets.length > 0 && (
        <div className={`datasets-container ${viewMode}`}>
          {filteredDatasets.map((dataset) => (
            <DatasetCard
              key={dataset.id}
              dataset={dataset}
              viewMode={viewMode}
              onView={() => handleViewDataset(dataset.id, false)}
              onDownload={handleDownload}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Dataset Details Modal */}
      {selectedDataset && (
        <DatasetDetailsModal
          datasetId={selectedDataset}
          onClose={() => {
            setSelectedDataset(null);
            setOpenFromUpload(false); // Reset flag when closing
          }}
          onDownload={handleDownload}
          onDelete={handleDelete}
          openFromUpload={openFromUpload}
        />
      )}
    </div>
  );
};

export default DatasetsPage;

