import { useEffect, useMemo, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Search, CornerDownLeft, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCommandPaletteStore } from '@/store/commandPaletteStore';
import { useUiStore } from '@/store/uiStore';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, UploadCloud, Wand2, Table2, ClipboardList, Activity, Grid3x3,
  Boxes, LineChart, HandCoins, Truck, History, ScrollText, Settings, Moon, Sun,
  type LucideIcon,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// CommandPalette · Ctrl+K overlay. Combines:
//   1. Page navigation (g d → Dashboard, g s → Sugerencias, etc.)
//   2. App actions (toggle theme, focus search, close panel)
// The list is rebuilt statically — small enough that filtering 30 entries by
// substring is instant; no virtualization or backend lookup needed.
// ---------------------------------------------------------------------------

interface Cmd {
  id: string;
  label: string;
  hint?: string;
  icon?: LucideIcon;
  group: 'Navegación' | 'Acciones';
  keywords?: string;
  run: () => void;
}

const PAGES: { to: string; label: string; icon: LucideIcon; hint: string }[] = [
  { to: '/', label: 'Panel general', icon: LayoutDashboard, hint: 'g d' },
  { to: '/carga', label: 'Carga de archivos', icon: UploadCloud, hint: 'g c' },
  { to: '/generar', label: 'Generar reporte', icon: Wand2, hint: 'g r' },
  { to: '/resultados', label: 'Resultados', icon: Table2, hint: 'g t' },
  { to: '/sugerencias', label: 'Sugerencias', icon: ClipboardList, hint: 'g s' },
  { to: '/consumo', label: 'Consumo', icon: Activity, hint: 'g o' },
  { to: '/resumen-sin', label: 'Resumen Sin Sug.', icon: Grid3x3, hint: 'g n' },
  { to: '/inventario', label: 'Inventario', icon: Boxes, hint: 'g i' },
  { to: '/analisis', label: 'Análisis', icon: LineChart, hint: 'g a' },
  { to: '/comodato', label: 'Comodato vs. Fac.', icon: HandCoins, hint: 'g m' },
  { to: '/solicitudes', label: 'Solicitudes DRP', icon: Truck, hint: 'g q' },
  { to: '/historial', label: 'Historial', icon: History, hint: 'g h' },
  { to: '/registros', label: 'Registros', icon: ScrollText, hint: 'g l' },
  { to: '/ajustes', label: 'Ajustes', icon: Settings, hint: 'g x' },
];

function useCommands(): Cmd[] {
  const navigate = useNavigate();
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const theme = useUiStore((s) => s.theme);

  return useMemo(() => {
    const pages: Cmd[] = PAGES.map((p) => ({
      id: `nav:${p.to}`,
      label: p.label,
      hint: p.hint,
      icon: p.icon,
      group: 'Navegación',
      keywords: `ir ${p.label}`,
      run: () => navigate(p.to),
    }));
    const actions: Cmd[] = [
      {
        id: 'act:theme',
        label: theme === 'dark' ? 'Tema claro' : 'Tema oscuro',
        icon: theme === 'dark' ? Sun : Moon,
        group: 'Acciones',
        hint: 't',
        keywords: 'tema dark light toggle dark mode',
        run: toggleTheme,
      },
      {
        id: 'act:focus-search',
        label: 'Enfocar búsqueda de la página',
        icon: Search,
        group: 'Acciones',
        hint: '/',
        keywords: 'search focus filter buscar',
        run: () => {
          const el = document.querySelector<HTMLInputElement>(
            'input[type="text"], input[type="search"], input[placeholder*="Buscar"], input[placeholder*="Filtrar"]',
          );
          el?.focus();
          el?.select();
        },
      },
    ];
    return [...pages, ...actions];
  }, [navigate, theme, toggleTheme]);
}

const strip = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function CommandPalette() {
  const open = useCommandPaletteStore((s) => s.open);
  const closePalette = useCommandPaletteStore((s) => s.closePalette);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const cmds = useCommands();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset query and selection whenever the palette opens or closes.
  useEffect(() => { if (open) { setQ(''); setActive(0); setTimeout(() => inputRef.current?.focus(), 0); } }, [open]);

  const filtered = useMemo(() => {
    const nq = strip(q);
    if (!nq) return cmds;
    return cmds.filter((c) =>
      strip(c.label).includes(nq) ||
      (c.keywords && strip(c.keywords).includes(nq)) ||
      (c.hint && strip(c.hint).includes(nq)),
    );
  }, [cmds, q]);

  // Keep active index in range when filtered set changes.
  useEffect(() => { if (active >= filtered.length) setActive(Math.max(0, filtered.length - 1)); }, [filtered.length, active]);

  const run = (c?: Cmd) => {
    if (!c) return;
    closePalette();
    c.run();
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => (o ? useCommandPaletteStore.getState().openPalette() : closePalette())}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-sm" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-[12vh] z-[91] w-[92vw] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-2xl"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(filtered.length - 1, i + 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
            else if (e.key === 'Enter') { e.preventDefault(); run(filtered[active]); }
          }}
        >
          <DialogPrimitive.Title className="sr-only">Paleta de comandos</DialogPrimitive.Title>
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="size-4 text-text-faint" aria-hidden />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => { setQ(e.target.value); setActive(0); }}
              placeholder="Busca una página o acción…"
              className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-text-faint"
              autoComplete="off"
              spellCheck={false}
            />
            <kbd className="rounded border border-border bg-bg-inset px-1.5 py-0.5 text-[10px] text-text-faint">Esc</kbd>
          </div>
          <div className="max-h-[60vh] overflow-y-auto py-1">
            {filtered.length === 0 && (
              <p className="py-8 text-center text-sm text-text-faint">Sin coincidencias.</p>
            )}
            {filtered.map((c, i) => {
              const Icon = c.icon;
              return (
                <button
                  key={c.id}
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => run(c)}
                  className={cn(
                    'flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors',
                    i === active ? 'bg-bg-inset text-text' : 'text-text-muted hover:bg-bg-inset/60',
                  )}
                >
                  {Icon && <Icon className="size-4 shrink-0" aria-hidden />}
                  <span className="flex-1 truncate">{c.label}</span>
                  {c.hint && (
                    <kbd className="rounded border border-border bg-bg px-1.5 py-0.5 text-[10px] text-text-faint">{c.hint}</kbd>
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between border-t border-border px-3 py-2 text-[11px] text-text-faint">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1"><ArrowUp className="size-3" /><ArrowDown className="size-3" /> navegar</span>
              <span className="flex items-center gap-1"><CornerDownLeft className="size-3" /> ejecutar</span>
            </div>
            <button onClick={() => { toggleSidebar(); }} className="hover:text-text">⌘B colapsa barra</button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
