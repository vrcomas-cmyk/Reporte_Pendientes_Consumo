import { useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { formatNumber } from '@/lib/utils';
import type { RelSustituto } from '@/core/invCondicionLibros';

interface Props {
  info: RelSustituto[];
  /** ¿El material está en la lista visible (respeta filtros)? */
  visible: (material: string) => boolean;
  /** ¿El material existe en la tabla (sin filtros)? */
  existe: (material: string) => boolean;
  onIr: (material: string) => void;
  onQuitarFiltrosEIr: (material: string) => void;
  onDetalle: (material: string) => void;
}

/** Ícono discreto ⇄ junto al código: indica que tiene sustituto(s) y/o es sustituto de otro. Con varios lleva el número;
 * al dar clic abre un menú con cada uno, su inventario y la acción de ir a su fila. */
export function SustitutosBadge({ info, visible, existe, onIr: irA, onQuitarFiltrosEIr: quitarEIr, onDetalle: detalleDe }: Props) {
  const [abierto, setAbierto] = useState(false);
  // Cada acción cierra el menú (la fila de origen puede salir de pantalla al saltar).
  const onIr = (m: string) => { setAbierto(false); irA(m); };
  const onQuitarFiltrosEIr = (m: string) => { setAbierto(false); quitarEIr(m); };
  const onDetalle = (m: string) => { setAbierto(false); detalleDe(m); };
  const n = info.length;
  if (!n) return null;
  const titulo = n > 1 ? `Tiene ${n} sustitutos` : 'Tiene sustituto';
  const renglon = (r: RelSustituto, conInv: boolean) => (
    <div key={r.material} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-bg-subtle">
      <div className="min-w-0 flex-1">
        <button type="button" className="font-medium text-accent hover:underline" onClick={() => onDetalle(r.material)}>{r.material}</button>
        <div className="truncate text-[11px] text-text-faint">{r.texto}</div>
      </div>
      {conInv && <span className="text-xs tabular-nums" title="Inventario general (1030+1031+1060) en todos los centros">{formatNumber(r.invTotal)}</span>}
      {existe(r.material) ? (
        visible(r.material)
          ? <button type="button" className="text-xs text-accent hover:underline" onClick={() => onIr(r.material)}>Ir a fila</button>
          : <button type="button" className="text-xs text-warning hover:underline" title="Está oculto por los filtros activos" onClick={() => onQuitarFiltrosEIr(r.material)}>Quitar filtros e ir</button>
      ) : <span className="text-[11px] text-text-faint" title="No aparece en Disponibilidad">sin fila</span>}
    </div>
  );
  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={titulo}
          aria-label={titulo}
          className={`ml-1 inline-flex items-center gap-0.5 rounded px-1 align-middle text-[11px] text-accent hover:bg-bg-subtle`}
        >
          <ArrowLeftRight className="size-3" />{n > 1 ? n : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <p className="px-2 pt-1 text-[11px] font-medium uppercase text-text-faint">Sustitutos</p>
        {info.map((r) => renglon(r, true))}
      </PopoverContent>
    </Popover>
  );
}
