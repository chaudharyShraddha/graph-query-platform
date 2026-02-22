/**
 * Cypher language mode for CodeMirror
 * Basic syntax highlighting for Cypher queries
 */
import { javascript } from '@codemirror/lang-javascript';

// Use JavaScript mode as base since Cypher syntax is similar
// We'll customize it for Cypher-specific keywords
export const cypherLanguage = javascript({
  jsx: false,
  typescript: false,
});

// For now, we'll use JavaScript mode with custom styling
// A full Cypher mode would require more complex parsing
export default cypherLanguage;

