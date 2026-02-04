/**
 * Dataset API service
 */
import apiClient from './api';
import type { Dataset, UploadTask } from '@/types';

export const datasetsApi = {
  /**
   * Upload CSV files
   */
  uploadFiles: async (files: File[], datasetName?: string, description?: string) => {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append('files', file);
    });
    if (datasetName) formData.append('dataset_name', datasetName);
    if (description) formData.append('dataset_description', description);

    const response = await apiClient.post<Dataset>('/datasets/upload/', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  /**
   * Get all datasets
   */
  getDatasets: async () => {
    const response = await apiClient.get<Dataset[]>('/datasets/');
    return response.data;
  },

  /**
   * Get dataset by ID
   */
  getDataset: async (id: number) => {
    const response = await apiClient.get<Dataset>(`/datasets/${id}/`);
    return response.data;
  },

  /**
   * Get dataset metadata
   */
  getDatasetMetadata: async (id: number) => {
    const response = await apiClient.get(`/datasets/${id}/metadata/`);
    return response.data;
  },

  /**
   * Download dataset files
   */
  downloadDataset: async (
    id: number, 
    options?: {
      fileType?: 'node' | 'relationship';
      nodeLabel?: string;
      relationshipType?: string;
      asZip?: boolean;
    }
  ) => {
    const params = new URLSearchParams();
    if (options?.fileType) params.append('file_type', options.fileType);
    if (options?.nodeLabel) params.append('node_label', options.nodeLabel);
    if (options?.relationshipType) params.append('relationship_type', options.relationshipType);
    // Only pass as_zip if explicitly requested (for "Download All" buttons)
    // Single file downloads (nodeLabel/relationshipType) should not force zip
    if (options?.asZip) params.append('as_zip', 'true');
    
    const url = `/datasets/${id}/download/${params.toString() ? '?' + params.toString() : ''}`;
    const response = await apiClient.get(url, {
      responseType: 'blob',
    });
    // Return both blob and headers to extract filename
    return {
      blob: response.data,
      headers: response.headers,
    };
  },

  /**
   * Delete dataset
   */
  deleteDataset: async (id: number) => {
    const response = await apiClient.delete(`/datasets/${id}/delete/`);
    return response.data;
  },

  /**
   * Get task status
   */
  getTaskStatus: async (id: number) => {
    const response = await apiClient.get<UploadTask>(`/datasets/tasks/${id}/`);
    return response.data;
  },
};

