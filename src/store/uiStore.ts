import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'light' | 'dark';
export type Skin = 'classic' | 'apple';

interface UiState {
  theme: Theme;
  skin: Skin;
  sidebarCollapsed: boolean;
  lastViewPath: string;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  setSkin: (s: Skin) => void;
  toggleSkin: () => void;
  toggleSidebar: () => void;
  setLastViewPath: (p: string) => void;
}

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

function applySkin(skin: Skin) {
  if (typeof document === 'undefined') return;
  if (skin === 'apple') document.documentElement.setAttribute('data-skin', 'apple');
  else document.documentElement.removeAttribute('data-skin');
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      theme: typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
      skin: 'classic',
      sidebarCollapsed: false,
      lastViewPath: '/',
      setLastViewPath: (p) => set({ lastViewPath: p }),
      setTheme: (t) => {
        applyTheme(t);
        set({ theme: t });
      },
      toggleTheme: () => {
        const next = get().theme === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        set({ theme: next });
      },
      setSkin: (s) => {
        applySkin(s);
        set({ skin: s });
      },
      toggleSkin: () => {
        const next = get().skin === 'apple' ? 'classic' : 'apple';
        applySkin(next);
        set({ skin: next });
      },
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    }),
    {
      name: 'degasa-ui',
      onRehydrateStorage: () => (state) => {
        if (state) {
          applyTheme(state.theme);
          applySkin(state.skin);
        }
      },
    },
  ),
);
