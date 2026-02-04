/**
 * Redux store configuration
 */
import { configureStore } from '@reduxjs/toolkit';
import datasetsReducer from './slices/datasetsSlice';
import queriesReducer from './slices/queriesSlice';
import uiReducer from './slices/uiSlice';

export const store = configureStore({
  reducer: {
    datasets: datasetsReducer,
    queries: queriesReducer,
    ui: uiReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore these action types
        ignoredActions: ['datasets/uploadFiles/pending'],
        // Ignore these field paths in all actions
        ignoredActionPaths: ['meta.arg', 'payload.timestamp'],
        // Ignore these paths in the state
        ignoredPaths: ['items.dates'],
      },
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

