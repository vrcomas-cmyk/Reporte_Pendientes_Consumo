import { describe, it, expect, beforeEach } from 'vitest';
import { usePanelStore, type Panel } from './panelStore';

function reset() {
  usePanelStore.setState({ stack: [] });
}

const sample: Panel = { type: 'material', material: '100001' };

describe('panelStore', () => {
  beforeEach(reset);

  it('starts with empty stack', () => {
    expect(usePanelStore.getState().stack).toEqual([]);
  });

  it('open() replaces the stack', () => {
    usePanelStore.getState().open({ type: 'material', material: 'A' });
    usePanelStore.getState().open({ type: 'material', material: 'B' });
    expect(usePanelStore.getState().stack).toHaveLength(1);
    expect(usePanelStore.getState().stack[0]).toMatchObject({ material: 'B' });
  });

  it('push() appends to the stack', () => {
    usePanelStore.getState().open({ type: 'material', material: 'A' });
    usePanelStore.getState().push({ type: 'material', material: 'B' });
    usePanelStore.getState().push({ type: 'pedido', pedido: '123' });
    expect(usePanelStore.getState().stack).toHaveLength(3);
    expect(usePanelStore.getState().stack[2]).toMatchObject({ type: 'pedido', pedido: '123' });
  });

  it('back() pops the last entry', () => {
    usePanelStore.getState().open(sample);
    usePanelStore.getState().push({ type: 'material', material: 'X' });
    usePanelStore.getState().back();
    expect(usePanelStore.getState().stack).toHaveLength(1);
    expect(usePanelStore.getState().stack[0]).toMatchObject({ material: sample.material });
  });

  it('back() is a no-op when the stack is empty', () => {
    usePanelStore.getState().back();
    expect(usePanelStore.getState().stack).toEqual([]);
  });

  it('close() empties the stack', () => {
    usePanelStore.getState().open(sample);
    usePanelStore.getState().push({ type: 'material', material: 'X' });
    usePanelStore.getState().push({ type: 'material', material: 'Y' });
    usePanelStore.getState().close();
    expect(usePanelStore.getState().stack).toEqual([]);
  });
});
