/** Dataset API: CRUD, upload nodes/relationships, download, task status. */
import apiClient from './api';
import type { Dataset, UploadNodesOrRelationshipsResponse, UploadTask } from '@/types';

export const datasetsApi = {
  createDataset: async (name: string, description?: string, cascadeDelete?: boolean) => {
    const response = await apiClient.post<Dataset>('/datasets/create/', {
      name,
      description: description || '',
      cascade_delete: cascadeDelete || false,
    });
    return response.data;
  },

  updateDataset: async (id: number, data: { name?: string; description?: string; cascade_delete?: boolean }) => {
    const response = await apiClient.put<Dataset>(`/datasets/${id}/`, data);
    return response.data;
  },

  /** Upload node CSVs. With cascade_delete, nodes missing from file are removed. */
  uploadNodes: async (datasetId: number, files: File[]) => {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append('files', file);
    });

    const response = await apiClient.post<UploadNodesOrRelationshipsResponse>(
      `/datasets/${datasetId}/upload-nodes/`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data;
  },

  uploadRelationships: async (datasetId: number, files: File[]) => {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append('files', file);
    });

    const response = await apiClient.post<UploadNodesOrRelationshipsResponse>(
      `/datasets/${datasetId}/upload-relationships/`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data;
  },

  getDatasets: async () => {
    const response = await apiClient.get<Dataset[]>('/datasets/');
    return response.data;
  },

  /** Get by ID; includeMetadata adds summary + node/relationship counts. */
  getDataset: async (id: number, options?: { includeMetadata?: boolean }) => {
    const params = options?.includeMetadata ? { include_metadata: 'true' } : undefined;
    const response = await apiClient.get<Dataset & { metadata?: unknown }>(`/datasets/${id}/`, { params });
    return response.data;
  },

  getNodeSample: async (datasetId: number, nodeLabel: string, limit = 5) => {
    const response = await apiClient.get<{ columns: string[]; rows: Record<string, unknown>[] }>(
      `/datasets/${datasetId}/nodes/${encodeURIComponent(nodeLabel)}/sample/`,
      { params: { limit } }
    );
    return response.data;
  },

  /** Download as CSV or ZIP; pass asZip for "Download all". */
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
    if (options?.asZip) params.append('as_zip', 'true');

    const url = `/datasets/${id}/download/${params.toString() ? '?' + params.toString() : ''}`;
    const response = await apiClient.get(url, { responseType: 'blob' });
    return {
      blob: response.data,
      headers: response.headers,
    };
  },

  deleteDataset: async (id: number) => {
    const response = await apiClient.delete(`/datasets/${id}/delete/`);
    return response.data;
  },

  getTaskStatus: async (taskId: number): Promise<UploadTask> => {
    const response = await apiClient.get<UploadTask>(`/datasets/tasks/${taskId}/`);
    return response.data;
  },

};

