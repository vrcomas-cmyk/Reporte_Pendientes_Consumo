import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useKeybindings, type KeyHandler } from '@/hooks/useKeybindings';
import { useCommandPaletteStore } from '@/store/commandPaletteStore';
import { useUiStore } from '@/store/uiStore';
import { usePanelStore } from '@/store/panelStore';
import { CommandPalette } from './CommandPalette';
import { CheatsheetDialog } from './CheatsheetDialog';

// ---------------------------------------------------------------------------
// GlobalKeybindings · single host declared once in AppShell. Owns:
//   - Cmd/Ctrl + K  · toggle command palette
//   - ?            · toggle cheatsheet
//   - t            · toggle theme
//   - b            · toggle sidebar
//   - /            · focus the page's main search box
//   - Esc          · dismiss open panel / cheatsheet (palette handles its own)
//
// `g <x>` two-step chords (legacy vim-style "press g, then d for Dashboard")
// are implemented as a tiny state machine: the first keystroke primes the
// chord for 800ms; the second one resolves it. If the second keystroke isn't
// a known chord key, the prime is cancelled.
//
// Inputs with focus (textareas, inputs, contenteditable) swallow keys via the
// `isEditableTarget` check so the user can type `/`, `b`, `?` etc. into forms
// without triggering shortcuts. Modifier-chorded shortcuts (Cmd+K, Cmd+B)
// always work, even with a form focused.
// ---------------------------------------------------------------------------

const CHORD_NAV: Record<string, string> = {
  d: '/', y: '/hoy', c: '/carga', s: '/sugerencias', o: '/consumo',
  n: '/resumen-sin', i: '/inventario', a: '/analisis', p: '/oportunidades',
  m: '/comodato', q: '/solicitudes', h: '/historial', l: '/registros',
  x: '/ajustes', t: '/resultados',
};

function isEditableTarget(ev: KeyboardEvent): boolean {
  const el = ev.target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return el.isContentEditable;
}

export function GlobalKeybindings() {
  const navigate = useNavigate();
  const togglePalette = useCommandPaletteStore((s) => s.toggle);
  const closePalette = useCommandPaletteStore((s) => s.closePalette);
  const paletteOpen = useCommandPaletteStore((s) => s.open);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const closePanel = usePanelStore((s) => s.close);
  const panelOpen = usePanelStore((s) => s.stack.length > 0);
  const [cheatsheet, setCheatsheet] = useState(false);
  const [primed, setPrimed] = useState(false);

  const prime = useCallback(() => {
    setPrimed(true);
    setTimeout(() => setPrimed(false), 800);
  }, []);

  const handlers = useMemo<KeyHandler[]>(() => {
    const h: KeyHandler[] = [
      // Modifier chords always fire, even with a form focused — they need to
      // preempt the browser's own Ctrl+K/Ctrl+B behavior either way.
      { combo: 'cmd+k', handler: (ev) => { ev.preventDefault(); togglePalette(); } },
      { combo: 'cmd+b', handler: (ev) => { ev.preventDefault(); toggleSidebar(); } },
      {
        combo: '?',
        handler: (ev) => {
          if (isEditableTarget(ev)) return;
          ev.preventDefault();
          setCheatsheet(true);
        },
      },
      {
        combo: 'Escape',
        handler: (ev) => {
          if (paletteOpen) { ev.preventDefault(); closePalette(); return; }
          if (cheatsheet) { ev.preventDefault(); setCheatsheet(false); return; }
          if (panelOpen) { ev.preventDefault(); closePanel(); return; }
        },
      },
      {
        combo: 't',
        handler: (ev) => {
          if (isEditableTarget(ev)) return;
          ev.preventDefault();
          toggleTheme();
        },
      },
      {
        combo: 'b',
        handler: (ev) => {
          if (isEditableTarget(ev)) return;
          ev.preventDefault();
          toggleSidebar();
        },
      },
      {
        combo: '/',
        handler: (ev) => {
          if (isEditableTarget(ev)) return;
          ev.preventDefault();
          const el = document.querySelector<HTMLInputElement>(
            'input[type="text"], input[type="search"], input[placeholder*="Buscar"], input[placeholder*="Filtrar"]',
          );
          el?.focus();
          el?.select();
        },
      },
      {
        combo: 'g',
        handler: (ev) => {
          if (isEditableTarget(ev)) return;
          ev.preventDefault();
          prime();
        },
      },
    ];
    // One-entry-per-`g-<x>` chord. Triggered only when primed — bare letters
    // like `o`/`n`/`m` are ordinary printable keys everywhere else (typing
    // into a search box, a dialog field, etc.), so nothing here may
    // preventDefault unless BOTH primed is true AND the target isn't editable.
    for (const [k, to] of Object.entries(CHORD_NAV)) {
      h.push({
        combo: k,
        handler: (ev) => {
          if (!primed) return;
          if (isEditableTarget(ev)) return;
          ev.preventDefault();
          setPrimed(false);
          navigate(to);
        },
      });
    }
    return h;
  }, [togglePalette, toggleSidebar, paletteOpen, cheatsheet, panelOpen, closePalette, closePanel, toggleTheme, primed, prime, navigate]);

  const enabled = !cheatsheet && !paletteOpen;

  useKeybindings(handlers, enabled);

  return (
    <>
      <CommandPalette />
      <CheatsheetDialog open={cheatsheet} onOpenChange={setCheatsheet} />
    </>
  );
}
