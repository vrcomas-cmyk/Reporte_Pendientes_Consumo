import type { ComponentType, ReactNode, Ref } from 'react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// PLANTILLA "DETALLE EN MOSAICO" (vista guardada del detalle de Seg. de pedidos).
//
//   ┌ cabecera: identidad + datos generales + cifras clave ─────────────────────┐
//   ├──────────────┬───────────────────────────────────────────────────────────┤
//   │ 1 · Lista    │ 3 · Historial / facturación (con consumo promedio)        │
//   │ (con scroll) │                                                           │
//   │ 2 · Inventario│ 4 · Lotes, condiciones y materiales ofertables           │
//   └──────────────┴───────────────────────────────────────────────────────────┘
//
// Reglas de tamaño (todas por el ANCHO DEL PANEL, con container queries, no por el de la ventana):
//   · < 36 rem  : todo en una columna.
//   · ≥ 36 rem  : los módulos 1 y 2 van lado a lado (media pantalla / tablet).
//   · ≥ 64 rem  : columna izquierda angosta (3/12) con 1 y 2 apilados + columna derecha (9/12) con 3 y 4.
//   · Solo el módulo 1 (lista) hace scroll interno (`ListaScroll`); los demás muestran todo su contenido.
// Documentación y receta para replicarla: docs/detalle-mosaico.md
// ---------------------------------------------------------------------------

/** Campo de metadato de la cabecera: icono + etiqueta + contenido. */
export function MetaField({ icon: Icon, label, children, className }: {
  icon?: ComponentType<{ className?: string }>;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 items-center gap-1.5', className)}>
      {Icon && <Icon className="size-3 shrink-0 text-text-faint" />}
      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-text-faint">{label}</span>
      <div className="flex min-w-0 items-center gap-1.5">{children}</div>
    </div>
  );
}

/** Ficha (módulo) del mosaico: marco con encabezado (icono, título, contenido a la derecha) y cuerpo. */
export function Tile({ icon: Icon, title, trailing, className, bodyClassName, children }: {
  icon?: ComponentType<{ className?: string }>;
  title: ReactNode;
  trailing?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('flex w-full flex-col overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-sm', className)}>
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 bg-bg-inset/40 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {Icon && <Icon className="size-3.5 shrink-0 text-accent" />}
          <span className="truncate text-xs font-semibold tracking-tight text-text">{title}</span>
        </div>
        {trailing && <div className="flex shrink-0 items-center gap-2">{trailing}</div>}
      </div>
      <div className={cn('min-h-0 flex-1', bodyClassName)}>{children}</div>
    </div>
  );
}

/** Lista con alto máximo y scroll interno (módulo 1): con 100 renglones no se despliegan todos.  `listRef` permite desplazar al renglón activo. */
export function ListaScroll({ children, className, listRef }: { children: ReactNode; className?: string; listRef?: Ref<HTMLDivElement> }) {
  return <div ref={listRef} className={cn('flex max-h-[18rem] flex-col gap-1.5 overflow-y-auto p-2 @5xl:max-h-[22rem]', className)}>{children}</div>;
}

/** Esqueleto del detalle: cabecera arriba y, debajo, columna izquierda (módulos 1 y 2) + columna derecha (3 y 4). */
export function DetalleMosaico({ cabecera, izquierda, derecha }: { cabecera: ReactNode; izquierda: ReactNode; derecha: ReactNode }) {
  return (
    <div className="@container">
      <div className="flex w-full flex-col gap-4 bg-bg p-3 @5xl:p-5">
        {/* Banda superior inmovilizada (cabecera con datos y cifras clave). */}
        <div className="@3xl:sticky @3xl:top-0 z-20 shadow-[0_8px_8px_-8px_rgba(0,0,0,0.25)] -mx-3 bg-bg px-3 pb-2 @5xl:-mx-5 @5xl:px-5">{cabecera}</div>
        <main className="grid w-full grid-cols-1 items-start gap-4 @5xl:grid-cols-12 @5xl:gap-5">
          <aside className="grid min-w-0 grid-cols-1 items-stretch gap-4 @xl:grid-cols-2 @5xl:col-span-3 @5xl:flex @5xl:flex-col">{izquierda}</aside>
          <section className="flex min-w-0 flex-col gap-4 @5xl:col-span-9">{derecha}</section>
        </main>
      </div>
    </div>
  );
}
