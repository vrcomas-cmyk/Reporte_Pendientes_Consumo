import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useDataStore } from '@/store/dataStore';
import { buildRFAsync, mesesDisponibles, type RFIndex } from '@/core/resumenFac';
import { buildBO, buildBOPorFila, type BOItem } from '@/core/buildBO';
import { buildRSS, type RSSIndex } from '@/core/resumenSin';
import { buildFacMensual, type FacMensualIndex } from '@/core/facMensual';
import { buildEnrich, type EnrichIndex, type PrecioAutorizado } from '@/core/enrich';
import { usePreciosStore, autorizadosPorMaterial } from '@/store/preciosStore';
import { usePendienteBloqueoStore } from '@/store/pendienteBloqueoStore';
import { applyCatalogPriceFallback } from '@/core/analysis';
import { inventarioDesdeDisponibilidad, sugerenciasDesdeSegPedidos } from '@/core/pedidos';
import { filasResumenDisponibilidad } from '@/core/resumenDisponibilidad';
import { filasInvCondicion, indiceRevision, lotesDeCondicion, type DetalleLotesCondicion, type EstadosRevision, type Sustitucion, type InvAlmacenCentro } from '@/core/invCondicionLibros';
import { hojasDeLibro, usePedidosStore } from '@/store/pedidosStore';
import { buildAbc, buildAbcPares, type AbcClass, type AbcResult } from '@/core/abc';
import { estadosConsumoAsync, type IndiceEstados } from '@/core/consumoEstados';
import { consumoDesdeResumenFacAsync } from '@/core/consumoDesdeRF';
import { useFacturacionStore } from '@/store/facturacionStore';
import { SOLO_LIBROS } from '@/lib/modoLibros';
import { persistirDerivadosFacturacion } from '@/services/facturacionLibrosService';
import { useFacFuenteStore } from '@/store/facFuenteStore';
import { buildPrecioDispersion, type PrecioDispersionEntry } from '@/core/precios';
import type { AnalysisResult, ConsumoRow, FacMensualCamRow, InvConsolidadoRow, InvDetalleRow, IncrementoCostoRow, ResumenFacRow } from '@/core/types';

export interface Analytics {
  result: AnalysisResult | null;
  rf: RFIndex | null;
  bo: BOItem[];
  /** Pedidos de "Seg. de pedidos" (libro Seg pedidos) como BO SIN fuentes — misma forma que `bo`,
   * para que la tabla de Pedidos funcione igual sobre ellos. Vacío si no se ha sincronizado. */
  boSeg: BOItem[];
  /** `bo` + los de `boSeg` que no estén ya en `bo`: lo que necesitan los paneles de detalle de
   * pedido para encontrar un pedido venga de donde venga. El resto de la app sigue usando `bo`. */
  boPedidos: BOItem[];
  boByKey: Map<string, BOItem>;
  rss: RSSIndex | null;
  /** Mismo pivot Material x Centro que `rss`, armado con los libros de Disponibilidad (inventario), Seg pedidos
   * (pendiente) y Fac_Mensual_CAM (consumo). `null` si Disponibilidad no se ha sincronizado. */
  rssDisp: RSSIndex | null;
  /** "Inv con Condición": una fila por material × condición (Corta caducidad, Revision con sus Status, Sustituto, PNC)
   * armada con los libros Inv_Condicion y Disponibilidad (`core/invCondicionLibros.ts`). Vacío sin sincronizar. */
  invCondicionLibros: InvConsolidadoRow[];
  /** Material → condición de la pestaña Revision ("Liz/Lento mov"); NO incluye Corta caducidad ni PNC. Vacío sin sincronizar. */
  revisionLibros: Map<string, string>;
  /** Lotes clasificados como corta caducidad (hoja "Corta caducidad" del libro Inv_Condicion). */
  lotesLibros: InvDetalleRow[];
  /** Lotes de las condiciones que no son Corta caducidad (hoy PNC), con las columnas de su hoja, por nombre de condición. */
  detalleLotesLibros: Record<string, DetalleLotesCondicion>;
  /** Relación material → sustituto (hoja Sustituto) para ofrecer en cambio; vacía sin sincronizar. */
  sustitucionesLibros: Sustitucion[];
  /** Módulo Facturación: consumo, facturación (`rf`), ABC y meses armados SOLO con los libros trimestrales de Drive.
   * Se calcula solo mientras el módulo está abierto (`facFuenteStore`); vacío si no se ha sincronizado. */
  facturacion: {
    rf: RFIndex | null;
    consumo: ConsumoRow[];
    abc: AbcResult;
    meses: string[];
    resumenFac: ResumenFacRow[];
    /** Estado/tendencia/meses de cada fila de `consumo` (precalculado por tramos; lo más pesado de la tabla). */
    estados: IndiceEstados | null;
    /** ABC de cada combinación cliente-material. */
    abcPares: Map<string, AbcClass>;
  };
  /** True mientras se arman (por tramos, sin trabar la pantalla) los índices de Facturación; `facturacionProgreso` va de 0 a 1. */
  facturacionCalculando: boolean;
  facturacionProgreso: number;
  /** Mensaje si falló el armado de los índices de Facturación (en vez de quedarse en "Calculando…" para siempre); null si no hubo error. */
  facturacionError: string | null;
  /** Libre real por centro/almacén de los materiales en Revision (para el desglose del detalle de material). */
  invRevisionLibros: Record<string, InvAlmacenCentro[]>;
  /** Status de la pestaña Revision (cada uno es una condición) por material, con su libre general 1030+1031+1060. */
  estadosRevisionLibros: ReadonlyMap<string, EstadosRevision>;
  /** Facturación mensual por Centro/Almacén/Material (pestaña "Fac_Mensual_CAM")
   * — base del promedio por periodo en el detalle de Inventario. `null` si no
   * se ha sincronizado. */
  facMensual: FacMensualIndex | null;
  /** Fac_Mensual_CAM: la armada con los libros de Drive; mientras no se sincronicen, la pestaña del reporte. */
  facMensualCam: FacMensualCamRow[];
  enrich: EnrichIndex;
  /** Inventory-by-condition rows for the current view: the daily "Inventario por
   * condición" sheet when present (else the catalog's InvConsolidado), with each
   * row's `precioOferta` back-filled per (material, condición) from the catalog. */
  invCondicion: InvConsolidadoRow[];
  /** Raw catalog InvConsolidado rows (real per-condición precioOferta, no
   * fallback merge) — used to prefer catalog prices over invCondicion's. */
  invConsolidadoCatalog: InvConsolidadoRow[];
  /** Precios de oferta AUTORIZADOS en el módulo Precios, por material; sustituyen al `precioOferta` de la hoja (ver `preciosPorCondicion`). */
  preciosAutorizados: ReadonlyMap<string, readonly PrecioAutorizado[]>;
  lotes: InvDetalleRow[];
  curmes: string;
  /** Clasificación ABC/Pareto de materiales y clientes por importe facturado
   * en los últimos 12 meses (ver `core/abc.ts`). Vacía sin Resumen_Fac. */
  abc: AbcResult;
  /** Dispersión de precio unitario vigente entre clientes distintos, por
   * material (ver `core/precios.ts`). Vacía sin Reporte de Consumo. */
  precioDispersion: PrecioDispersionEntry[];
  /** Filas crudas del Sheet "Incremento de costos" (módulo `/incremento`).
   * El cálculo de impacto (`buildIncrementoImpacto`) NO vive aquí porque
   * depende del periodo/filtros elegidos por el usuario en esa página —
   * mismo patrón que `analisisVentas` en AnalisisPage. */
  incrementoRows: IncrementoCostoRow[];
  /** Meses distintos presentes en `rf.rows`, ordenados cronológicamente —
   * alimenta el selector de periodo antes de que exista un `PeriodoAnalisis`. */
  mesesDisponibles: string[];
}

const FACTURACION_VACIA: Analytics['facturacion'] = { rf: null, consumo: [], abc: buildAbc(null), meses: [], resumenFac: [], estados: null, abcPares: new Map() };

const AnalyticsCtx = createContext<Analytics | null>(null);

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const result = useDataStore((s) => s.activeAnalysis);
  const catalog = useDataStore((s) => s.catalog);
  const incremento = useDataStore((s) => s.incremento);

  // Memos separados por insumo: `buildRF` (~488k filas) solo se recalcula si
  // cambia `resumenFac`, no cuando cambia el catálogo/incremento o cualquier
  // otro campo del análisis (`pick()` conserva la referencia de los arreglos
  // que no se refrescaron).
  const resumenFac = result?.resumenFac;
  const sugerencias = result?.sugerencias;
  const resumenSin = result?.resumenSinSugerencias;
  // Fac_Mensual_CAM sale de los libros de Drive; sin sincronizarlos todavía, cae a la pestaña del reporte (transición).
  const facMensualLibros = useFacturacionStore((s) => s.facMensualCam);
  const facMensualCam = useMemo(() => (facMensualLibros?.length ? facMensualLibros : result?.facMensualCam ?? []), [facMensualLibros, result?.facMensualCam]);
  const consumo = result?.consumo;
  const inventarioCondicion = result?.inventarioCondicion;
  const lotesCortaCaducidad = result?.lotesCortaCaducidad;

  const enrich = useMemo(() => buildEnrich(catalog), [catalog]);
  // Índice de Resumen_Fac del reporte: ~500 mil filas; se arma POR TRAMOS (sin trabar la pantalla al abrir la app). Mientras tanto `rf` es null
  // —igual que sin datos— y los módulos que lo usan se actualizan solos cuando termina.
  const [rf, setRf] = useState<RFIndex | null>(null);
  useEffect(() => {
    if (!resumenFac?.length) {
      setRf(null);
      return;
    }
    let cancelado = false;
    void buildRFAsync(resumenFac, { cancelado: () => cancelado }).then((r) => {
      if (!cancelado && r) setRf(r);
    });
    return () => { cancelado = true; };
  }, [resumenFac]);
  // Módulo Facturación: solo se arma con el módulo abierto (son cientos de miles de filas) y POR TRAMOS cortos —cediéndole el paso al
  // navegador entre uno y otro— para que la pantalla no se trabe; mientras tanto `facturacionCalculando` es true.
  const facActivo = useFacFuenteStore((s) => s.activo);
  // Otros módulos que necesitan la facturación de los libros sin ser la tabla de Facturación (Tendencia de Inventario · Disponibilidad).
  const facPedida = useFacFuenteStore((s) => s.demanda > 0);
  const resumenFacLibros = useFacturacionStore((s) => s.resumenFac);
  const [facturacion, setFacturacion] = useState<Analytics['facturacion']>(FACTURACION_VACIA);
  const [facProgreso, setFacProgreso] = useState(0);
  const [facError, setFacError] = useState<string | null>(null);
  const hayFilasFac = !!resumenFacLibros?.length;
  // El catálogo (enrich) solo aporta la UM: se lee por ref para que un cambio del catálogo NO cancele ni reinicie el cálculo pesado.
  const matUmRef = useRef(enrich.matUm);
  useEffect(() => { matUmRef.current = enrich.matUm; });
  // Lo ya calculado y de qué filas salió: al salir y volver al módulo (o a otro que pide la facturación) no se recalcula.
  const facturacionRef = useRef(facturacion);
  useEffect(() => { facturacionRef.current = facturacion; });
  useEffect(() => {
    // Sin módulo que la pida NO se borra lo calculado (volver a abrir sería esperar de nuevo ~10 s); se libera solo si ya no hay filas.
    if (!(facActivo || facPedida)) return;
    if (!resumenFacLibros?.length) {
      setFacturacion(FACTURACION_VACIA);
      setFacProgreso(0);
      setFacError(null);
      return;
    }
    const filas = resumenFacLibros;
    if (facturacionRef.current.rf && facturacionRef.current.resumenFac === filas) return;
    let cancelado = false;
    setFacProgreso(0);
    setFacError(null);
    // Cada `setFacProgreso` re-renderiza a todos los consumidores del contexto: solo se informa en saltos de 5 %.
    let ultimo = -1;
    const avance = (base: number, ancho: number) => (f: number) => {
      const v = base + f * ancho;
      if (v - ultimo >= 0.05) { ultimo = v; setFacProgreso(v); }
    };
    // Si la caché local trajo los índices ya calculados de ESTAS filas, solo falta lo que depende de la fecha (estados) y lo barato (ABC).
    const pre = useFacturacionStore.getState().derivados;
    const precalculado = !!pre && pre.filas === filas;
    void (async () => {
      try {
        const rfL = precalculado ? pre.rf : await buildRFAsync(filas, { cancelado: () => cancelado, onProgreso: avance(0, 0.4) });
        if (cancelado || !rfL) return;
        const consumoL = precalculado ? pre.consumo : await consumoDesdeResumenFacAsync(filas, matUmRef.current, { agruparPorCentro: false }, { cancelado: () => cancelado, onProgreso: avance(0.4, 0.4) });
        if (cancelado || !consumoL) return;
        const estadosL = await estadosConsumoAsync(consumoL, rfL, { cancelado: () => cancelado, onProgreso: avance(0.8, 0.2) });
        if (cancelado || !estadosL) return;
        setFacturacion({ rf: rfL, consumo: consumoL, abc: buildAbc(rfL), meses: mesesDisponibles(rfL), resumenFac: filas, estados: estadosL, abcPares: buildAbcPares(rfL, consumoL) });
        setFacProgreso(1);
        // Lo recién calculado se guarda para que la próxima sesión no lo recalcule (en segundo plano; si falla, solo se recalcula).
        if (!precalculado) void persistirDerivadosFacturacion(filas, rfL, consumoL);
      } catch (e) {
        // Antes la excepción se perdía y la pantalla se quedaba en "Calculando…" sin fin.
        if (!cancelado) setFacError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelado = true; };
  }, [facActivo, facPedida, resumenFacLibros]);
  // La UM sale del catálogo y NO forma parte del cálculo: se aplica sobre las filas (misma identidad, que es la llave de `estados`) cuando el
  // catálogo cambia o llegan filas nuevas, sin recalcular nada.
  useEffect(() => {
    let cambio = false;
    for (const r of facturacion.consumo) {
      const um = enrich.matUm(r.material) ?? '';
      if (r.um !== um) { r.um = um; cambio = true; }
    }
    if (cambio) setFacturacion((f) => ({ ...f }));
  }, [enrich, facturacion.consumo]);
  const facturacionCalculando = hayFilasFac && facturacion.rf === null && !facError;
  const bo = useMemo(() => (sugerencias?.length ? buildBO(sugerencias, rf) : []), [sugerencias, rf]);
  const hojasSeg = usePedidosStore((s) => s.hojas);
  const segSugerencias = useMemo(() => {
    const pedidos = hojasDeLibro(hojasSeg, 'pedidos')[0];
    return pedidos ? sugerenciasDesdeSegPedidos(pedidos, inventarioDesdeDisponibilidad(hojasDeLibro(hojasSeg, 'disponibilidad')[0])) : [];
  }, [hojasSeg]);
  // Seg pedidos: un renglón por fila del libro, sin agrupar ni fusionar nada.
  // La facturación de los libros (si ya está calculada) manda sobre el reporte anterior: de ahí salen serie, consumo promedio y tendencia.
  const rfSeg = facturacion.rf ?? rf;
  const boSeg = useMemo(() => (segSugerencias.length ? buildBOPorFila(segSugerencias, rfSeg) : []), [segSugerencias, rfSeg]);
  const boPedidos = useMemo(() => {
    if (!boSeg.length) return bo;
    // Los paneles de pedido buscan por número de pedido: si "Todas las Sugerencias" ya trae ese pedido se usa ese
    // (no se mezclan dos versiones del mismo pedido); si no, se usan las filas de Seg pedidos.
    const pedidos = new Set(bo.map((it) => it.bo.pedido));
    return [...bo, ...boSeg.filter((it) => !pedidos.has(it.bo.pedido))];
  }, [bo, boSeg]);
  const boByKey = useMemo(() => new Map(boPedidos.map((it) => [it.k, it])), [boPedidos]);
  const rss = useMemo(() => (resumenSin?.length ? buildRSS(resumenSin) : null), [resumenSin]);
  const facMensual = useMemo(() => (facMensualCam?.length ? buildFacMensual(facMensualCam) : null), [facMensualCam]);
  const condLibros = useMemo(() => {
    const hojas = Object.values(hojasSeg).filter((h) => h.libro === 'condicion' || h.libro === 'disponibilidad');
    if (!hojas.some((h) => h.libro === 'condicion')) return { filas: [] as InvConsolidadoRow[], lotes: [] as InvDetalleRow[], detalle: {} as Record<string, DetalleLotesCondicion>, sustituciones: [] as Sustitucion[], invRevision: {} as Record<string, InvAlmacenCentro[]>, estadosRevision: new Map<string, EstadosRevision>() };
    const { filas, lotes, detalle, sustituciones, invRevision, estadosRevision } = filasInvCondicion(hojas, {
      sectorDe: (m) => enrich.matSector(m),
      grupoDe: (m) => enrich.matGrupo(m),
      precioDe: (m) => enrich.matPrecioOferta(m),
    });
    return { filas, lotes: lotesDeCondicion(lotes), detalle, sustituciones, invRevision, estadosRevision };
  }, [hojasSeg, enrich]);
  const invCondicionLibros = condLibros.filas;
  const revisionLibros = useMemo(() => indiceRevision(invCondicionLibros), [invCondicionLibros]);
  const lotesLibros = condLibros.lotes;
  const detalleLotesLibros = condLibros.detalle;
  const sustitucionesLibros = condLibros.sustituciones;
  const invRevisionLibros = condLibros.invRevision;
  const estadosRevisionLibros = condLibros.estadosRevision;
  const modoBloqueo = usePendienteBloqueoStore((s) => s.modo);
  const rssDisp = useMemo(() => {
    const dispo = hojasDeLibro(hojasSeg, 'disponibilidad')[0];
    return dispo ? buildRSS(filasResumenDisponibilidad(dispo, hojasDeLibro(hojasSeg, 'pedidos')[0], facMensual, modoBloqueo)) : null;
  }, [hojasSeg, facMensual, modoBloqueo]);
  const abc = useMemo(() => buildAbc(rf), [rf]);
  const precioDispersion = useMemo(() => (consumo?.length ? buildPrecioDispersion(consumo) : []), [consumo]);
  const mesesDisp = useMemo(() => mesesDisponibles(rf), [rf]);
  const invConsolidadoCatalog = useMemo(() => catalog?.invConsolidado ?? [], [catalog]);
  // Inventory pivot prefers the daily report's "Inventario por condicion";
  // lot detail merges catalog InvDetalle with the report's short-expiry lots.
  const invCondicion = useMemo(
    () => applyCatalogPriceFallback(inventarioCondicion?.length ? inventarioCondicion : invConsolidadoCatalog, catalog),
    [inventarioCondicion, invConsolidadoCatalog, catalog],
  );
  const lotes = useMemo(() => [...(catalog?.invDetalle ?? []), ...(lotesCortaCaducidad ?? [])], [catalog, lotesCortaCaducidad]);
  const propuestasPrecios = usePreciosStore((st) => st.propuestas);
  const preciosAutorizados = useMemo(
    () => autorizadosPorMaterial(propuestasPrecios, (m) => enrich.matCosto(m)),
    [propuestasPrecios, enrich],
  );
  const incrementoRows = useMemo(() => incremento?.rows ?? [], [incremento]);

  // ---- PUENTE a los libros ---------------------------------------------------------------------------------------------------------
  // Sin reporte diario (etapa "solo libros") los módulos que leían `rf`, `bo`, `rss`, `invCondicion`, `lotes`, `abc`, el consumo… los reciben de los
  // libros nuevos: Facturación (carpeta de Drive) → rf / abc / meses / consumo; Seg pedidos → bo; Disponibilidad → rss; Inv_Condicion → invCondicion / lotes.
  // Con reporte (modo anterior) todo sigue exactamente como antes.
  const precioDispersionLibros = useMemo(() => (facturacion.consumo.length ? buildPrecioDispersion(facturacion.consumo) : []), [facturacion.consumo]);
  // `result` mínimo con lo que los módulos leen de él (el consumo): así no hay que tocar cada pantalla. Los módulos que necesitan datos "reales"
  // del reporte (sugerencias, etc.) ya miran `bo`/`boSeg`.
  const resultLibros = useMemo(
    () => ({ consumo: facturacion.consumo, resumenFac: facturacion.resumenFac, sugerencias: [], resumenSinSugerencias: [], facMensualCam: [] }) as unknown as AnalysisResult,
    [facturacion.consumo, facturacion.resumenFac],
  );

  const value = useMemo<Analytics>(() => {
    if (!result) {
      const hayLibros = SOLO_LIBROS;
      return {
        result: hayLibros ? resultLibros : null,
        rf: hayLibros ? facturacion.rf : null,
        bo: hayLibros ? boSeg : [],
        boSeg, boPedidos: boSeg, boByKey,
        rss: hayLibros ? rssDisp : null,
        rssDisp, invCondicionLibros, revisionLibros, lotesLibros, detalleLotesLibros, sustitucionesLibros, invRevisionLibros, estadosRevisionLibros, facturacion, facturacionCalculando, facturacionProgreso: facProgreso, facturacionError: facError, facMensual, facMensualCam, enrich,
        invCondicion: hayLibros ? invCondicionLibros : [], invConsolidadoCatalog, preciosAutorizados, lotes: hayLibros ? lotesLibros : [],
        curmes: hayLibros ? facturacion.rf?.curmes ?? '' : '',
        abc: hayLibros ? facturacion.abc : buildAbc(null),
        precioDispersion: hayLibros ? precioDispersionLibros : [],
        incrementoRows, mesesDisponibles: hayLibros ? facturacion.meses : [],
      };
    }
    return {
      result, rf, bo, boSeg, boPedidos, boByKey, rss, rssDisp, invCondicionLibros, revisionLibros, lotesLibros, detalleLotesLibros, sustitucionesLibros, invRevisionLibros, estadosRevisionLibros, facturacion, facturacionCalculando, facturacionProgreso: facProgreso, facturacionError: facError, facMensual, facMensualCam, enrich, invCondicion, invConsolidadoCatalog, preciosAutorizados, lotes, curmes: rf?.curmes ?? '', abc, precioDispersion,
      incrementoRows, mesesDisponibles: mesesDisp,
    };
  }, [result, rf, bo, boSeg, boPedidos, boByKey, rss, rssDisp, invCondicionLibros, revisionLibros, lotesLibros, detalleLotesLibros, sustitucionesLibros, invRevisionLibros, estadosRevisionLibros, facturacion, facturacionCalculando, facProgreso, facError, facMensual, facMensualCam, enrich, invCondicion, invConsolidadoCatalog, preciosAutorizados, lotes, abc, precioDispersion, incrementoRows, mesesDisp, resultLibros, precioDispersionLibros]);

  return <AnalyticsCtx.Provider value={value}>{children}</AnalyticsCtx.Provider>;
}

export function useAnalytics(): Analytics {
  const ctx = useContext(AnalyticsCtx);
  if (!ctx) throw new Error('useAnalytics must be used within AnalyticsProvider');
  return ctx;
}
