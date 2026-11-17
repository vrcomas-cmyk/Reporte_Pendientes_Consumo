import { useMemo } from 'react';
import type { Analytics } from '@/modules/analytics/AnalyticsContext';
import { useFacturacionStore } from '@/store/facturacionStore';
import { norm } from '@/lib/text';
import {
  filtrarPresupuestoDet, filtrarVentasColab, indexarVentasPorVdor, mesesDeColaborador,
  type FiltroActivo, type FilaMesColab, type ResolverDetalle, type VentaColab,
} from '@/core/ventasPto';

/** Etiquetas de los filtros de la página que el detalle de un colaborador no puede aplicar (no existen en el presupuesto ni a nivel de fila de venta). */
const ETIQUETA_IGNORADO: Record<string, string> = {
  cliente: 'Cliente', solicitante: 'Solicitante', destinatario: 'Destinatario', material: 'Material', centro: 'Centro', abc: 'Clase ABC', estado: 'Estado',
  tendencia: 'Tendencia', consumo: 'Consumo', ultima: 'Última', penultima: 'Penúltima', impultima: 'Importe última',
};

/** Una sola pasada por las filas de Resumen_Fac por carga: después cada colaborador se consulta en el índice (el panel y la sección comparten el mismo). */
const cacheIndice = new WeakMap<object, Map<string, VentaColab[]>>();
export function indiceVentasPorVdor(rows: Parameters<typeof indexarVentasPorVdor>[0]): Map<string, VentaColab[]> {
  let idx = cacheIndice.get(rows as object);
  if (!idx) { idx = indexarVentasPorVdor(rows); cacheIndice.set(rows as object, idx); }
  return idx;
}

export interface ArgsDetalleColaborador {
  gpoVdor: string;
  /** Ventana de meses (escala `mesKey`) y selección concreta de meses: los mismos de la gráfica. */
  lo: number;
  hi: number;
  meses: ReadonlySet<number> | null;
  /** Filtros activos de la página (solo se aplican Grupo cliente, Sector, Grupo de artículo y los de ejecutivo del presupuesto). */
  filtros: readonly FiltroActivo[];
}

export interface DetalleColaboradorPto {
  codigo: string;
  nombre: string;
  region: string;
  gerencia: string;
  meses: FilaMesColab[];
  ventas: VentaColab[];
  pto: ReturnType<typeof filtrarPresupuestoDet>['filas'];
  resolver: ResolverDetalle;
  ignorados: string[];
}

/** Presupuesto y venta de un colaborador (gpo. vendedor) mes a mes. Lo usan la sección «Cumplimiento por» y el panel lateral, para que den los mismos números. */
export function useDetalleColaboradorPto(a: Pick<Analytics, 'rf' | 'enrich'>, { gpoVdor, lo, hi, meses, filtros }: ArgsDetalleColaborador): DetalleColaboradorPto {
  const presupuestoDet = useFacturacionStore((s) => s.presupuestoDet);
  const { rf, enrich } = a;
  const resolver = useMemo<ResolverDetalle>(() => ({
    ejecutivo: (c) => enrich.ejecutivoNombre(c),
    grupoCli: (c) => enrich.grupoCliente(c) || c,
    ventas: (c) => enrich.ejecutivoAtributos(c),
    sector: (m) => enrich.matSector(m),
    grupo: (m) => enrich.matGrupo(m),
  }), [enrich]);

  return useMemo(() => {
    const codigo = norm(gpoVdor);
    const ventasTodas = rf ? indiceVentasPorVdor(rf.rows).get(codigo) ?? [] : [];
    const ventas = filtrarVentasColab(ventasTodas, filtros, resolver);
    const propias = presupuestoDet.filter((f) => norm(f[4]) === codigo);
    const { filas: pto, ignorados } = filtrarPresupuestoDet(propias, filtros, resolver, { etiqueta: (c) => ETIQUETA_IGNORADO[c] ?? c });
    return {
      codigo,
      nombre: enrich.ejecutivoNombre(codigo) || '',
      region: propias[0]?.[1] ?? '',
      gerencia: propias[0]?.[2] ?? '',
      meses: mesesDeColaborador(ventas, pto, lo, hi, meses),
      ventas, pto, resolver, ignorados,
    };
  }, [rf, enrich, presupuestoDet, gpoVdor, lo, hi, meses, filtros, resolver]);
}
