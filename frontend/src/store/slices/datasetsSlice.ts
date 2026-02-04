/**
 * Redux slice for datasets
 */
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import { datasetsApi } from '@/services/datasets';
import type { Dataset } from '@/types';

interface DatasetsState {
  datasets: Dataset[];
  currentDataset: Dataset | null;
  loading: boolean;
  error: string | null;
  uploadProgress: Record<number, number>; // task_id -> progress percentage
  taskStatuses: Record<number, {
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress: number;
    message?: string;
    error?: string;
  }>; // task_id -> task status
}

const initialState: DatasetsState = {
  datasets: [],
  currentDataset: null,
  loading: false,
  error: null,
  uploadProgress: {},
  taskStatuses: {},
};

// Async thunks
export const fetchDatasets = createAsyncThunk(
  'datasets/fetchAll',
  async () => {
    return await datasetsApi.getDatasets();
  }
);

export const fetchDataset = createAsyncThunk(
  'datasets/fetchOne',
  async (id: number) => {
    return await datasetsApi.getDataset(id);
  }
);

export const uploadFiles = createAsyncThunk(
  'datasets/uploadFiles',
  async (params: { files: File[]; datasetName?: string; description?: string }) => {
    return await datasetsApi.uploadFiles(params.files, params.datasetName, params.description);
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
      state.taskStatuses[taskId] = {
        status,
        progress: progress ?? state.taskStatuses[taskId]?.progress ?? 0,
        message,
        error,
      };
      if (progress !== undefined) {
        state.uploadProgress[taskId] = progress;
      }
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
      // Fetch datasets
      .addCase(fetchDatasets.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchDatasets.fulfilled, (state, action) => {
        state.loading = false;
        state.datasets = action.payload;
      })
      .addCase(fetchDatasets.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch datasets';
      })
      // Fetch single dataset
      .addCase(fetchDataset.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchDataset.fulfilled, (state, action) => {
        state.loading = false;
        state.currentDataset = action.payload;
      })
      .addCase(fetchDataset.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch dataset';
      })
      // Upload files
      .addCase(uploadFiles.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(uploadFiles.fulfilled, (state, action) => {
        state.loading = false;
        state.datasets.unshift(action.payload);
        state.currentDataset = action.payload;
      })
      .addCase(uploadFiles.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to upload files';
      })
      // Delete dataset
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

