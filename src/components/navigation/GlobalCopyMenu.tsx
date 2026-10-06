import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy } from 'lucide-react';
import { useClipboard } from '@/hooks/useClipboard';
import { capturarClicDerecho, getClickCopy, recortar, setClickCopy, type ClickCopy } from '@/lib/clickCopy';

interface MenuState { x: number; y: number; info: ClickCopy; host: HTMLElement | null }

const ANCHO = 260;

const esEditable = (t: HTMLElement) => !!t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]');

/** Clic derecho "Copiar" en cualquier lugar. Un listener en fase de captura
 * guarda qué hay bajo el cursor (selección, palabra, celda/línea) para que
 * también lo usen los menús de fila de Radix; si ningún menú de fila atendió
 * el clic (`defaultPrevented`), este abre uno propio con las opciones de copiar.
 * Dentro de un Sheet/Dialog se renderiza DENTRO del diálogo: el Dialog modal
 * deja `pointer-events: none` fuera de su contenido y cerraría al hacer clic
 * en un menú que viva en `body`. Inputs/textarea conservan el menú nativo. */
export function GlobalCopyMenu() {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const { copy } = useClipboard();

  useEffect(() => {
    const capturar = (e: MouseEvent) => setClickCopy(capturarClicDerecho(e.target, e.clientX, e.clientY));
    const abrir = (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      const t = e.target instanceof HTMLElement ? e.target : null;
      if (!t || esEditable(t)) return;
      const info = getClickCopy();
      if (!info.seleccion && !info.palabra && !info.bloque) return;
      e.preventDefault();
      setMenu({ x: e.clientX, y: e.clientY, info, host: t.closest<HTMLElement>('[role="dialog"]') });
    };
    document.addEventListener('contextmenu', capturar, true);
    document.addEventListener('contextmenu', abrir);
    return () => {
      document.removeEventListener('contextmenu', capturar, true);
      document.removeEventListener('contextmenu', abrir);
    };
  }, []);

  useEffect(() => {
    if (!menu) return;
    const cerrar = () => setMenu(null);
    const fuera = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) cerrar(); };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar(); };
    document.addEventListener('pointerdown', fuera, true);
    document.addEventListener('keydown', tecla);
    window.addEventListener('scroll', cerrar, true);
    window.addEventListener('resize', cerrar);
    return () => {
      document.removeEventListener('pointerdown', fuera, true);
      document.removeEventListener('keydown', tecla);
      window.removeEventListener('scroll', cerrar, true);
      window.removeEventListener('resize', cerrar);
    };
  }, [menu]);

  if (!menu) return null;
  const { info, host } = menu;
  const items: { label: string; valor: string }[] = [];
  if (info.seleccion) items.push({ label: `Copiar selección`, valor: info.seleccion });
  if (info.palabra) items.push({ label: `Copiar «${recortar(info.palabra)}»`, valor: info.palabra });
  if (info.bloque && info.bloque !== info.palabra && info.bloque !== info.seleccion) items.push({ label: `Copiar «${recortar(info.bloque)}»`, valor: info.bloque });

  // Fuera de un diálogo: fixed en coordenadas de ventana. Dentro: absolute respecto al diálogo (suma su scroll).
  const xv = Math.max(4, Math.min(menu.x, window.innerWidth - ANCHO - 8));
  const yv = Math.max(4, Math.min(menu.y, window.innerHeight - 40 * items.length - 16));
  const rect = host?.getBoundingClientRect();
  const estilo = host && rect
    ? { position: 'absolute' as const, left: xv - rect.left + host.scrollLeft, top: yv - rect.top + host.scrollTop, width: ANCHO }
    : { position: 'fixed' as const, left: xv, top: yv, width: ANCHO };

  return createPortal(
    <div
      ref={ref}
      role="menu"
      style={estilo}
      className="z-[100] rounded-md border border-border bg-bg-elevated p-1 text-sm shadow-lg"
    >
      {items.map((it) => (
        <button
          key={it.label}
          type="button"
          role="menuitem"
          onClick={() => { void copy(it.valor, 'Copiado'); setMenu(null); }}
          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-accent-soft focus:bg-accent-soft focus:outline-none"
        >
          <Copy className="size-3.5 shrink-0" />
          <span className="min-w-0 truncate">{it.label}</span>
        </button>
      ))}
    </div>,
    host ?? document.body,
  );
}
