import { create } from 'zustand';
import type { ProcessingProgress } from '@/core/types';

/** Global (not per-page) state for the Google Sheets report sync — so it
 * survives navigating away from Carga and back (a plain per-component
 * `useState` would reset on remount, hiding an in-flight sync and inviting
 * the user to accidentally start a second, overlapping one), and so any
 * page can show a subtle "sincronizando…" indicator regardless of route.
 * Old data (`useDataStore.activeAnalysis`) is left untouched for the whole
 * duration — `reportSheetsService.syncReportSheets` only calls
 * `setActiveAnalysis` once the fresh result is ready, so this is purely
 * about surfacing progress, never about gating access to the current data. */
interface ReportSheetsSyncState {
  syncing: boolean;
  progress: ProcessingProgress | null;
  error: string | null;
  start: () => void;
  setProgress: (p: ProcessingProgress) => void;
  finish: (error?: string) => void;
}

export const useReportSheetsSyncStore = create<ReportSheetsSyncState>((set) => ({
  syncing: false,
  progress: null,
  error: null,
  start: () => set({ syncing: true, progress: null, error: null }),
  setProgress: (p) => set({ progress: p }),
  finish: (error) => set({ syncing: false, error: error ?? null }),
}));
