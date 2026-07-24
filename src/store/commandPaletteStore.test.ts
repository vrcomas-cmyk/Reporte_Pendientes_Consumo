import { describe, it, expect, beforeEach } from 'vitest';
import { useCommandPaletteStore } from './commandPaletteStore';

function reset() {
  useCommandPaletteStore.setState({ open: false });
}

describe('commandPaletteStore', () => {
  beforeEach(reset);

  it('starts closed', () => {
    expect(useCommandPaletteStore.getState().open).toBe(false);
  });

  it('openPalette() opens it', () => {
    useCommandPaletteStore.getState().openPalette();
    expect(useCommandPaletteStore.getState().open).toBe(true);
  });

  it('closePalette() closes it', () => {
    useCommandPaletteStore.getState().openPalette();
    useCommandPaletteStore.getState().closePalette();
    expect(useCommandPaletteStore.getState().open).toBe(false);
  });

  it('toggle() flips state', () => {
    useCommandPaletteStore.getState().toggle();
    expect(useCommandPaletteStore.getState().open).toBe(true);
    useCommandPaletteStore.getState().toggle();
    expect(useCommandPaletteStore.getState().open).toBe(false);
  });
});
