/**
 * Query API service
 */
import apiClient from './api';
import type {
  SavedQuery,
  QueryExecution,
  QueryExecuteRequest,
  QueryExecuteResponse,
  Schema,
} from '@/types';

export const queriesApi = {
  /**
   * Execute a Cypher query
   */
  executeQuery: async (request: QueryExecuteRequest) => {
    const response = await apiClient.post<QueryExecuteResponse>('/queries/execute/', request);
    return response.data;
  },

  /**
   * Save a query
   */
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

  /**
   * Get all saved queries
   */
  getQueries: async (favoriteOnly?: boolean) => {
    const url = favoriteOnly ? '/queries/?favorite=true' : '/queries/';
    const response = await apiClient.get<SavedQuery[]>(url);
    return response.data;
  },

  /**
   * Get query by ID
   */
  getQuery: async (id: number) => {
    const response = await apiClient.get<SavedQuery>(`/queries/${id}/`);
    return response.data;
  },

  /**
   * Delete query
   */
  deleteQuery: async (id: number) => {
    const response = await apiClient.delete(`/queries/${id}/`);
    return response.data;
  },

  /**
   * Get query execution history
   */
  getQueryHistory: async () => {
    const response = await apiClient.get<QueryExecution[]>('/queries/history/');
    return response.data;
  },

  /**
   * Get Neo4j schema
   */
  getSchema: async () => {
    const response = await apiClient.get<Schema>('/schema/');
    return response.data;
  },
};

