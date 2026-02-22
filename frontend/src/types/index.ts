/** Shared API and domain types. */
export interface ApiError {
  error: string;
  details?: Record<string, any>;
}

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
  cascade_delete?: boolean;
  upload_tasks?: UploadTask[];
  summary?: {
    total_nodes: number;
    total_relationships: number;
    total_files: number;
    success_files: number;
    failed_files: number;
  };
  node_summary?: { name: string; total_rows: number }[];
  relationship_summary?: { name: string; total_rows: number }[];
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

/** Per-file result from upload-nodes or upload-relationships API. Only file_name, status, error (when failed), task_id (when accepted). */
export interface FileUploadResult {
  file_name: string;
  status: 'accepted' | 'failed';
  error?: string;
  task_id?: number;
}

/** Response from POST /datasets/:id/upload-nodes/ and upload-relationships/ */
export interface UploadNodesOrRelationshipsResponse {
  dataset: Dataset;
  file_results: FileUploadResult[];
  summary: { total: number; accepted: number; failed: number };
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

