/**
 * Query Editor Component with CodeMirror
 */
import { useEffect, useRef, useMemo } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView } from '@codemirror/view';
import { autocompletion } from '@codemirror/autocomplete';
import type { Schema } from '@/types';
import './QueryEditor.css';

interface QueryEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  height?: string;
  onExecute?: () => void;
  schema?: Schema | null;
  onInsertText?: (text: string, position?: number) => void;
}

// Cypher keywords for autocomplete
const CYPHER_KEYWORDS = [
  'MATCH', 'WHERE', 'RETURN', 'CREATE', 'DELETE', 'SET', 'REMOVE', 'MERGE',
  'WITH', 'UNWIND', 'UNION', 'ALL', 'OPTIONAL', 'ORDER', 'BY',
  'LIMIT', 'SKIP', 'DISTINCT', 'AS', 'AND', 'OR', 'NOT', 'XOR', 'IN',
  'STARTS', 'ENDS', 'CONTAINS', 'IS', 'NULL', 'TRUE', 'FALSE',
  'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'CALL', 'YIELD', 'USING',
  'INDEX', 'CONSTRAINT', 'DROP', 'EXISTS', 'FOREACH', 'ON',
  'DETACH', 'LOAD', 'CSV', 'FROM', 'HEADERS', 'FIELDTERMINATOR',
  'PERIODIC', 'COMMIT', 'PROFILE', 'EXPLAIN', 'SCAN', 'SEARCH',
  'START', 'STOP', 'NODE', 'RELATIONSHIP', 'REL', 'TYPE', 'LABELS',
  'PROPERTIES', 'KEYS', 'VALUES', 'NODES', 'RELATIONSHIPS', 'RANGE',
  'SHORTESTPATH', 'ALLSHORTESTPATHS', 'COUNT', 'COLLECT', 'SUM', 'AVG',
  'MIN', 'MAX', 'HEAD', 'LAST', 'TAIL', 'SIZE', 'REVERSE', 'REDUCE',
  'EXTRACT', 'FILTER', 'ANY', 'NONE', 'SINGLE', 'UNIQUE', 'ID',
  'LABEL', 'STARTNODE', 'ENDNODE', 'LENGTH'
];

const QueryEditor = ({
  value,
  onChange,
  placeholder = 'Enter your Cypher query here...',
  readOnly = false,
  height = '400px',
  onExecute,
  schema,
}: QueryEditorProps) => {
  const editorRef = useRef<HTMLDivElement>(null);

  // Create autocomplete source
  const autocompleteSource = useMemo(() => {
    const completions: any[] = [];

    // Add Cypher keywords
    CYPHER_KEYWORDS.forEach(keyword => {
      completions.push({
        label: keyword,
        type: 'keyword',
        info: `Cypher keyword: ${keyword}`,
      });
    });

    // Add node labels from schema
    if (schema?.node_labels) {
      schema.node_labels.forEach(nodeLabel => {
        completions.push({
          label: nodeLabel.label,
          type: 'node',
          info: `Node label (${nodeLabel.count.toLocaleString()} nodes)`,
        });
      });
    }

    // Add relationship types from schema
    if (schema?.relationship_types) {
      schema.relationship_types.forEach(relType => {
        completions.push({
          label: relType.type,
          type: 'relationship',
          info: `Relationship type (${relType.count.toLocaleString()} relationships)`,
        });
      });
    }

    // Add properties from node labels
    if (schema?.node_labels) {
      schema.node_labels.forEach(nodeLabel => {
        if (nodeLabel.properties && nodeLabel.properties.length > 0) {
          nodeLabel.properties.forEach(prop => {
            completions.push({
              label: prop,
              type: 'property',
              info: `Property of ${nodeLabel.label} (${nodeLabel.count.toLocaleString()} nodes)`,
            });
          });
        }
      });
    }

    return (context: any) => {
      const word = context.matchBefore(/[\w.`]*/);
      if (!word || (word.from === word.to && !context.explicit)) return null;

      const query = word.text.toLowerCase();
      
      // Check if we're after a dot (property access)
      const beforeDot = context.matchBefore(/\.\s*[\w`]*$/);
      const isPropertyAccess = beforeDot !== null;
      
      // Filter completions
      let filtered = completions.filter(completion => {
        const labelLower = completion.label.toLowerCase();
        if (isPropertyAccess && completion.type !== 'property') {
          return false; // Only show properties after dot
        }
        return labelLower.startsWith(query) || labelLower.includes(query);
      });

      // Sort: properties first if property access, then by type
      if (isPropertyAccess) {
        filtered = filtered.sort((a, b) => {
          if (a.type === 'property' && b.type !== 'property') return -1;
          if (a.type !== 'property' && b.type === 'property') return 1;
          return a.label.localeCompare(b.label);
        });
      } else {
        filtered = filtered.sort((a, b) => {
          const typeOrder = { keyword: 0, node: 1, relationship: 2, property: 3 };
          const aOrder = typeOrder[a.type as keyof typeof typeOrder] ?? 4;
          const bOrder = typeOrder[b.type as keyof typeof typeOrder] ?? 4;
          if (aOrder !== bOrder) return aOrder - bOrder;
          return a.label.localeCompare(b.label);
        });
      }

      return {
        from: word.from,
        options: filtered.slice(0, 50).map(completion => ({
          label: completion.label,
          type: completion.type,
          info: completion.info,
        })),
      };
    };
  }, [schema]);

  // Custom key binding for Ctrl+Enter / Cmd+Enter to execute
  useEffect(() => {
    if (!onExecute) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        onExecute();
      }
    };

    const editorElement = editorRef.current;
    if (editorElement) {
      editorElement.addEventListener('keydown', handleKeyDown);
      return () => {
        editorElement.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [onExecute]);

  return (
    <div className="query-editor" ref={editorRef} style={{ height }}>
      <CodeMirror
        value={value}
        height={height}
        theme={oneDark}
        extensions={[
          javascript({ jsx: false, typescript: false }),
          autocompletion({
            override: [autocompleteSource],
          }),
          EditorView.lineWrapping,
          EditorView.theme({
            '&': {
              fontSize: '14px',
              fontFamily: 'Monaco, Menlo, "Ubuntu Mono", Consolas, "source-code-pro", monospace',
            },
            '.cm-content': {
              padding: '12px',
              minHeight: height,
            },
            '.cm-focused': {
              outline: 'none',
            },
            '.cm-editor': {
              borderRadius: '8px',
            },
            '.cm-completionLabel': {
              fontFamily: 'Monaco, Menlo, "Ubuntu Mono", Consolas, "source-code-pro", monospace',
            },
          }),
        ]}
        onChange={onChange}
        readOnly={readOnly}
        placeholder={placeholder}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          dropCursor: false,
          allowMultipleSelections: false,
          indentOnInput: true,
          bracketMatching: true,
          closeBrackets: true,
          autocompletion: true,
          highlightSelectionMatches: true,
        }}
      />
    </div>
  );
};

export default QueryEditor;
