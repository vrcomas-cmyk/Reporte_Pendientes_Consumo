import { create } from 'zustand';
import type { CatalogSnapshot, AnalysisResult, ProcessingProgress, AppSettings } from '@/core/types';
import { DEFAULT_SETTINGS } from '@/core/types';

interface DataState {
  catalog: CatalogSnapshot | null;
  catalogLoading: boolean;
  activeAnalysis: AnalysisResult | null;
  progress: ProcessingProgress;
  settings: AppSettings;
  /** True once `AppShell`'s one-time IndexedDB restore (catalog + last
   * analysis + settings) has settled. Before that, `activeAnalysis` being
   * `null` doesn't mean "no data" — it means "hasn't loaded from disk yet".
   * Pages with a hard `rows.length === 0 -> EmptyState "sube un archivo"`
   * check need this to avoid flashing that message during the brief restore
   * window on every cold load, even when a report IS cached. */
  bootstrapped: boolean;

  setCatalog: (c: CatalogSnapshot | null) => void;
  setCatalogLoading: (v: boolean) => void;
  setActiveAnalysis: (a: AnalysisResult | null) => void;
  setProgress: (p: ProcessingProgress) => void;
  setSettings: (s: AppSettings) => void;
  setBootstrapped: (v: boolean) => void;
}

export { DEFAULT_SETTINGS };

export const useDataStore = create<DataState>((set) => ({
  catalog: null,
  catalogLoading: false,
  activeAnalysis: null,
  progress: { phase: 'idle', percent: 0, message: '' },
  settings: DEFAULT_SETTINGS,
  bootstrapped: false,

  setCatalog: (c) => set({ catalog: c }),
  setCatalogLoading: (v) => set({ catalogLoading: v }),
  setActiveAnalysis: (a) => set({ activeAnalysis: a }),
  setProgress: (p) => set({ progress: p }),
  setSettings: (s) => set({ settings: s }),
  setBootstrapped: (v) => set({ bootstrapped: v }),
}));
