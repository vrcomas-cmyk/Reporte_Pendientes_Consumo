import { create } from 'zustand';

// ---------------------------------------------------------------------------
// commandPaletteStore · open/close state for the palette UI. The actual list
// of commands lives in `src/components/navigation/commands.tsx` (building it
// requires router/navigation context, so it's not in here).
//
// Anyone can call `openPalette()` / `closePalette()` to focus the overlay.
// ---------------------------------------------------------------------------

interface CommandPaletteState {
  open: boolean;
  openPalette: () => void;
  closePalette: () => void;
  toggle: () => void;
}

export const useCommandPaletteStore = create<CommandPaletteState>((set) => ({
  open: false,
  openPalette: () => set({ open: true }),
  closePalette: () => set({ open: false }),
  toggle: () => set((s) => ({ open: !s.open })),
}));
