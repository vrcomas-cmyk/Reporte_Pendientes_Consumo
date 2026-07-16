import { create } from 'zustand';
import type { CatalogSnapshot, AnalysisResult, ProcessingProgress, AppSettings } from '@/core/types';

interface DataState {
  catalog: CatalogSnapshot | null;
  catalogLoading: boolean;
  activeAnalysis: AnalysisResult | null;
  progress: ProcessingProgress;
  settings: AppSettings;

  setCatalog: (c: CatalogSnapshot | null) => void;
  setCatalogLoading: (v: boolean) => void;
  setActiveAnalysis: (a: AnalysisResult | null) => void;
  setProgress: (p: ProcessingProgress) => void;
  setSettings: (s: AppSettings) => void;
}

export const DEFAULT_SETTINGS: AppSettings = { id: 'current', shortExpiryDays: 90, lowStockThreshold: 5 };

export const useDataStore = create<DataState>((set) => ({
  catalog: null,
  catalogLoading: false,
  activeAnalysis: null,
  progress: { phase: 'idle', percent: 0, message: '' },
  settings: DEFAULT_SETTINGS,

  setCatalog: (c) => set({ catalog: c }),
  setCatalogLoading: (v) => set({ catalogLoading: v }),
  setActiveAnalysis: (a) => set({ activeAnalysis: a }),
  setProgress: (p) => set({ progress: p }),
  setSettings: (s) => set({ settings: s }),
}));
