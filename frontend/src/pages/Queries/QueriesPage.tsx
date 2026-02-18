/**
 * Queries Page - Cypher Query Interface
 */
import { useState, useEffect, useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { executeQuery, fetchQueries, saveQuery, fetchSchema, fetchQueryHistory, deleteQuery } from '@/store/slices/queriesSlice';
import { toast } from '@/utils/toast';
import QueryEditor from '@/components/QueryEditor/QueryEditor';
import QueryResults from '@/components/QueryResults/QueryResults';
import SchemaExplorer from '@/components/SchemaExplorer/SchemaExplorer';
import QueryHistory from '@/components/QueryHistory/QueryHistory';
import { PlayIcon, SaveIcon, PlusIcon, CloseIcon, SchemaIcon, HistoryIcon, DeleteIcon } from '@/components/Icons/Icons';
import { QUERY_TEMPLATES } from '@/constants';
import './QueriesPage.css';

interface QueryTab {
  id: string;
  name: string;
  query: string;
  isDirty: boolean;
  savedQueryId?: number;
}

const QueriesPage = () => {
  const dispatch = useAppDispatch();
  const { executing, error, schema, queries } = useAppSelector((state) => state.queries);
  const [tabs, setTabs] = useState<QueryTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>('');
  const [lastExecutionResult, setLastExecutionResult] = useState<{
    results: any[];
    executionTime?: number;
    rowsReturned?: number;
  } | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [showSchemaSidebar, setShowSchemaSidebar] = useState(true);
  const [showHistorySidebar, setShowHistorySidebar] = useState(false);

  // Get active tab
  const activeTab = tabs.find((tab) => tab.id === activeTabId) || tabs[0];

  // Fetch schema and saved queries on mount
  useEffect(() => {
    const loadData = async () => {
      // Load schema
      if (!schema) {
        setSchemaLoading(true);
        try {
          await dispatch(fetchSchema()).unwrap();
        } catch (error) {
          console.error('Failed to load schema:', error);
        } finally {
          setSchemaLoading(false);
        }
      }
      
      // Load saved queries from database
      try {
        await dispatch(fetchQueries()).unwrap();
      } catch (error) {
        console.error('Failed to load saved queries:', error);
      }
      
      // Load query history
      try {
        await dispatch(fetchQueryHistory()).unwrap();
      } catch (error) {
        console.error('Failed to load query history:', error);
      }
    };
    loadData();
  }, [dispatch, schema]);

  // Load tabs from saved queries API
  useEffect(() => {
    if (queries === undefined) return; // Wait for queries to be loaded

    if (queries && queries.length > 0) {
      // Create tabs from saved queries
      const queryTabs: QueryTab[] = queries.map((q) => ({
        id: `saved-${q.id}`,
        name: q.name,
        query: q.cypher_query, // Ensure query text is populated
        isDirty: false,
        savedQueryId: q.id,
      }));
      
      setTabs(queryTabs);
      setActiveTabId(queryTabs[0].id);
    } else {
      // No saved queries - create one empty tab
      const emptyTab: QueryTab = {
        id: 'new-1',
        name: 'Query 1',
        query: '',
        isDirty: false,
      };
      setTabs([emptyTab]);
      setActiveTabId(emptyTab.id);
    }
  }, [queries]);

  // Handle query change
  const handleQueryChange = useCallback((value: string) => {
    setTabs((prevTabs) =>
      prevTabs.map((tab) =>
        tab.id === activeTabId ? { ...tab, query: value, isDirty: true } : tab
      )
    );
  }, [activeTabId]);

  // Create new tab
  const handleNewTab = useCallback(() => {
    const newId = `new-${Date.now()}`;
    const newTab: QueryTab = {
      id: newId,
      name: `Query ${tabs.length + 1}`,
      query: '',
      isDirty: false,
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newId);
  }, [tabs.length]);

  // Close tab
  const handleCloseTab = useCallback((tabId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabs.length === 1) {
      toast.warning('Cannot close the last tab', 'Warning');
      return;
    }

    const tabIndex = tabs.findIndex((t) => t.id === tabId);
    const newTabs = tabs.filter((t) => t.id !== tabId);
    setTabs(newTabs);

    // Switch to adjacent tab
    if (activeTabId === tabId) {
      if (tabIndex > 0) {
        setActiveTabId(tabs[tabIndex - 1].id);
      } else {
        setActiveTabId(newTabs[0].id);
      }
    }
  }, [tabs, activeTabId]);

  // Execute query
  const handleExecute = useCallback(async () => {
    if (!activeTab || !activeTab.query?.trim()) {
      toast.error('Please enter a query to execute', 'Error');
      return;
    }

    try {
      // Use query_id if it's a saved query, otherwise use query text
      const executeRequest = activeTab.savedQueryId
        ? { query_id: activeTab.savedQueryId }
        : { query: activeTab.query };

      const result = await dispatch(executeQuery(executeRequest)).unwrap();

      if (result.status === 'success') {
        setLastExecutionResult({
          results: result.results,
          executionTime: result.execution_time,
          rowsReturned: result.rows_returned,
        });
        dispatch(fetchQueryHistory());
        toast.success(
          `Query executed successfully. ${result.rows_returned} rows returned in ${result.execution_time.toFixed(2)}s`,
          'Success'
        );
      } else {
        setLastExecutionResult(null);
        dispatch(fetchQueryHistory());
        toast.error(result.error_message || 'Query execution failed', 'Error');
      }
    } catch (error: any) {
      setLastExecutionResult(null);
      toast.error(error.message || 'Failed to execute query', 'Error');
    }
  }, [dispatch, activeTab]);

  // Save query
  const handleSave = useCallback(async () => {
    if (!activeTab || !activeTab.query?.trim()) {
      toast.error('Please enter a query to save', 'Error');
      return;
    }

    try {
      const savedQuery = await dispatch(
        saveQuery({
          name: activeTab.name,
          cypher_query: activeTab.query,
        })
      ).unwrap();

      // Update tab with saved query info
      setTabs((prevTabs) =>
        prevTabs.map((tab) =>
          tab.id === activeTabId
            ? { ...tab, isDirty: false, savedQueryId: savedQuery.id, name: savedQuery.name }
            : tab
        )
      );

      // Refresh queries list from API
      await dispatch(fetchQueries()).unwrap();

      toast.success('Query saved successfully', 'Success');
    } catch (error: any) {
      toast.error(error.message || 'Failed to save query', 'Error');
    }
  }, [dispatch, activeTab, activeTabId]);

  // Load template
  const handleLoadTemplate = useCallback((template: { name: string; query: string }) => {
    const newId = `new-${Date.now()}`;
    const newTab: QueryTab = {
      id: newId,
      name: template.name,
      query: template.query,
      isDirty: false,
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newId);
  }, []);

  // Handle insert text from schema explorer
  const handleInsertNodeLabel = useCallback((label: string) => {
    const currentQuery = activeTab?.query || '';
    const insertText = `:${label}`;
    const newQuery = currentQuery + insertText;
    handleQueryChange(newQuery);
    toast.success(`Inserted node label: ${label}`, 'Schema');
  }, [activeTab, handleQueryChange]);

  const handleInsertRelationshipType = useCallback((type: string) => {
    const currentQuery = activeTab?.query || '';
    const insertText = `[:${type}]`;
    const newQuery = currentQuery + insertText;
    handleQueryChange(newQuery);
    toast.success(`Inserted relationship type: ${type}`, 'Schema');
  }, [activeTab, handleQueryChange]);

  const handleInsertProperty = useCallback((property: string) => {
    const currentQuery = activeTab?.query || '';
    const insertText = property.includes(' ') ? `\`${property}\`` : property;
    const newQuery = currentQuery + insertText;
    handleQueryChange(newQuery);
    toast.success(`Inserted property: ${property}`, 'Schema');
  }, [activeTab, handleQueryChange]);

  // Handle query selection from history
  const handleSelectHistoryQuery = useCallback((query: string) => {
    if (!activeTab) return;
    handleQueryChange(query);
    setShowHistorySidebar(false);
    toast.success('Query loaded from history', 'Success');
  }, [activeTab, handleQueryChange]);

  // Delete saved query
  const handleDeleteQuery = useCallback(async (savedQueryId: number) => {
    if (!window.confirm('Are you sure you want to delete this saved query?')) {
      return;
    }

    try {
      await dispatch(deleteQuery(savedQueryId)).unwrap();
      
      // Remove tab if it's currently open
      const tabToRemove = tabs.find(tab => tab.savedQueryId === savedQueryId);
      if (tabToRemove) {
        const newTabs = tabs.filter(tab => tab.id !== tabToRemove.id);
        if (newTabs.length === 0) {
          // Create a new empty tab if all tabs were deleted
          const newTab: QueryTab = {
            id: 'new-1',
            name: 'Query 1',
            query: '',
            isDirty: false,
          };
          setTabs([newTab]);
          setActiveTabId(newTab.id);
        } else {
          setTabs(newTabs);
          if (activeTabId === tabToRemove.id) {
            setActiveTabId(newTabs[0].id);
          }
        }
      }
      
      // Refresh queries list from API
      await dispatch(fetchQueries()).unwrap();
      
      toast.success('Query deleted successfully', 'Success');
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete query', 'Error');
    }
  }, [dispatch, tabs, activeTabId]);

  return (
    <div className="queries-page">
      <div className="queries-header">
        <div>
          <h1>Queries</h1>
          <p>Execute and manage Cypher queries</p>
        </div>
        <div className="queries-header-actions">
          <div className="query-templates">
            <select
              className="template-select"
              onChange={(e) => {
                if (e.target.value) {
                  const template = QUERY_TEMPLATES.find((t) => t.name === e.target.value);
                  if (template) {
                    handleLoadTemplate(template);
                    e.target.value = '';
                  }
                }
              }}
              defaultValue=""
            >
              <option value="">Load Template...</option>
              {QUERY_TEMPLATES.map((template) => (
                <option key={template.name} value={template.name}>
                  {template.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Query Tabs */}
      <div className="query-tabs-container">
        <div className="query-tabs">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`query-tab ${tab.id === activeTabId ? 'active' : ''} ${tab.isDirty ? 'dirty' : ''}`}
              onClick={() => setActiveTabId(tab.id)}
            >
              <span className="tab-name">{tab.name}</span>
              {tab.isDirty && <span className="dirty-indicator">●</span>}
              <div className="tab-actions">
                {tab.savedQueryId && (
                  <button
                    className="tab-delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteQuery(tab.savedQueryId!);
                    }}
                    title="Delete saved query"
                  >
                    <DeleteIcon size={14} />
                  </button>
                )}
                {tabs.length > 1 && (
                  <button
                    className="tab-close"
                    onClick={(e) => handleCloseTab(tab.id, e)}
                    title="Close tab"
                  >
                    <CloseIcon size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
          <button className="new-tab-btn" onClick={handleNewTab} title="New query">
            <PlusIcon size={16} />
          </button>
        </div>
      </div>

      {/* Query Editor with Schema Sidebar */}
      <div className="queries-content-wrapper">
        {showSchemaSidebar && (
          <div className="schema-sidebar">
            <SchemaExplorer
              schema={schema}
              loading={schemaLoading}
              onInsertNodeLabel={handleInsertNodeLabel}
              onInsertRelationshipType={handleInsertRelationshipType}
              onInsertProperty={handleInsertProperty}
            />
          </div>
        )}
        <div className="query-editor-container">
          <div className="query-toolbar">
            <div className="query-toolbar-left">
              <button
                className="btn btn-icon"
                onClick={() => setShowSchemaSidebar(!showSchemaSidebar)}
                title={showSchemaSidebar ? 'Hide schema explorer' : 'Show schema explorer'}
              >
                <SchemaIcon size={16} />
              </button>
              <button
                className="btn btn-icon"
                onClick={() => setShowHistorySidebar(!showHistorySidebar)}
                title={showHistorySidebar ? 'Hide query history' : 'Show query history'}
              >
                <HistoryIcon size={16} />
              </button>
              <button
                className="btn btn-primary"
                onClick={handleExecute}
                disabled={executing || !activeTab?.query?.trim()}
              >
                <PlayIcon size={16} />
                <span>Execute</span>
                <span className="shortcut-hint">Ctrl+Enter</span>
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleSave}
                disabled={!activeTab?.query?.trim()}
              >
                <SaveIcon size={16} />
                <span>Save</span>
              </button>
            </div>
          </div>

          <QueryEditor
            value={activeTab?.query || ''}
            onChange={handleQueryChange}
            onExecute={handleExecute}
            schema={schema}
            height="400px"
            placeholder="Enter your Cypher query here...\n\nExample:\nMATCH (n)\nRETURN n\nLIMIT 10"
          />
        </div>
      </div>

      {/* Results Section */}
      {(lastExecutionResult !== null || error) && (
        <QueryResults
          results={lastExecutionResult?.results || []}
          executionTime={lastExecutionResult?.executionTime}
          rowsReturned={lastExecutionResult?.rowsReturned}
          error={error || undefined}
        />
      )}

      {/* Query History Sidebar */}
      {showHistorySidebar && (
        <div className="history-sidebar">
          <QueryHistory onSelectQuery={handleSelectHistoryQuery} />
        </div>
      )}
    </div>
  );
};

export default QueriesPage;
