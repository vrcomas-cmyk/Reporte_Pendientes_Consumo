import { useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  UploadCloud,
  Loader2,
  Table2,
  History,
  ScrollText,
  Settings,
  ChevronsLeft,
  ChevronsRight,
  Warehouse,
  Boxes,
  ClipboardList,
  Activity,
  Grid3x3,
  LineChart,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/store/uiStore';

const NAV = [
  { to: '/', label: 'Panel', icon: LayoutDashboard, end: true },
  { to: '/carga', label: 'Carga', icon: UploadCloud },
  { to: '/procesamiento', label: 'Procesamiento', icon: Loader2 },
  { to: '/resultados', label: 'Resultados', icon: Table2 },
  { to: '/sugerencias', label: 'Sugerencias', icon: ClipboardList },
  { to: '/consumo', label: 'Consumo', icon: Activity },
  { to: '/resumen-sin', label: 'Resumen Sin Sug.', icon: Grid3x3 },
  { to: '/inventario', label: 'Inventario', icon: Boxes },
  { to: '/analisis', label: 'Análisis', icon: LineChart },
  { to: '/historial', label: 'Historial', icon: History },
  { to: '/registros', label: 'Registros', icon: ScrollText },
  { to: '/ajustes', label: 'Ajustes', icon: Settings },
];

export function Sidebar() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  // Hover-to-peek: when the sidebar is pinned collapsed, hovering it briefly
  // (after a short hover-intent delay, so a quick cursor pass doesn't
  // trigger it) visually expands it without changing the pinned state.
  // Mouse-out collapses it again immediately.
  const [peeking, setPeeking] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = () => {
    if (!collapsed) return;
    hoverTimer.current = setTimeout(() => setPeeking(true), 220);
  };
  const handleMouseLeave = () => {
    if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null; }
    setPeeking(false);
  };

  const expanded = !collapsed || peeking;

  return (
    <motion.aside
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      animate={{ width: expanded ? 232 : 68 }}
      transition={{ type: 'spring', stiffness: 300, damping: 32 }}
      className={cn(
        'relative flex h-full shrink-0 flex-col border-r border-border bg-bg-elevated',
        collapsed && peeking && 'z-30 shadow-xl',
      )}
    >
      <div className="flex h-14 items-center gap-2 px-4">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-accent text-accent-fg">
          <Warehouse className="size-4" />
        </div>
        {expanded && (
          <span className="font-display text-sm font-semibold tracking-tight text-text">DEGASA</span>
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-2 pt-2">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'group relative flex items-center gap-3 rounded-md px-2.5 py-2 text-sm transition-colors',
                isActive ? 'text-text' : 'text-text-muted hover:text-text hover:bg-bg-inset',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span
                    layoutId="sidebar-active"
                    className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-accent"
                    transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                  />
                )}
                <item.icon className={cn('size-4 shrink-0', isActive && 'text-accent')} />
                {expanded && <span className="truncate">{item.label}</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <button
        onClick={toggleSidebar}
        className="m-2 flex items-center justify-center gap-2 rounded-md border border-border py-1.5 text-xs text-text-faint transition-colors hover:bg-bg-inset hover:text-text"
      >
        {collapsed ? <ChevronsRight className="size-3.5" /> : <ChevronsLeft className="size-3.5" />}
      </button>
    </motion.aside>
  );
}
