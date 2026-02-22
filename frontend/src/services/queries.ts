/** Query API: execute, save, list, get, delete, history, schema. */
import apiClient from './api';
import type {
  SavedQuery,
  QueryExecution,
  QueryExecuteRequest,
  QueryExecuteResponse,
  Schema,
} from '@/types';

export const queriesApi = {
  executeQuery: async (request: QueryExecuteRequest) => {
    const response = await apiClient.post<QueryExecuteResponse>('/queries/execute/', request);
    return response.data;
  },

  saveQuery: async (query: {
    name: string;
    description?: string;
    cypher_query: string;
    tags?: string[];
    is_favorite?: boolean;
  }) => {
    const response = await apiClient.post<SavedQuery>('/queries/save/', query);
    return response.data;
  },

  getQueries: async (favoriteOnly?: boolean) => {
    const url = favoriteOnly ? '/queries/?favorite=true' : '/queries/';
    const response = await apiClient.get<SavedQuery[]>(url);
    return response.data;
  },

  getQuery: async (id: number) => {
    const response = await apiClient.get<SavedQuery>(`/queries/${id}/`);
    return response.data;
  },

  deleteQuery: async (id: number) => {
    const response = await apiClient.delete(`/queries/${id}/`);
    return response.data;
  },

  getQueryHistory: async () => {
    const response = await apiClient.get<QueryExecution[]>('/queries/history/');
    return response.data;
  },

  getSchema: async () => {
    const response = await apiClient.get<Schema>('/schema/');
    return response.data;
  },
};

