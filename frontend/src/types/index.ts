/**
 * Common TypeScript types for the application
 */

// API Response types
export interface ApiResponse<T> {
  data: T;
  status: number;
  message?: string;
}

export interface ApiError {
  error: string;
  details?: Record<string, any>;
}

// Dataset types
export interface Dataset {
  id: number;
  name: string;
  description?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: string;
  updated_at: string;
  created_by?: number;
  created_by_username?: string;
  total_files: number;
  processed_files: number;
  total_nodes: number;
  total_relationships: number;
  upload_tasks?: UploadTask[];
}

export interface UploadTask {
  id: number;
  file_name: string;
  file_type: 'node' | 'relationship';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  total_rows?: number;
  processed_rows?: number;
  progress_percentage?: number;
  error_message?: string;
  node_label?: string;
  relationship_type?: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

// Query types
export interface SavedQuery {
  id: number;
  name: string;
  description?: string;
  cypher_query: string;
  created_by?: number;
  created_by_username?: string;
  created_at: string;
  updated_at: string;
  last_executed_at?: string;
  execution_count: number;
  average_execution_time?: number;
  tags?: string[];
  is_favorite: boolean;
}

export interface QueryExecution {
  id: number;
  query?: number;
  query_name?: string;
  cypher_query: string;
  executed_by?: number;
  executed_by_username?: string;
  status: 'success' | 'error' | 'timeout';
  execution_time?: number;
  rows_returned?: number;
  error_message?: string;
  executed_at: string;
}

export interface QueryExecuteRequest {
  query?: string;
  query_id?: number;
  parameters?: Record<string, any>;
  save_query?: boolean;
  query_name?: string;
}

export interface QueryExecuteResponse {
  status: 'success' | 'error';
  execution_time: number;
  rows_returned: number;
  results: any[];
  error_message?: string;
  execution_id: number;
}

// Schema types
export interface NodeLabel {
  label: string;
  count: number;
  properties: string[];
}

export interface RelationshipType {
  type: string;
  count: number;
}

export interface Schema {
  node_labels: NodeLabel[];
  relationship_types: RelationshipType[];
  total_nodes: number;
  total_relationships: number;
}

// WebSocket types
export interface WebSocketMessage {
  type: 'connection' | 'progress' | 'status' | 'error' | 'pong';
  task_id: number;
  data?: any;
  message?: string;
  timestamp?: string;
  task?: {
    id: number;
    file_name: string;
    file_type: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress_percentage?: number;
    processed_rows?: number;
    total_rows?: number;
    error_message?: string;
    started_at?: string;
    completed_at?: string;
  };
}

