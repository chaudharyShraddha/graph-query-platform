/**
 * Cypher language mode for CodeMirror
 * Basic syntax highlighting for Cypher queries
 */
import { StreamLanguage } from '@codemirror/language';
import { javascript } from '@codemirror/lang-javascript';

// Cypher keywords
const CYPHER_KEYWORDS = [
  'MATCH', 'WHERE', 'RETURN', 'CREATE', 'DELETE', 'SET', 'REMOVE', 'MERGE',
  'WITH', 'UNWIND', 'UNION', 'ALL', 'OPTIONAL', 'MATCH', 'ORDER', 'BY',
  'LIMIT', 'SKIP', 'DISTINCT', 'AS', 'AND', 'OR', 'NOT', 'XOR', 'IN',
  'STARTS', 'ENDS', 'CONTAINS', 'IS', 'NULL', 'TRUE', 'FALSE',
  'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'CALL', 'YIELD', 'USING',
  'INDEX', 'CONSTRAINT', 'DROP', 'EXISTS', 'FOREACH', 'ON', 'CREATE',
  'DETACH', 'DELETE', 'SET', 'REMOVE', 'FOREACH', 'LOAD', 'CSV',
  'FROM', 'HEADERS', 'FIELDTERMINATOR', 'PERIODIC', 'COMMIT',
  'PROFILE', 'EXPLAIN', 'USING', 'PERIODIC', 'COMMIT', 'SCAN',
  'SEARCH', 'START', 'STOP', 'NODE', 'RELATIONSHIP', 'REL', 'TYPE',
  'LABELS', 'PROPERTIES', 'KEYS', 'VALUES', 'NODES', 'RELATIONSHIPS',
  'RANGE', 'SHORTESTPATH', 'ALLSHORTESTPATHS', 'COUNT', 'COLLECT',
  'SUM', 'AVG', 'MIN', 'MAX', 'HEAD', 'LAST', 'TAIL', 'SIZE',
  'REVERSE', 'REDUCE', 'EXTRACT', 'FILTER', 'ALL', 'ANY', 'NONE',
  'SINGLE', 'EXISTS', 'UNIQUE', 'ID', 'TYPE', 'LABELS', 'PROPERTIES',
  'KEYS', 'VALUES', 'NODES', 'RELATIONSHIPS', 'LABEL', 'TYPE',
  'STARTNODE', 'ENDNODE', 'LENGTH', 'SIZE', 'REVERSE', 'HEAD',
  'LAST', 'TAIL', 'REDUCE', 'EXTRACT', 'FILTER', 'ALL', 'ANY',
  'NONE', 'SINGLE', 'EXISTS', 'UNIQUE', 'ID', 'TYPE', 'LABELS',
  'PROPERTIES', 'KEYS', 'VALUES', 'NODES', 'RELATIONSHIPS'
];

// Use JavaScript mode as base since Cypher syntax is similar
// We'll customize it for Cypher-specific keywords
export const cypherLanguage = javascript({
  jsx: false,
  typescript: false,
});

// For now, we'll use JavaScript mode with custom styling
// A full Cypher mode would require more complex parsing
export default cypherLanguage;

