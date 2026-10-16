import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Loader2, PlayCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { runComodatoLibros, type ResultadoComodatoLibros } from '@/services/comodatoLibrosService';
import { pedidosConfigurado, syncPedidos } from '@/services/pedidosService';
import { syncFacturacion } from '@/services/facturacionLibrosService';
import { hojasDeLibro, usePedidosStore } from '@/store/pedidosStore';
import { useFacturacionStore } from '@/store/facturacionStore';
import { useDataStore } from '@/store/dataStore';
import { formatDateTime, formatNumber } from '@/lib/utils';
import { TableroComodato } from './tablero/TableroComodato';

/** Módulo "Comodato (libros)": el MISMO análisis de Comodato vs. Facturación, pero con los libros nuevos —YBFD/ZBRE de Google Sheets y la facturación
 * de los libros de Drive, por mes— en vez de un Excel subido a mano y del acumulado de R2. Los resultados se ven en el tablero del proyecto
 * Comodato_vs_Fac_Medivac (Dirección, Gerencial y Comercial). Convive con el módulo original para poder comparar. */
export function ComodatoLibrosPage() {
  const catalog = useDataStore((s) => s.catalog);
  const hojas = usePedidosStore((s) => s.hojas);
  const infoLibro = usePedidosStore((s) => s.fuentes.comodato);
  const pedidosListos = usePedidosStore((s) => s.hidratado);
  const pedidosSync = usePedidosStore((s) => s.syncing);
  const pedidosError = usePedidosStore((s) => s.error);
  const facListos = useFacturacionStore((s) => s.hidratado);
  const resumenFac = useFacturacionStore((s) => s.resumenFac);
  const facLibros = useFacturacionStore((s) => s.libros);
  const facSync = useFacturacionStore((s) => s.syncing);
  const facError = useFacturacionStore((s) => s.error);
  const hoja = useMemo(() => hojasDeLibro(hojas, 'comodato')[0], [hojas]);

  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ResultadoComodatoLibros | null>(null);
  // Con qué datos se calculó lo que se ve: si cambian (sync nuevo), el tablero queda "desactualizado".
  const [base, setBase] = useState<{ hoja: unknown; fac: unknown } | null>(null);
  const intentado = useRef(false);

  // Al abrir (ya restaurada la caché local): revisa en Drive el libro de comodato y la facturación; solo baja lo que cambió o falta.
  useEffect(() => {
    if (!pedidosListos) return;
    void pedidosConfigurado().then((ok) => { if (ok) void syncPedidos({ libros: ['comodato'] }).catch(() => undefined); });
  }, [pedidosListos]);
  useEffect(() => {
    if (!facListos) return;
    void pedidosConfigurado().then((ok) => { if (ok) void syncFacturacion().catch(() => undefined); });
  }, [facListos]);

  const materiales = catalog?.materiales ?? [];
  const ejecutivos = catalog?.ejecutivos ?? [];
  const listo = !!hoja && !!resumenFac?.length && materiales.length > 0 && ejecutivos.length > 0;
  const conFechas = facLibros.length > 0 && facLibros.every((l) => l.conFechas);
  const desactualizado = !!data && !!base && (base.hoja !== hoja || base.fac !== resumenFac);

  const handleAnalizar = useCallback(async () => {
    if (!hoja || !resumenFac) return;
    setRunning(true);
    setError(null);
    try {
      setData(await runComodatoLibros({ hoja, resumenFac, materiales, ejecutivos }));
      setBase({ hoja, fac: resumenFac });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }, [hoja, resumenFac, materiales, ejecutivos]);

  // La primera vez que están todos los datos, analiza solo (después, "Recalcular" a mano o cuando haya cambios).
  useEffect(() => {
    if (listo && !data && !running && !intentado.current) {
      intentado.current = true;
      void handleAnalizar();
    }
  }, [listo, data, running, handleAnalizar]);

  return (
    <div className="flex h-full flex-col gap-5 overflow-auto px-6 pb-6 pt-4">
      <div>
        <h2 className="font-display text-2xl font-semibold">Comodatos</h2>
      </div>

      {!catalog && (
        <div className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-xs text-warning">
          <AlertTriangle className="size-3.5" /> Sincroniza el catálogo primero en "Carga" — este módulo necesita Materiales y Ejecutivos.
        </div>
      )}

      {(pedidosError || facError) && (
        <div className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {pedidosError ?? facError}
        </div>
      )}
      {(pedidosSync || facSync) && <p className="text-xs text-text-muted">Revisando los libros en Drive…</p>}
      {resumenFac?.length && !conFechas ? (
        <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          Los libros de facturación se bajaron sin la fecha de la última línea: "días sin compra" y el estatus quedan aproximados (hasta ~30 días). Publica la versión nueva del Apps Script y sincroniza Facturación en <Link to="/carga" className="underline">Carga</Link>.
        </div>
      ) : null}
      <p className="text-[11px] text-text-faint">
        Libros: comodato {infoLibro ? `${formatNumber(infoLibro.filas)} filas (${formatDateTime(infoLibro.leidoEn)})` : 'sin descargar'} · facturación {resumenFac?.length ? `${formatNumber(resumenFac.length)} filas, ${facLibros.length} libros` : 'sin cargar'}.
        La sincronización manual está en <Link to="/carga" className="underline">Carga</Link>.
      </p>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={!listo || running} onClick={handleAnalizar} variant={desactualizado ? 'default' : 'outline'}>
          {running ? <Loader2 className="size-4 animate-spin" /> : <PlayCircle className="size-4" />}
          {running ? 'Analizando…' : data ? 'Recalcular' : 'Analizar'}
        </Button>
        {desactualizado && !running && <span className="text-xs text-warning">Los libros cambiaron desde el último cálculo: recalcula para verlos reflejados.</span>}
        {!listo && !running && <span className="text-xs text-text-muted">Faltan datos: {[!hoja && 'libro de comodato', !resumenFac?.length && 'facturación', (!materiales.length || !ejecutivos.length) && 'catálogo'].filter(Boolean).join(', ')}.</span>}
        {data && <span className="text-[11px] text-text-faint">{data.facturacionFilas.toLocaleString('es-MX')} filas de facturación mensual en el análisis</span>}
      </div>

      {data && <TableroComodato resultado={data} />}
    </div>
  );
}
