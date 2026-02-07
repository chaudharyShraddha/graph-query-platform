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
export const MAX_EXPANDED_ROWS = 100;

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

// Date Filter Options
export const DATE_FILTER_OPTIONS = [
  { value: 'all', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'week', label: 'Last Week' },
  { value: 'month', label: 'Last Month' },
] as const;

// Status Filter Options
export const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'pending', label: 'Pending' },
  { value: 'processing', label: 'Processing' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
] as const;

