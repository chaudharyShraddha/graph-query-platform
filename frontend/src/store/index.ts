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
        ignoredActionPaths: ['meta.arg', 'payload.timestamp'],
        ignoredPaths: ['items.dates'],
      },
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

