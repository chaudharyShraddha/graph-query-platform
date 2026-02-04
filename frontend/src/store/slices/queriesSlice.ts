/**
 * Redux slice for queries
 */
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import { queriesApi } from '@/services/queries';
import type { SavedQuery, QueryExecution, QueryExecuteRequest, Schema } from '@/types';

interface QueriesState {
  queries: SavedQuery[];
  currentQuery: SavedQuery | null;
  history: QueryExecution[];
  schema: Schema | null;
  loading: boolean;
  error: string | null;
  executing: boolean;
  executionResult: any[] | null;
}

const initialState: QueriesState = {
  queries: [],
  currentQuery: null,
  history: [],
  schema: null,
  loading: false,
  error: null,
  executing: false,
  executionResult: null,
};

// Async thunks
export const fetchQueries = createAsyncThunk(
  'queries/fetchAll',
  async (favoriteOnly?: boolean) => {
    return await queriesApi.getQueries(favoriteOnly);
  }
);

export const fetchQuery = createAsyncThunk(
  'queries/fetchOne',
  async (id: number) => {
    return await queriesApi.getQuery(id);
  }
);

export const saveQuery = createAsyncThunk(
  'queries/save',
  async (query: {
    name: string;
    description?: string;
    cypher_query: string;
    tags?: string[];
    is_favorite?: boolean;
  }) => {
    return await queriesApi.saveQuery(query);
  }
);

export const executeQuery = createAsyncThunk(
  'queries/execute',
  async (request: QueryExecuteRequest) => {
    return await queriesApi.executeQuery(request);
  }
);

export const deleteQuery = createAsyncThunk(
  'queries/delete',
  async (id: number) => {
    await queriesApi.deleteQuery(id);
    return id;
  }
);

export const fetchQueryHistory = createAsyncThunk(
  'queries/fetchHistory',
  async () => {
    return await queriesApi.getQueryHistory();
  }
);

export const fetchSchema = createAsyncThunk(
  'queries/fetchSchema',
  async () => {
    return await queriesApi.getSchema();
  }
);

const queriesSlice = createSlice({
  name: 'queries',
  initialState,
  reducers: {
    setCurrentQuery: (state, action: PayloadAction<SavedQuery | null>) => {
      state.currentQuery = action.payload;
    },
    clearExecutionResult: (state) => {
      state.executionResult = null;
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch queries
      .addCase(fetchQueries.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchQueries.fulfilled, (state, action) => {
        state.loading = false;
        state.queries = action.payload;
      })
      .addCase(fetchQueries.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch queries';
      })
      // Fetch single query
      .addCase(fetchQuery.fulfilled, (state, action) => {
        state.currentQuery = action.payload;
      })
      // Save query
      .addCase(saveQuery.fulfilled, (state, action) => {
        state.queries.unshift(action.payload);
      })
      // Execute query
      .addCase(executeQuery.pending, (state) => {
        state.executing = true;
        state.error = null;
        state.executionResult = null;
      })
      .addCase(executeQuery.fulfilled, (state, action) => {
        state.executing = false;
        if (action.payload.status === 'success') {
          state.executionResult = action.payload.results;
        } else {
          state.error = action.payload.error_message || 'Query execution failed';
        }
      })
      .addCase(executeQuery.rejected, (state, action) => {
        state.executing = false;
        state.error = action.error.message || 'Failed to execute query';
      })
      // Delete query
      .addCase(deleteQuery.fulfilled, (state, action) => {
        state.queries = state.queries.filter((q) => q.id !== action.payload);
        if (state.currentQuery?.id === action.payload) {
          state.currentQuery = null;
        }
      })
      // Fetch history
      .addCase(fetchQueryHistory.fulfilled, (state, action) => {
        state.history = action.payload;
      })
      // Fetch schema
      .addCase(fetchSchema.fulfilled, (state, action) => {
        state.schema = action.payload;
      });
  },
});

export const { setCurrentQuery, clearExecutionResult, clearError } = queriesSlice.actions;
export default queriesSlice.reducer;

