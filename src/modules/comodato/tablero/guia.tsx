import { useState } from 'react';
import { BookOpen, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DESC_RECUP, DESC_RENT, DESC_STATUS, DESC_TEND } from './piezas';

const Bloque = ({ titulo, items }: { titulo: string; items: readonly (readonly [string, string])[] }) => (
  <div>
    <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-faint">{titulo}</h4>
    <dl className="grid gap-x-3 gap-y-1 text-xs sm:grid-cols-[max-content_1fr]">
      {items.map(([k, v]) => <div key={k} className="contents"><dt className="font-medium text-text">{k}</dt><dd className="text-text-muted">{v}</dd></div>)}
    </dl>
  </div>
);

/** Glosario del tablero y dónde contrastar cada cifra (colapsable). */
export function GuiaTerminos() {
  const [abierta, setAbierta] = useState(false);
  return (
    <section className="rounded-xl border border-border bg-bg-elevated">
      <button type="button" onClick={() => setAbierta((a) => !a)} aria-expanded={abierta} className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold transition-colors hover:bg-bg-inset">
        <BookOpen className="size-4 text-text-muted" /> Guía de términos y cómo verificar
        <ChevronDown className={cn('ml-auto size-4 text-text-muted transition-transform duration-150', abierta && 'rotate-180')} />
      </button>
      {abierta && (
        <div className="grid gap-5 border-t border-border p-4 lg:grid-cols-2">
          <Bloque titulo="Estado (por equipo)" items={Object.entries(DESC_STATUS)} />
          <Bloque titulo="Tendencia" items={Object.entries(DESC_TEND)} />
          <Bloque titulo="Rentabilidad" items={Object.entries(DESC_RENT)} />
          <Bloque titulo="Recuperable" items={Object.entries(DESC_RECUP)} />
          <Bloque
            titulo="Otros términos"
            items={[
              ['Solicitante', 'Código SAP del cliente que hace el pedido.'],
              ['Pedidos-mes', 'Los libros no traen número de factura: se cuenta una “factura” por solicitante + material + mes.'],
              ['Frecuencia (meses)', 'Meses promedio entre un mes con venta y el siguiente. Con un solo mes con venta no hay intervalo (se muestra “Un solo mes con venta”).'],
              ['Complementario', 'Carro, placa o tubos de vacío: habilitan el uso del canister, no facturan por sí mismos.'],
              ['Sin comodato', 'Solicitante que compra bolsas pero no aparece con equipo en el libro de comodato.'],
              ['ROI', 'Margen total ÷ inversión en comodato (x veces).'],
            ]}
          />
          <Bloque
            titulo="De dónde sale cada dato"
            items={[
              ['Comodato (piezas, fechas)', 'Libro de Google Sheets YBFD/ZBRE: entregas (YBFD) menos devoluciones (ZBRE).'],
              ['Facturación, importes, bolsas', 'Libros de Facturación de Drive, agregados por mes (fecha = última línea del mes).'],
              ['Costos / inversión', 'Catálogo de materiales (costo × piezas en comodato).'],
              ['Zona, ejecutivo, grupo', 'Catálogo de ejecutivos por zona.'],
            ]}
          />
          <div className="rounded-lg border border-border bg-bg-inset p-3 text-xs text-text-muted lg:col-span-2">
            <b className="text-text">Cómo verificar una cifra:</b> exporta a Excel (botón “Exportar” arriba: respeta los filtros) y compara contra el libro de comodato y los libros de facturación;
            la lógica exacta de cada columna está en <code>src/core/sql/SQL_Comodato_Libros.sql</code>. Un cliente puede mostrar varios estados a la vez porque el estado es por equipo.
          </div>
        </div>
      )}
    </section>
  );
}
