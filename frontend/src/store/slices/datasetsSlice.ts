/** Redux slice: datasets list, current dataset, upload progress. */
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import { datasetsApi } from '@/services/datasets';
import type { Dataset } from '@/types';

interface DatasetsState {
  datasets: Dataset[];
  currentDataset: Dataset | null;
  loading: boolean;
  error: string | null;
  uploadProgress: Record<number, number>;
  taskStatuses: Record<number, {
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress: number;
    message?: string;
    error?: string;
  }>;
}

const initialState: DatasetsState = {
  datasets: [],
  currentDataset: null,
  loading: false,
  error: null,
  uploadProgress: {},
  taskStatuses: {},
};

export const fetchDatasets = createAsyncThunk(
  'datasets/fetchAll',
  async () => {
    return await datasetsApi.getDatasets();
  }
);

export const fetchDataset = createAsyncThunk(
  'datasets/fetchOne',
  async (params: number | { id: number; includeMetadata?: boolean }) => {
    const id = typeof params === 'number' ? params : params.id;
    const includeMetadata = typeof params === 'object' && params.includeMetadata === true;
    return await datasetsApi.getDataset(id, { includeMetadata });
  }
);

export const createDataset = createAsyncThunk(
  'datasets/create',
  async (params: { name: string; description?: string; cascadeDelete?: boolean }) => {
    return await datasetsApi.createDataset(params.name, params.description, params.cascadeDelete);
  }
);

export const updateDataset = createAsyncThunk(
  'datasets/update',
  async (params: { id: number; name?: string; description?: string; cascade_delete?: boolean }) => {
    return await datasetsApi.updateDataset(params.id, {
      name: params.name,
      description: params.description,
      cascade_delete: params.cascade_delete,
    });
  }
);

function getErrorPayload(err: unknown): unknown {
  if (err && typeof err === 'object' && 'response' in err) {
    return (err as { response?: { data?: unknown } }).response?.data;
  }
  return err;
}

export const uploadNodes = createAsyncThunk(
  'datasets/uploadNodes',
  async (params: { datasetId: number; files: File[] }, { rejectWithValue }) => {
    try {
      return await datasetsApi.uploadNodes(params.datasetId, params.files);
    } catch (err) {
      return rejectWithValue(getErrorPayload(err));
    }
  }
);

export const uploadRelationships = createAsyncThunk(
  'datasets/uploadRelationships',
  async (params: { datasetId: number; files: File[] }, { rejectWithValue }) => {
    try {
      return await datasetsApi.uploadRelationships(params.datasetId, params.files);
    } catch (err) {
      return rejectWithValue(getErrorPayload(err));
    }
  }
);

export const deleteDataset = createAsyncThunk(
  'datasets/delete',
  async (id: number) => {
    await datasetsApi.deleteDataset(id);
    return id;
  }
);

const datasetsSlice = createSlice({
  name: 'datasets',
  initialState,
  reducers: {
    setUploadProgress: (state, action: PayloadAction<{ taskId: number; progress: number }>) => {
      state.uploadProgress[action.payload.taskId] = action.payload.progress;
    },
    setTaskStatus: (
      state,
      action: PayloadAction<{
        taskId: number;
        status: 'pending' | 'processing' | 'completed' | 'failed';
        progress?: number;
        message?: string;
        error?: string;
      }>
    ) => {
      const { taskId, status, progress, message, error } = action.payload;
      const p = progress ?? state.taskStatuses[taskId]?.progress ?? 0;
      state.taskStatuses[taskId] = { status, progress: p, message, error };
      state.uploadProgress[taskId] = p;
    },
    clearError: (state) => {
      state.error = null;
    },
    setCurrentDataset: (state, action: PayloadAction<Dataset | null>) => {
      state.currentDataset = action.payload;
    },
    clearTaskStatus: (state, action: PayloadAction<number>) => {
      delete state.taskStatuses[action.payload];
      delete state.uploadProgress[action.payload];
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchDatasets.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchDatasets.fulfilled, (state, action) => {
        state.loading = false;
        state.datasets = action.payload;
      })
      .addCase(fetchDatasets.rejected, (state) => {
        state.loading = false;
        state.error = 'Failed to fetch datasets';
      })
      .addCase(fetchDataset.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchDataset.fulfilled, (state, action) => {
        state.loading = false;
        const payload = action.payload as Dataset;
        state.currentDataset = payload;
        const idx = state.datasets.findIndex((d) => d.id === payload.id);
        if (idx !== -1) state.datasets[idx] = { ...state.datasets[idx], ...payload };
      })
      .addCase(fetchDataset.rejected, (state) => {
        state.loading = false;
        state.error = 'Failed to fetch dataset';
      })
      .addCase(updateDataset.fulfilled, (state, action) => {
        const index = state.datasets.findIndex((d) => d.id === action.payload.id);
        if (index !== -1) {
          state.datasets[index] = action.payload;
        }
        if (state.currentDataset?.id === action.payload.id) {
          state.currentDataset = action.payload;
        }
      })
      .addCase(deleteDataset.fulfilled, (state, action) => {
        state.datasets = state.datasets.filter((d) => d.id !== action.payload);
        if (state.currentDataset?.id === action.payload) {
          state.currentDataset = null;
        }
      });
  },
});

export const {
  setUploadProgress,
  setTaskStatus,
  clearError,
  setCurrentDataset,
  clearTaskStatus,
} = datasetsSlice.actions;
export default datasetsSlice.reducer;

