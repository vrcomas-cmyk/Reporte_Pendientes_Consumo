import { useCallback, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Select } from '@/components/ui/select';
import { ExportButton, SegmentedControl } from '@/components/layout/report';
import { exportXlsxMultiSheet, stamp } from '@/lib/exportXlsx';
import { hojasExcel } from '@/core/comodatoExport';
import { usePersistedState } from '@/hooks/usePersistedState';
import {
  F, FILTROS_VACIOS, aplicarFiltros, aplicarPeriodo, fmtZona, tipoEq, lblMes, mesesSerie, normalizarSeguimiento, normalizarSerie, valoresUnicos,
  type Filtros, type MetricaSerie,
} from '@/core/comodatoTablero';
import type { ResultadoComodatoLibros } from '@/services/comodatoLibrosService';
import { TableroContext, type Detalle, type TableroCtx } from './contexto';
import { DetalleDialog } from './dialogos';
import { GuiaTerminos } from './guia';
import { DESC_RECUP, DESC_RENT, DESC_STATUS, DESC_TEND } from './piezas';
import { VistaComercial, VistaDireccion, VistaGerencial } from './vistas';

type Vista = 'dir' | 'ger' | 'com';

/** Qué hace cada filtro (al pasar el cursor) y qué significa cada opción de los que tienen valores con significado propio. */
const AYUDA_FILTRO: Partial<Record<keyof Filtros, string>> = {
  pDesde: 'Primer mes del periodo: recalcula facturación, margen y bolsas solo con los meses elegidos.',
  pHasta: 'Último mes del periodo (vacío = hasta el mes más reciente).',
  status: 'Estado del equipo según los días desde la última compra de sus bolsas.',
  tend: 'Comportamiento de la facturación: últimos 90 días contra los 90 previos.',
  rent: 'Si el margen acumulado ya cubre la inversión en el equipo.',
  tipo: 'Canister (consume bolsas), Carrito o Complemento (placa, tubos): habilitadores que no facturan.',
  ejec: 'Ejecutivo responsable de la zona del cliente.',
  zona: 'Zona comercial (grupo de vendedores).',
  grupo: 'Grupo de cliente (Hospitales, Gobierno, etc.).',
  equipo: 'Equipo entregado en comodato.',
  recup: 'Qué tan conveniente es recuperar el equipo.',
};
const DESC_OPCION: Partial<Record<keyof Filtros, Record<string, string>>> = {
  status: DESC_STATUS, tend: DESC_TEND, rent: DESC_RENT, recup: DESC_RECUP,
  tipo: { Canister: 'Equipo que consume bolsas.', Carrito: 'Carrito de apoyo: no factura por sí mismo.', Complemento: 'Placa o tubos de vacío: no factura por sí mismos.' },
};

const hayFiltrosTexto = (f: Filtros): boolean => Object.values(f).some((v) => v !== '' && v != null);

const ETIQUETA_FILTRO: Partial<Record<keyof Filtros, string>> = {
  cliente: 'Cliente', status: 'Estado del equipo', tend: 'Tendencia', rent: 'Rentabilidad', equipo: 'Equipo', recup: 'Recuperable', tipo: 'Tipo de equipo', ejec: 'Ejecutivo', zona: 'Zona', grupo: 'Grupo de cliente', q: 'Buscar',
};

/** Tablero de Comodato (port del proyecto Comodato_vs_Fac_Medivac): pestañas Dirección / Gerencial / Comercial con filtros compartidos,
 * alimentado por las tres vistas que devuelve el SQL (seguimiento 360, serie mensual y ranking por bolsa). */
export function TableroComodato({ resultado }: { resultado: ResultadoComodatoLibros }) {
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VACIOS);
  const [vista, setVista] = usePersistedState<Vista>('comodatoLibros.vista', 'dir');
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [trend, setTrendState] = useState<{ cli: string; metric: MetricaSerie }>({ cli: '', metric: 'importe' });
  const [orden, setOrden] = useState<{ sort: string; dir: 1 | -1 }>({ sort: F.razon, dir: 1 });

  const dataAll = useMemo(() => normalizarSeguimiento(resultado.seguimiento360), [resultado.seguimiento360]);
  const serie = useMemo(() => normalizarSerie(resultado.direccionTendencia), [resultado.direccionTendencia]);
  const bolsas = resultado.bolsasResumen;
  const { codToRazon, razonToCod } = useMemo(() => {
    const c = new Map<string, string>();
    const r = new Map<string, string>();
    for (const d of dataAll) {
      const cod = String(d[F.cliente] ?? '');
      const razon = String(d[F.razon] ?? '');
      if (cod && razon) { c.set(cod, razon); r.set(razon, cod); }
    }
    return { codToRazon: c, razonToCod: r };
  }, [dataAll]);

  const data = useMemo(() => aplicarPeriodo(dataAll, serie, filtros.pDesde, filtros.pHasta), [dataAll, serie, filtros.pDesde, filtros.pHasta]);
  const rows = useMemo(() => aplicarFiltros(data, filtros), [data, filtros]);
  const meses = useMemo(() => mesesSerie(serie), [serie]);

  const setTrend = useCallback((t: Partial<{ cli: string; metric: MetricaSerie }>) => setTrendState((p) => ({ ...p, ...t })), []);
  const alternar = useCallback((k: keyof Filtros, v: string) => setFiltros((f) => ({ ...f, [k]: f[k] === v ? '' : v })), []);
  const aplicar = useCallback((cambios: Partial<Filtros>, v?: Vista) => {
    setFiltros((f) => ({ ...f, ...cambios }));
    if (v) setVista(v);
    if (cambios.cliente) setTrendState((p) => ({ ...p, cli: razonToCod.get(cambios.cliente!) ?? p.cli }));
  }, [razonToCod, setVista]);

  const ctx: TableroCtx = { dataAll, data, rows, serie, bolsas, filtros, alternar, aplicar, abrir: setDetalle, codToRazon, razonToCod, trend, setTrend, orden, setOrden };

  const exportar = () => {
    void exportXlsxMultiSheet(`comodato-libros-${stamp()}.xlsx`, hojasExcel({
      seguimiento: rows,
      serie: resultado.direccionTendencia.filter((p) => rows.some((d) => String(d[F.cliente] ?? '') === String(p.cliente ?? ''))),
      bolsas,
      razonDe: (c) => codToRazon.get(c) ?? '',
    }));
  };

  // Las opciones de cada filtro salen de lo que dejan los DEMÁS filtros: así nunca se elige un valor que daría cero resultados.
  const sin = (k: keyof Filtros) => aplicarFiltros(data, { ...filtros, [k]: '' });
  const sel = (k: keyof Filtros, etiqueta: string, opciones: string[], lbl?: (v: string) => string) => (
    <Select key={k} value={String(filtros[k])} onChange={(ev) => setFiltros((f) => ({ ...f, [k]: ev.target.value }))} className="w-auto max-w-56" aria-label={etiqueta} title={AYUDA_FILTRO[k] ?? etiqueta}>
      <option value="">{etiqueta}</option>
      {opciones.map((o) => <option key={o} value={o} title={DESC_OPCION[k]?.[o]}>{lbl ? lbl(o) : o}</option>)}
    </Select>
  );
  const activos = (Object.keys(ETIQUETA_FILTRO) as (keyof Filtros)[]).filter((k) => filtros[k]);
  const hayFiltros = activos.length > 0 || !!filtros.comod || !!filtros.pDesde || !!filtros.pHasta;
  const chip = (clave: string, etiqueta: string, valor: string, quitar: () => void) => (
    <button key={clave} type="button" onClick={quitar} className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent-soft px-2.5 py-1 text-xs text-accent">
      {etiqueta}: <b>{valor}</b><X className="size-3" />
    </button>
  );

  return (
    <TableroContext.Provider value={ctx}>
      <div className="flex flex-col gap-4">
        <div className="sticky top-0 z-20 -mx-2 flex flex-col gap-2 bg-bg/95 px-2 py-2 backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SegmentedControl<Vista>
            ariaLabel="Vista del tablero"
            value={vista}
            onChange={setVista}
            options={[{ value: 'dir', label: '📊 Dirección' }, { value: 'ger', label: '🛠️ Gerencial' }, { value: 'com', label: '🧭 Comercial' }]}
          />
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-text-faint">{rows.length.toLocaleString('es-MX')} registros{hayFiltrosTexto(filtros) ? ' (filtrados)' : ''}</span>
            <ExportButton onClick={exportar} label="Exportar (lo filtrado)" />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-bg-elevated p-3 shadow-sm">
          <input
            value={filtros.q}
            onChange={(ev) => setFiltros((f) => ({ ...f, q: ev.target.value }))}
            placeholder="🔍 Buscar cliente…"
            className="h-9 w-48 rounded-md border border-border bg-bg-elevated px-2 text-sm"
            aria-label="Buscar cliente"
          />
          {sel('pDesde', 'Periodo desde', meses, lblMes)}
          {sel('pHasta', 'A la fecha', meses, lblMes)}
          {sel('status', 'Estado del equipo', valoresUnicos(sin('status'), F.status))}
          {sel('tend', 'Tendencia', valoresUnicos(sin('tend'), F.tend))}
          {sel('rent', 'Rentabilidad', valoresUnicos(sin('rent'), F.rentable))}
          {sel('tipo', 'Tipo de equipo', ['Canister', 'Carrito', 'Complemento'].filter((o) => sin('tipo').some((d) => tipoEq(d) === o)))}
          <Select value={filtros.comod} onChange={(ev) => setFiltros((f) => ({ ...f, comod: ev.target.value as Filtros['comod'] }))} className="w-auto" aria-label="Con o sin comodato">
            <option value="">Con/Sin comodato</option>
            <option value="con">Con comodato</option>
            <option value="sin">Sin comodato</option>
          </Select>
          {sel('ejec', 'Ejecutivo', valoresUnicos(sin('ejec'), F.ejec))}
          {sel('zona', 'Zona', [...new Set(sin('zona').map((d) => fmtZona(d[F.zona])).filter(Boolean))].sort())}
          {sel('grupo', 'Grupo cliente', valoresUnicos(sin('grupo'), F.grupo))}
          {sel('equipo', 'Equipo / Canister', valoresUnicos(sin('equipo'), F.desc))}
          {sel('recup', 'Recuperable', valoresUnicos(sin('recup'), F.recup))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {hayFiltros ? (
            <>
              {activos.map((k) => chip(k, ETIQUETA_FILTRO[k]!, String(filtros[k]), () => setFiltros((f) => ({ ...f, [k]: '' }))))}
              {filtros.comod && chip('comod', 'Comodato', filtros.comod === 'con' ? 'Con' : 'Sin', () => setFiltros((f) => ({ ...f, comod: '' })))}
              {(filtros.pDesde || filtros.pHasta) && chip('periodo', 'Periodo', `${filtros.pDesde ? lblMes(filtros.pDesde) : 'inicio'} → ${filtros.pHasta ? lblMes(filtros.pHasta) : 'a la fecha'}`, () => setFiltros((f) => ({ ...f, pDesde: '', pHasta: '' })))}
              <button type="button" onClick={() => setFiltros(FILTROS_VACIOS)} className="text-xs text-accent hover:underline">Limpiar todo</button>
            </>
          ) : (
            <span className="text-[11px] text-text-faint">Sin filtros · clic en cualquier fila para ver la ficha del cliente</span>
          )}
        </div>
        </div>

        <GuiaTerminos />

        {vista === 'dir' && <VistaDireccion />}
        {vista === 'ger' && <VistaGerencial />}
        {vista === 'com' && <VistaComercial />}
      </div>
      <DetalleDialog detalle={detalle} onClose={() => setDetalle(null)} />
    </TableroContext.Provider>
  );
}
