import { useMemo } from 'react';
import { EvolChart, ComparativaDual, TrendBadge } from '../ui';
import { Section } from './_shared';
import { ControlesAB, TablaAB, usePeriodosAB } from './ComparaPeriodos';
import { serieFacMensualCam } from '@/core/facMensual';
import { serieMaterial, serieMatCentro, rfTieneCentro, tendenciaTexto } from '@/core/resumenFac';
import { consFor, norm } from '../helpers';
import type { Panel } from '@/store/panelStore';
import type { Analytics } from '../AnalyticsContext';

/** Fichas de facturación del detalle de un material EN UN CENTRO (Inv. Disponibilidad), con lo mismo que el detalle por material:
 * tendencia con su insignia, comparativos "Mes vs mismo mes del año anterior" / "Q vs mismo Q" / "periodo vs periodo",
 * y los clientes del material en ese centro con periodo A vs B (plegada hasta que se active). */
export function TendenciaCentro({ a, material, centro, almacen, centroTxt, almTxt, push, onVerCentro }: {
  a: Analytics; material: string; centro: string; almacen?: string; centroTxt: string; almTxt?: string;
  push: (p: Panel) => void; onVerCentro: () => void;
}) {
  const { rf } = a;
  // Se calcula UNA vez por material/centro (antes se recalculaba en cada render; filtra todas las filas de Resumen_Fac).
  const serieCentro = useMemo(() => serieMatCentro(rf, material, centro), [rf, material, centro]);
  const usaCentro = serieCentro.length > 0;
  const serieGeneral = useMemo(() => (usaCentro ? [] : serieMaterial(rf, material)), [rf, material, usaCentro]);
  const serie = usaCentro ? serieCentro : serieGeneral;
  const serieAlm = useMemo(() => (almacen ? serieFacMensualCam(a.facMensualCam, { material, centro, almacen }) : []), [a.facMensualCam, material, centro, almacen]);
  const ab = usePeriodosAB();

  // Clientes que le facturan este material en este centro (clave del índice: centro||destinatario||material).
  const clientes = useMemo(() => {
    if (!rf) return [];
    const pre = norm(centro) + '||';
    const suf = '||' + norm(material);
    const razon = new Map(consFor(a.result?.consumo ?? [], material, centro).map((r) => [norm(r.destinatario), r.razonSocial]));
    const out: { dest: string; razon: string; serie: typeof serie }[] = [];
    for (const [k, s] of rf.centroMatDest) {
      if (!k.startsWith(pre) || !k.endsWith(suf)) continue;
      const dest = k.slice(pre.length, k.length - suf.length);
      out.push({ dest, razon: razon.get(dest) || '', serie: s });
    }
    return out;
  }, [rf, a.result, material, centro]);

  const titulo = usaCentro
    ? `Tendencia del material · Centro ${centroTxt}`
    : rfTieneCentro(rf)
      ? 'Tendencia del material (general — sin historia en este centro)'
      : rf
        ? 'Tendencia del material (general — el Resumen_Fac cargado no trae la columna Centro: sincroniza Facturación desde Carga)'
        : 'Tendencia del material (sin facturación cargada: sincroniza Facturación desde Carga)';

  return (
    <>
      {almacen && (
        <Section ancho collapsible defaultOpen={false} storageKey="celda.tendencia.alm" tono="fac" origen="Fac_Mensual_CAM" title={`Tendencia del material · Centro ${centroTxt} / Alm ${almTxt ?? almacen}`}>
          {serieAlm.length ? (
            <>
              <EvolChart serie={serieAlm} height={180} />
              <div className="mt-3"><ComparativaDual serie={serieAlm} /></div>
            </>
          ) : <p className="text-sm text-text-muted">Sin facturación de este almacén en Fac_Mensual_CAM (sincroniza los reportes desde Carga si falta la hoja).</p>}
          <button type="button" className="mt-1 text-xs text-accent hover:underline" onClick={onVerCentro}>Ver el centro completo →</button>
        </Section>
      )}
      <Section ancho collapsible defaultOpen={false} storageKey="celda.tendencia" tono="fac" origen="Resumen_Fac" title={titulo}>
        {serie.length > 0 && <div className="mb-2"><TrendBadge t={tendenciaTexto(serie)} /></div>}
        <EvolChart serie={serie} height={180} onMonth={(mes) => push({ type: 'clientesMes', material, mes, ...(usaCentro ? { centro } : {}) })} />
        {rf && serie.length > 0 && <div className="mt-3"><ComparativaDual serie={serie} /></div>}
      </Section>
      {clientes.length > 0 && (
        <Section ancho collapsible defaultOpen={false} storageKey="celda.clientes.ab" tono="fac" origen="Resumen_Fac" title={`Clientes del material en el centro ${centroTxt} · ${clientes.length} · periodo A vs B · doble clic para ver al cliente`}>
          <ControlesAB ab={ab} />
          <TablaAB ab={ab} colTitulo="Cliente" maxH="max-h-96"
            filas={clientes.map((c) => ({ key: c.dest, titulo: c.razon || c.dest, sub: `Dest ${c.dest}`, serie: c.serie, onOpen: () => push({ type: 'clienteDetalle', dest: c.dest, material }) }))} />
        </Section>
      )}
    </>
  );
}
