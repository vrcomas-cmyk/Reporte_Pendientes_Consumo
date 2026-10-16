import { useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { construirDetalleMaterial, type Celda, type LibroClave, type SeccionDetalle, type VistaTabla } from '@/core/pedidos';
import { usePedidosStore } from '@/store/pedidosStore';

/** Filas máximas por tabla dentro del modal — un material puede tener cientos en Seg pedidos. */
const MAX_FILAS = 200;

/** Color y nombre del libro de origen de cada sección (mismo criterio que los paneles de detalle). */
const LIBRO: Record<LibroClave, { cls: string; nombre: string }> = {
  disponibilidad: { cls: 'bg-success/10 text-success', nombre: 'Disponibilidad' },
  pedidos: { cls: 'bg-warning/10 text-warning', nombre: 'Seg pedidos' },
  condicion: { cls: 'bg-accent-soft text-accent', nombre: 'Inv_Condicion' },
  comodato: { cls: 'bg-bg-inset text-text-muted', nombre: 'Comodato' },
};

function celda(v: Celda): string {
  return typeof v === 'number' ? v.toLocaleString('es-MX', { maximumFractionDigits: 3 }) : v;
}

function VistaTablaView({ vista }: { vista: VistaTabla }) {
  const visibles = vista.filas.slice(0, MAX_FILAS);
  return (
    <div className="space-y-1">
      <Table wrapperClassName="max-h-[40vh] rounded-md border border-border" className="text-xs">
        <TableHeader className="sticky top-0 z-10 bg-bg-elevated">
          <TableRow>
            {vista.columnas.map((c, i) => <TableHead key={i} className="whitespace-nowrap">{c}</TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibles.map((fila, r) => (
            <TableRow key={r}>
              {fila.map((v, c) => (
                <TableCell key={c} className={typeof v === 'number' ? 'text-right tabular-nums' : 'whitespace-nowrap'}>{celda(v)}</TableCell>
              ))}
            </TableRow>
          ))}
          {vista.pie && (
            <TableRow className="bg-bg-inset font-semibold">
              {vista.pie.map((v, c) => (
                <TableCell key={c} className={typeof v === 'number' ? 'text-right tabular-nums' : undefined}>{celda(v)}</TableCell>
              ))}
            </TableRow>
          )}
        </TableBody>
      </Table>
      {vista.filas.length > visibles.length && (
        <p className="text-xs text-text-muted">Mostrando {visibles.length} de {vista.filas.length} filas.</p>
      )}
      {vista.nota && <p className="text-xs italic text-text-muted">{vista.nota}</p>}
    </div>
  );
}

/** Tarjeta de una sección: encabezado con el color de su libro, conteo y sus bloques (tablas o mensajes). */
function SeccionCard({ s }: { s: SeccionDetalle }) {
  const libro = s.libro ? LIBRO[s.libro] : null;
  // Las tablas con muchas columnas necesitan todo el ancho; el resto se acomoda en 2 columnas.
  const ancha = s.bloques.some((b) => (b.vista?.columnas.length ?? 0) > 7);
  return (
    <section className={`min-w-0 overflow-hidden rounded-lg border border-border bg-bg-elevated ${ancha ? 'xl:col-span-2' : ''}`}>
      <h3 className={`flex items-center justify-between gap-2 px-3 py-1.5 font-display text-sm font-semibold ${libro?.cls ?? ''}`}>
        <span>
          {s.titulo}
          {s.conteo !== undefined && <span className="ml-1.5 font-normal opacity-80">({s.conteo})</span>}
        </span>
        {libro && <span className="text-[11px] font-normal opacity-80">{libro.nombre}</span>}
      </h3>
      <div className="space-y-3 p-3">
        {s.bloques.map((b, i) => (
          <div key={i} className="space-y-1">
            {b.subtitulo && <h4 className="text-xs font-medium text-text-muted">{b.subtitulo}</h4>}
            {b.vista && <VistaTablaView vista={b.vista} />}
            {b.mensaje && <p className="text-sm italic text-text-muted">{b.mensaje}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

interface Props {
  /** Código de material a detallar; `null` mantiene el modal cerrado. */
  material: string | null;
  onClose: () => void;
}

/** Ventana emergente con todo lo que se sabe de un material en los 3 libros
 * (Disponibilidad con Libre real, Seg pedidos, hojas de Inv_Condicion y Sustituto), una tarjeta por libro en rejilla. */
export function DetalleMaterialDialog({ material, onClose }: Props) {
  const hojas = usePedidosStore((s) => s.hojas);
  const secciones = useMemo(
    () => (material ? construirDetalleMaterial(Object.values(hojas), material) : []),
    [material, hojas],
  );

  return (
    <Dialog open={material !== null} onOpenChange={(abierto) => { if (!abierto) onClose(); }}>
      <DialogContent className="max-h-[92vh] max-w-[min(90rem,95vw)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Material {material}</DialogTitle>
          <DialogDescription>Detalle relacional: disponibilidad, pedidos e inventario por condición.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-2">
          {secciones.map((s) => <SeccionCard key={s.titulo} s={s} />)}
        </div>
      </DialogContent>
    </Dialog>
  );
}
