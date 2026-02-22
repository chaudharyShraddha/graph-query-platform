/**
 * Application-wide constants
 */

// API Configuration
export const API_TIMEOUT = 30000; // 30 seconds
export const WS_PING_INTERVAL = 30000; // 30 seconds
export const WS_MAX_RECONNECT_ATTEMPTS = 5;
export const WS_RECONNECT_DELAY = 1000; // Start with 1 second
export const WS_MAX_RECONNECT_DELAY = 30000; // Max 30 seconds

// Query Results
export const ROWS_PER_PAGE = 50;

// Local Storage Keys
export const STORAGE_KEYS = {
  QUERY_TABS: 'query_tabs',
  ACTIVE_TAB: 'active_tab',
  AUTH_TOKEN: 'auth_token',
} as const;

// Query Templates
export const QUERY_TEMPLATES = [
  {
    name: 'Find All Nodes',
    query: 'MATCH (n)\nRETURN n\nLIMIT 100',
  },
  {
    name: 'Find Nodes by Label',
    query: 'MATCH (n:Label)\nRETURN n\nLIMIT 100',
  },
  {
    name: 'Find Relationships',
    query: 'MATCH (a)-[r]->(b)\nRETURN a, r, b\nLIMIT 100',
  },
  {
    name: 'Count Nodes',
    query: 'MATCH (n)\nRETURN count(n) AS total',
  },
  {
    name: 'Find Shortest Path',
    query: 'MATCH path = shortestPath((a)-[*]-(b))\nWHERE id(a) = $start AND id(b) = $end\nRETURN path',
  },
] as const;

// Upload wizard steps (create → nodes → relationships)
export const UPLOAD_WIZARD_STEPS = [
  { id: 'create', label: 'Create Dataset', description: 'Set up your dataset with name and description' },
  { id: 'nodes', label: 'Upload Node Files', description: 'Upload CSV files containing node data' },
  { id: 'relationships', label: 'Upload Relationship Files', description: 'Upload CSV files with relationships' },
] as const;

