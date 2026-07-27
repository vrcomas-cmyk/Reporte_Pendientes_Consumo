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
  Wand2,
  HandCoins,
  Truck,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/store/uiStore';

const NAV = [
  { to: '/', label: 'Panel', icon: LayoutDashboard, end: true },
  { to: '/carga', label: 'Carga', icon: UploadCloud },
  { to: '/generar', label: 'Generar reporte', icon: Wand2 },
  { to: '/procesamiento', label: 'Procesamiento', icon: Loader2 },
  { to: '/resultados', label: 'Resultados', icon: Table2 },
  { to: '/sugerencias', label: 'Sugerencias', icon: ClipboardList },
  { to: '/consumo', label: 'Consumo', icon: Activity },
  { to: '/resumen-sin', label: 'Resumen Sin Sug.', icon: Grid3x3 },
  { to: '/inventario', label: 'Inventario', icon: Boxes },
  { to: '/analisis', label: 'Análisis', icon: LineChart },
  { to: '/comodato', label: 'Comodato vs. Fac.', icon: HandCoins },
  { to: '/solicitudes', label: 'Solicitudes DRP', icon: Truck },
  { to: '/historial', label: 'Historial', icon: History },
  { to: '/registros', label: 'Registros', icon: ScrollText },
  { to: '/ajustes', label: 'Ajustes', icon: Settings },
];

interface SidebarProps {
  /** True while the mobile drawer (< md) is open. Ignored at md+ where the
   * sidebar is always the normal fixed rail. */
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export function Sidebar({ mobileOpen = false, onCloseMobile }: SidebarProps) {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  // Hover-to-peek: when the sidebar is pinned collapsed, hovering it briefly
  // (after a short hover-intent delay, so a quick cursor pass doesn't
  // trigger it) visually expands it without changing the pinned state.
  // Mouse-out collapses it again immediately. Touch/mobile has no hover, so
  // this only ever matters at md+ (the desktop rail).
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

  // The mobile drawer always shows full labels — a collapsed, icon-only
  // overlay makes no sense for a menu you just opened on purpose.
  const expanded = mobileOpen || !collapsed || peeking;

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={onCloseMobile} aria-hidden />
      )}
      <motion.aside
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        animate={{ width: expanded ? 232 : 68 }}
        transition={{ type: 'spring', stiffness: 300, damping: 32 }}
        className={cn(
          'h-full shrink-0 flex-col border-r border-border bg-bg-elevated',
          mobileOpen
            ? 'fixed inset-y-0 left-0 z-40 flex shadow-2xl md:static md:z-auto md:shadow-none'
            : 'hidden md:relative md:flex',
          !mobileOpen && collapsed && peeking && 'md:z-30 md:shadow-xl',
        )}
      >
        <div className="flex h-14 items-center gap-2 px-4">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-accent text-accent-fg">
            <Warehouse className="size-4" />
          </div>
          {expanded && (
            <span className="font-display text-sm font-semibold tracking-tight text-text">DEGASA</span>
          )}
          {mobileOpen && (
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Cerrar menú"
              className="ml-auto flex size-7 items-center justify-center rounded-md text-text-faint hover:bg-bg-inset hover:text-text md:hidden"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 px-2 pt-2">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => onCloseMobile?.()}
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
          className="m-2 hidden items-center justify-center gap-2 rounded-md border border-border py-1.5 text-xs text-text-faint transition-colors hover:bg-bg-inset hover:text-text md:flex"
        >
          {collapsed ? <ChevronsRight className="size-3.5" /> : <ChevronsLeft className="size-3.5" />}
        </button>
      </motion.aside>
    </>
  );
}
