/**
 * Queries Page - Cypher Query Interface
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { executeQuery, fetchQueries, saveQuery, fetchSchema, fetchQueryHistory, deleteQuery } from '@/store/slices/queriesSlice';
import { toast } from '@/utils/toast';
import QueryEditor from '@/components/QueryEditor/QueryEditor';
import QueryResults from '@/components/QueryResults/QueryResults';
import SchemaExplorer from '@/components/SchemaExplorer/SchemaExplorer';
import QueryHistory from '@/components/QueryHistory/QueryHistory';
import { PlayIcon, SaveIcon, PlusIcon, CloseIcon, SchemaIcon, HistoryIcon, DeleteIcon } from '@/components/Icons/Icons';
import { QUERY_TEMPLATES, STORAGE_KEYS } from '@/constants';
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
  const [tabs, setTabs] = useState<QueryTab[]>([
    { id: '1', name: 'Query 1', query: '', isDirty: false },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>('1');
  const [lastExecutionResult, setLastExecutionResult] = useState<{
    results: any[];
    executionTime?: number;
    rowsReturned?: number;
  } | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [showSchemaSidebar, setShowSchemaSidebar] = useState(true);
  const [showHistorySidebar, setShowHistorySidebar] = useState(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Auto-save functionality
  useEffect(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    if (activeTab && activeTab.query.trim() && activeTab.isDirty) {
      autoSaveTimerRef.current = setTimeout(() => {
        // Auto-save to localStorage
        const savedTabs = tabs.map((tab) =>
          tab.id === activeTabId ? { ...tab, isDirty: false } : tab
        );
        setTabs(savedTabs);
        localStorage.setItem(STORAGE_KEYS.QUERY_TABS, JSON.stringify(savedTabs));
      }, 2000); // Auto-save after 2 seconds of inactivity
    }

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [activeTab?.query, activeTabId, tabs]);

  // Load tabs from localStorage and database on mount
  useEffect(() => {
    const loadTabs = () => {
      // Get saved query IDs from database for validation
      const savedQueryIds = new Set(queries?.map(q => q.id) || []);
      
      // First, try to load from localStorage (for unsaved work)
      const savedTabs = localStorage.getItem(STORAGE_KEYS.QUERY_TABS);
      if (savedTabs) {
        try {
          const parsedTabs: QueryTab[] = JSON.parse(savedTabs);
          
          // Filter out tabs that reference deleted saved queries
          const validTabs = parsedTabs.filter(tab => {
            // Keep tabs without savedQueryId (unsaved work)
            if (!tab.savedQueryId) return true;
            // Only keep tabs if the saved query still exists in database
            return savedQueryIds.has(tab.savedQueryId);
          });
          
          // Update localStorage with filtered tabs
          if (validTabs.length !== parsedTabs.length) {
            localStorage.setItem('query-tabs', JSON.stringify(validTabs));
          }
          
          if (validTabs.length > 0) {
            setTabs(validTabs);
            setActiveTabId(validTabs[0].id);
            return;
          }
        } catch (e) {
          // Invalid JSON, clear it and continue to load from database
          localStorage.removeItem(STORAGE_KEYS.QUERY_TABS);
        }
      }
      
      // If no localStorage tabs, load recent saved queries from database
      if (queries && queries.length > 0) {
        const queryTabs: QueryTab[] = queries.slice(0, 5).map((q) => ({
          id: `saved-${q.id}`,
          name: q.name,
          query: q.cypher_query,
          isDirty: false,
          savedQueryId: q.id,
        }));
        if (queryTabs.length > 0) {
          setTabs(queryTabs);
          setActiveTabId(queryTabs[0].id);
        }
      }
    };
    
    // Wait for queries to be loaded
    if (queries !== undefined) {
      loadTabs();
    }
  }, [queries]);

  // Save tabs to localStorage when they change
  useEffect(() => {
    localStorage.setItem('query-tabs', JSON.stringify(tabs));
  }, [tabs]);

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
    const newId = `tab-${Date.now()}`;
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
    if (!activeTab || !activeTab.query.trim()) {
      toast.error('Please enter a query to execute', 'Error');
      return;
    }

    try {
      const result = await dispatch(
        executeQuery({ query: activeTab.query })
      ).unwrap();

      if (result.status === 'success') {
        setLastExecutionResult({
          results: result.results,
          executionTime: result.execution_time,
          rowsReturned: result.rows_returned,
        });
        // Refresh query history after successful execution
        dispatch(fetchQueryHistory());
        toast.success(
          `Query executed successfully. ${result.rows_returned} rows returned in ${result.execution_time.toFixed(2)}s`,
          'Success'
        );
      } else {
        setLastExecutionResult(null);
        // Refresh query history even on error
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
    if (!activeTab || !activeTab.query.trim()) {
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

      setTabs((prevTabs) =>
        prevTabs.map((tab) =>
          tab.id === activeTabId
            ? { ...tab, isDirty: false, savedQueryId: savedQuery.id, name: savedQuery.name }
            : tab
        )
      );

      // Refresh queries list
      dispatch(fetchQueries());

      toast.success('Query saved successfully', 'Success');
    } catch (error: any) {
      toast.error(error.message || 'Failed to save query', 'Error');
    }
  }, [dispatch, activeTab, activeTabId]);

  // Load template
  const handleLoadTemplate = useCallback((template: { name: string; query: string }) => {
    const newId = `tab-${Date.now()}`;
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
    
    // Update current tab with selected query
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
            id: '1',
            name: 'Query 1',
            query: '',
            isDirty: false,
          };
          setTabs([newTab]);
          setActiveTabId('1');
        } else {
          setTabs(newTabs);
          if (activeTabId === tabToRemove.id) {
            setActiveTabId(newTabs[0].id);
          }
        }
        // Update localStorage
        localStorage.setItem('query-tabs', JSON.stringify(newTabs));
      }
      
      // Refresh queries list
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
                disabled={executing || !activeTab?.query.trim()}
              >
                <PlayIcon size={16} />
                <span>Execute</span>
                <span className="shortcut-hint">Ctrl+Enter</span>
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleSave}
                disabled={!activeTab?.query.trim()}
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

