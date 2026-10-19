import { describe, it, expect, beforeAll } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { Sheet, SheetContent, SheetTitle } from './sheet';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

// Radix Popper mide con ResizeObserver; happy-dom no siempre lo trae.
beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  if (!('ResizeObserver' in globalThis)) {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  }
});

describe('Popover dentro de un Sheet modal', () => {
  it('se monta dentro del contenido del Sheet (en body no recibiría clics por el pointer-events:none del modal)', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <Sheet open>
          <SheetContent>
            <SheetTitle>Detalle</SheetTitle>
            <Popover open>
              <PopoverTrigger>filtro</PopoverTrigger>
              <PopoverContent><span id="dentro-del-popover">valores</span></PopoverContent>
            </Popover>
          </SheetContent>
        </Sheet>,
      );
    });
    const sheet = document.querySelector('[role="dialog"]');
    const contenido = document.getElementById('dentro-del-popover');
    expect(sheet).not.toBeNull();
    expect(contenido).not.toBeNull();
    expect(sheet!.contains(contenido)).toBe(true);
    await act(async () => { root.unmount(); });
  });

  it('fuera de un Sheet sigue montándose en body', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <Popover open>
          <PopoverTrigger>filtro</PopoverTrigger>
          <PopoverContent><span id="fuera-de-sheet">valores</span></PopoverContent>
        </Popover>,
      );
    });
    const el = document.getElementById('fuera-de-sheet');
    expect(el).not.toBeNull();
    expect(host.contains(el)).toBe(false); // portado a body, no dentro del host
    await act(async () => { root.unmount(); });
  });
});
