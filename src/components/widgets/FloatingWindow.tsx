import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { GripHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePersistedState } from '@/hooks/usePersistedState';

/** Capa de los widgets flotantes: sobre dialog/sheet/popover (z-50) y bajo CommandPalette (90), Cheatsheet (95) y Toaster (100). */
export const Z_WIDGET = 'z-[80]';

/** Eventos que Radix escucha en `document` para cerrar el diálogo, atrapar el foco o bloquear el scroll
 * cuando algo ocurre FUERA de él. Se frenan en el panel para que un diálogo modal abierto no lo trate como "fuera". */
const EVENTOS_AISLADOS = ['pointerdown', 'mousedown', 'focusin', 'wheel', 'touchmove'] as const;

interface Props {
  titulo: string;
  icono?: ReactNode;
  /** Clave de persistencia de la posición (distancia a la esquina inferior derecha). */
  posKey: string;
  posInicial: { x: number; y: number };
  onClose: () => void;
  className?: string;
  /** Permite redimensionar desde la esquina (para tablas). */
  redimensionable?: boolean;
  children: ReactNode;
}

/** Ventana flotante arrastrable, portaleada a <body>, que sigue siendo usable aunque haya un diálogo modal abierto. */
export function FloatingWindow({ titulo, icono, posKey, posInicial, onClose, className, redimensionable, children }: Props) {
  const [pos, setPos] = usePersistedState(posKey, posInicial);
  const panelRef = useRef<HTMLDivElement>(null);
  const ultimaPos = useRef<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  // El freno va en <html>, NO en el panel: React delega los eventos del portal en <body>, así que frenar en el panel
  // le quitaba a React los pointerdown (el arrastre dejaba de funcionar). En <html> el evento ya pasó por React (body)
  // y todavía no llega a `document`, donde escucha Radix.
  useEffect(() => {
    const raiz = document.documentElement;
    const dentro = (n: EventTarget | null) => n instanceof Node && !!panelRef.current?.contains(n);
    const frenar = (e: Event) => { if (dentro(e.target)) e.stopPropagation(); };
    // Al pasar el foco de un diálogo a un campo del panel, el `focusout` nace en el diálogo (relatedTarget = el campo):
    // Radix lo usa para devolverle el foco al diálogo y por eso no se podía escribir ni copiar.
    const frenarSalida = (e: FocusEvent) => { if (dentro(e.relatedTarget)) e.stopPropagation(); };
    for (const t of EVENTOS_AISLADOS) raiz.addEventListener(t, frenar);
    raiz.addEventListener('focusout', frenarSalida);
    return () => {
      for (const t of EVENTOS_AISLADOS) raiz.removeEventListener(t, frenar);
      raiz.removeEventListener('focusout', frenarSalida);
    };
  }, []);

  const onDragStart = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [pos]);

  const onDragMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const w = panelRef.current?.offsetWidth ?? 256;
    const h = panelRef.current?.offsetHeight ?? 200;
    // Distancia a la esquina inferior derecha, limitada para que la barra de título nunca salga del viewport.
    const x = Math.min(Math.max(0, d.origX - (e.clientX - d.startX)), Math.max(0, window.innerWidth - w));
    const y = Math.min(Math.max(0, d.origY - (e.clientY - d.startY)), Math.max(0, window.innerHeight - h));
    // Durante el arrastre se mueve el panel directo en el DOM (sin re-render ni escritura a localStorage por cada pixel);
    // la posición se guarda una sola vez al soltar.
    ultimaPos.current = { x, y };
    if (panelRef.current) { panelRef.current.style.right = `${x}px`; panelRef.current.style.bottom = `${y}px`; }
  }, []);

  const onDragEnd = useCallback((e: React.PointerEvent) => {
    if (dragRef.current && ultimaPos.current) setPos(ultimaPos.current);
    ultimaPos.current = null;
    dragRef.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ya liberado */ }
  }, [setPos]);

  return createPortal(
    <div
      ref={panelRef}
      data-floating-widget
      className={cn(
        'pointer-events-auto fixed flex max-h-[90vh] max-w-[96vw] select-none flex-col overflow-hidden rounded-lg border border-border bg-bg-elevated shadow-2xl',
        Z_WIDGET,
        redimensionable && 'resize overflow-auto',
        className,
      )}
      style={{ right: pos.x, bottom: pos.y }}
    >
      <div
        className="flex shrink-0 cursor-grab items-center justify-between border-b border-border bg-bg-inset px-3 py-2 active:cursor-grabbing"
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
      >
        <div className="flex items-center gap-1.5 text-xs font-medium text-text-muted">
          <GripHorizontal className="size-3.5" /> {icono}{titulo}
        </div>
        <button type="button" onClick={onClose} aria-label="Cerrar" className="text-text-faint hover:text-text">
          <X className="size-4" />
        </button>
      </div>
      {children}
    </div>,
    document.body,
  );
}
