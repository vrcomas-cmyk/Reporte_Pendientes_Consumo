import { Fragment, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Boxes, ChevronRight, Copy, Crosshair, ExternalLink, RefreshCw, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePersistedState } from '@/hooks/usePersistedState';
import { usePedidosStore, hojasDeLibro } from '@/store/pedidosStore';
import { syncPedidos } from '@/services/pedidosService';
import { claveMaterial, indiceColumna, numero } from '@/core/pedidos';
import { libreReal } from '@/core/inventoryRules';
import { filasInvCondicion, CONDICION_CORTA_CADUCIDAD, CONDICION_PNC } from '@/core/invCondicionLibros';
import { matchesQueryNormalized, searchNorm } from '@/modules/analytics/helpers';
import { DetalleMaterialDialog } from '@/modules/segPedidos/DetalleMaterialDialog';
import { toast } from '@/store/toastStore';
import { FloatingWindow, Z_WIDGET } from './FloatingWindow';

type Modo = 'disp' | 'cond';

const MAX_FILAS = 100;
/** Almacenes cuyo libre cuenta como inventario disponible de un centro. */
const ALMACENES_LIBRE = new Set(['1030', '1031', '1060']);
const cmpNum = (a: string, b: string) => a.localeCompare(b, 'es', { numeric: true });

interface LineaAlm { centro: string; almacen: string; cantidad: number }

/** Inventario de una condición abierto por centro/almacén (lo que `InvConsolidadoRow` solo trae sumado por centro). */
function almacenesDeCondicion(cond: ReturnType<typeof filasInvCondicion>, condicion: string, material: string): LineaAlm[] {
  const acum = new Map<string, LineaAlm>();
  const sumar = (centro: string, almacen: string, cantidad: number) => {
    if (!(cantidad > 0)) return;
    const k = `${centro}|${almacen}`;
    const l = acum.get(k);
    if (l) l.cantidad += cantidad; else acum.set(k, { centro, almacen, cantidad });
  };
  if (condicion === CONDICION_CORTA_CADUCIDAD) {
    for (const l of cond.lotes) if (l.material === material && l.motivo) sumar(l.centro, l.almacen, l.libre);
  } else if (condicion === CONDICION_PNC) {
    const d = cond.detalle[CONDICION_PNC];
    const iAlm = d?.columnas.indexOf('Almacén') ?? -1;
    const iCant = d?.columnas.indexOf('Cantidad') ?? -1;
    for (const f of d?.filas ?? []) if (f.material === material && iAlm !== -1 && iCant !== -1) sumar(f.centro, f.celdas[iAlm] ?? '', numero(f.celdas[iCant]));
  } else {
    for (const l of cond.invRevision[material] ?? []) sumar(l.centro, l.almacen, l.cantidad);
  }
  return [...acum.values()].sort((a, b) => cmpNum(a.centro, b.centro) || cmpNum(a.almacen, b.almacen));
}
const fmt = (n: number) => n.toLocaleString('es-MX', { maximumFractionDigits: 2 });

interface FilaDisp {
  material: string;
  texto: string;
  libre: number;
  /** Libre real en el almacén 1032 (aparte del libre de 1030+1031+1060). */
  libre1032: number;
  transito: number;
  lineas: { centro: string; almacen: string; libre: number; libre1032: number; transito: number }[];
  hay: string;
}

interface FilaResultado {
  material: string;
  texto: string;
  /** Etiqueta secundaria (condición en modo "Con condición"). */
  etiqueta?: string;
  total: number;
  transito?: number;
  /** Solo en Disponible. */
  libre1032?: number;
}

const PALABRAS_VACIAS = new Set(['del', 'las', 'los', 'con', 'para', 'por', 'una', 'uno']);
/** Palabras de una descripción útiles para buscar (sin artículos, sin números sueltos). */
const palabrasDe = (texto: string) => texto.split(/\s+/).filter((p) => p.length >= 3 && !/^\d{1,2}$/.test(p) && !PALABRAS_VACIAS.has(p.toLowerCase()));
/** Códigos de material (5-10 dígitos) que aparecen en un texto. */
const codigosEn = (texto: string) => texto.match(/\b\d{5,10}\b/g) ?? [];

interface Enfoque { material: string; texto: string }

/** Una consulta puede traer varios códigos separados por coma, `;` o salto de línea (pegados desde Excel): coincide con cualquiera. */
function coincide(query: string, hay: string): boolean {
  const partes = query.split(/[\n,;]+/).map((p) => p.trim()).filter(Boolean);
  if (partes.length <= 1) return matchesQueryNormalized(query, hay);
  return partes.some((p) => matchesQueryNormalized(p, hay));
}

function Contenido({ modo, onBuscarEn }: { modo: Modo; onBuscarEn: (m: Modo) => void }) {
  const hojas = usePedidosStore((s) => s.hojas);
  const fuentes = usePedidosStore((s) => s.fuentes);
  const syncing = usePedidosStore((s) => s.syncing);
  const [query, setQuery] = useState('');
  // La lista se recalcula con el valor diferido: el campo de búsqueda responde al instante aunque el filtro tarde.
  const consulta = useDeferredValue(query);
  const [enfoque, setEnfoque] = useState<Enfoque | null>(null);
  // El cálculo con condición (pesado) se adelanta un momento después de abrir para que al desplegar un material no se congele la ventana.
  const [precalentar, setPrecalentar] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setPrecalentar(true), 400);
    return () => window.clearTimeout(id);
  }, []);
  const [soloExistencia, setSoloExistencia] = usePersistedState('inventario.soloExistencia', true);
  const [desagrupar, setDesagrupar] = usePersistedState('inventario.desagrupar', false);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [centrosAbiertos, setCentrosAbiertos] = useState<Set<string>>(new Set());
  const [detalle, setDetalle] = useState<string | null>(null);

  // Disponibilidad: una fila por material con su Libre real (Libre − Entrega a cliente, mínimo 0 por fila), por centro/almacén.
  const disp = useMemo<FilaDisp[]>(() => {
    const h = hojasDeLibro(hojas, 'disponibilidad')[0];
    if (!h || h.idxMaterial === -1) return [];
    const iCentro = indiceColumna(h.nombres, ['centro']);
    const iAlmacen = indiceColumna(h.nombres, ['almacen']);
    const iLibre = indiceColumna(h.nombres, ['libre utilizacion']);
    const iEntrega = indiceColumna(h.nombres, ['entrega a cliente']);
    const iTransito = indiceColumna(h.nombres, ['cant. en transito', 'transito']);
    const iDesc = indiceColumna(h.nombres, ['descripcion', 'texto breve', 'texto material']);
    const mapa = new Map<string, FilaDisp>();
    for (const f of h.rows) {
      const material = claveMaterial(f[h.idxMaterial]);
      if (!material) continue;
      let fila = mapa.get(material);
      if (!fila) { fila = { material, texto: '', libre: 0, libre1032: 0, transito: 0, lineas: [], hay: '' }; mapa.set(material, fila); }
      if (!fila.texto && iDesc !== -1) fila.texto = String(f[iDesc] ?? '').trim();
      const almacen = claveMaterial(f[iAlmacen]);
      // Mismo criterio que el resto de la app (inventarioDesdeDisponibilidad): el libre cuenta solo en 1030/1031/1060; el tránsito, en todos.
      // El almacén 1032 NO suma al libre: va aparte, en su propia columna.
      const bruto = libreReal(numero(f[iLibre]), numero(f[iEntrega]));
      const real = ALMACENES_LIBRE.has(almacen) ? bruto : 0;
      const real1032 = almacen === '1032' ? bruto : 0;
      const transito = numero(f[iTransito]);
      fila.libre += real;
      fila.libre1032 += real1032;
      fila.transito += transito;
      if (real > 0 || real1032 > 0 || transito > 0) fila.lineas.push({ centro: claveMaterial(f[iCentro]), almacen, libre: real, libre1032: real1032, transito });
    }
    const filas = [...mapa.values()];
    for (const f of filas) f.hay = searchNorm(`${f.material} ${f.texto}`);
    return filas;
  }, [hojas]);

  // Con condición (Corta caducidad, Revision, PNC) y la relación de sustitutos; es el cálculo pesado, solo si se usa.
  const necesitaCond = modo === 'cond' || expandido !== null || precalentar;
  const cond = useMemo(() => (necesitaCond ? filasInvCondicion(Object.values(hojas)) : null), [necesitaCond, hojas]);
  const condIdx = useMemo(
    () => (cond ? cond.filas.map((f) => ({ f, hay: searchNorm(`${f.material} ${f.textoBreve} ${f.condicion} ${f.detalle ?? ''}`) })) : []),
    [cond],
  );

  const textoDe = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of disp) if (f.texto) m.set(f.material, f.texto);
    return m;
  }, [disp]);

  const { resultados, hayMas, totales } = useMemo(() => {
    const q = consulta.trim();
    let lista: FilaResultado[];
    if (modo === 'disp') {
      lista = disp
        .filter((f) => (!soloExistencia || f.libre > 0 || f.libre1032 > 0) && (!q || coincide(q, f.hay)))
        .map((f) => ({ material: f.material, texto: f.texto, total: f.libre, transito: f.transito, libre1032: f.libre1032 }));
    } else {
      lista = condIdx
        .filter(({ f, hay }) => (!soloExistencia || (f.invTotal ?? f.invSuma) > 0) && (!q || coincide(q, hay)))
        .map(({ f }) => ({ material: f.material, texto: f.textoBreve, etiqueta: f.condicion, total: f.invTotal ?? f.invSuma }));
    }
    lista.sort((a, b) => b.total - a.total || a.material.localeCompare(b.material, 'es', { numeric: true }));
    // Totales de TODO lo que pasa el filtro (no solo de las 100 filas que se pintan).
    const totales = { n: lista.length, total: 0, libre1032: 0, transito: 0, porCondicion: new Map<string, number>() };
    for (const r of lista) {
      totales.total += r.total;
      totales.libre1032 += r.libre1032 ?? 0;
      totales.transito += r.transito ?? 0;
      if (r.etiqueta) totales.porCondicion.set(r.etiqueta, (totales.porCondicion.get(r.etiqueta) ?? 0) + r.total);
    }
    return { resultados: lista.slice(0, MAX_FILAS), hayMas: lista.length > MAX_FILAS, totales };
  }, [modo, disp, condIdx, consulta, soloExistencia]);

  // Índice del modo activo (una entrada por material) con lo necesario para contar y sugerir.
  const indiceModo = useMemo(() => {
    if (modo === 'disp') return disp.map((f) => ({ material: f.material, texto: f.texto, hay: f.hay, activo: f.libre > 0 || f.libre1032 > 0 }));
    const vistos = new Map<string, { material: string; texto: string; hay: string; activo: boolean }>();
    for (const { f, hay } of condIdx) {
      const e = vistos.get(f.material);
      const activo = (f.invTotal ?? f.invSuma) > 0;
      if (e) { e.activo = e.activo || activo; e.hay += ` ${hay}`; } else vistos.set(f.material, { material: f.material, texto: f.textoBreve, hay, activo });
    }
    return [...vistos.values()];
  }, [modo, disp, condIdx]);

  // De lo general a lo particular: la descripción del material enfocado se corta palabra por palabra
  // («ALCOHOL» → «ALCOHOL ETILICO» → …) y cada nivel muestra cuántos materiales abarca.
  const cadena = useMemo(() => {
    if (!enfoque) return [];
    const palabras = palabrasDe(enfoque.texto || textoDe.get(enfoque.material) || '').slice(0, 6);
    const niveles: { etiqueta: string; n: number }[] = [];
    for (let i = 1; i <= palabras.length; i++) {
      const etiqueta = palabras.slice(0, i).join(' ');
      const tokens = searchNorm(etiqueta).split(' ').filter(Boolean);
      let n = 0;
      for (const e of indiceModo) if ((!soloExistencia || e.activo) && tokens.every((t) => e.hay.includes(t))) n++;
      if (n === 0) continue;
      if (niveles.length && niveles[niveles.length - 1]!.n === n) niveles[niveles.length - 1] = { etiqueta, n }; // mismo alcance: se queda el nivel más específico
      else niveles.push({ etiqueta, n });
    }
    return niveles;
  }, [enfoque, indiceModo, soloExistencia, textoDe]);

  // Palabras más frecuentes en los resultados actuales que aún no están en la búsqueda: afinan la consulta.
  const facetas = useMemo(() => {
    const q = consulta.trim();
    if (!q || totales.n < 2) return [];
    const ya = new Set(searchNorm(q).split(/[\s,;]+/).filter(Boolean));
    const cuenta = new Map<string, { etiqueta: string; n: number }>();
    const muestra = indiceModo.filter((e) => (!soloExistencia || e.activo) && coincide(q, e.hay)).slice(0, 2500);
    for (const e of muestra) {
      for (const p of new Set(palabrasDe(e.texto))) {
        const k = searchNorm(p);
        if (!k || ya.has(k)) continue;
        const c = cuenta.get(k);
        if (c) c.n++; else cuenta.set(k, { etiqueta: p, n: 1 });
      }
    }
    return [...cuenta.values()].filter((c) => c.n < muestra.length).sort((a, b) => b.n - a.n).slice(0, 8);
  }, [consulta, indiceModo, soloExistencia, totales.n]);

  // Lo que el usuario está mirando en la app: al hacer clic en una fila/tarjeta con un código de material conocido, el widget lo enfoca.
  const conocidos = useRef(textoDe);
  conocidos.current = textoDe;
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Element) || t.closest('[data-floating-widget]')) return;
      const fila = t.closest('tr, li, [role="row"], [role="listitem"], [data-material]');
      const dm = fila?.getAttribute('data-material');
      const texto = (fila?.textContent ?? t.textContent ?? '').slice(0, 700);
      for (const c of dm ? [dm] : codigosEn(texto)) {
        const m = claveMaterial(c);
        if (conocidos.current.has(m)) { setEnfoque({ material: m, texto: conocidos.current.get(m) ?? '' }); return; }
      }
    };
    document.addEventListener('click', onClick, { capture: true, passive: true });
    return () => document.removeEventListener('click', onClick, { capture: true });
  }, []);

  const sinDatos = modo === 'disp' ? disp.length === 0 : !cond || condIdx.length === 0;
  const leidoEn = fuentes[modo === 'disp' ? 'disponibilidad' : 'condicion']?.leidoEn;

  const sincronizar = () => {
    void syncPedidos({ forzar: true }).then(() => toast.info('Inventarios actualizados', 'Se sincronizaron los libros de Google Sheets.'), () => toast.error('No se pudo sincronizar', 'Revisa la conexión del libro de inventarios.'));
  };

  const copiar = (codigo: string) => { void navigator.clipboard.writeText(codigo).then(() => toast.info('Código copiado', codigo)); };

  function renderSustitutos(material: string) {
    const rels = (cond?.sustituciones ?? []).flatMap((s) => {
      if (s.material === material) return [{ codigo: s.sustituto, texto: s.textoSustituto, inv: s.invTotal }];
      if (s.sustituto === material) return [{ codigo: s.material, texto: s.textoMaterial, inv: s.invTotalMaterial }];
      return [];
    });
    if (!rels.length) return null;
    return (
      <div className="mt-2">
        <div className="mb-1 text-[11px] font-medium text-text-muted">Sustitutos (hoja Sustituto)</div>
        <ul className="space-y-1">
          {rels.map((r) => (
            <li key={r.codigo}>
              <button type="button" onClick={() => { setQuery(r.codigo); setExpandido(null); }} className="flex w-full items-baseline justify-between gap-2 rounded px-1.5 py-1 text-left hover:bg-bg-inset">
                <span className="min-w-0 truncate"><span className="font-mono text-accent">{r.codigo}</span> <span className="text-text-muted">{r.texto}</span></span>
                <span className={cn('shrink-0 tabular-nums', r.inv > 0 ? 'text-success' : 'text-text-faint')}>{fmt(r.inv)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  function renderExpandido(material: string) {
    if (modo === 'disp') {
      const f = disp.find((x) => x.material === material);
      // Una fila por centro (libre = 1030+1031+1060 sumados, con el 1032 en su propia columna). Cada centro se puede
      // desplegar para ver sus almacenes; "Ver por almacén" los despliega todos.
      const centros = new Map<string, { centro: string; libre: number; libre1032: number; transito: number; almacenes: NonNullable<typeof f>['lineas'] }>();
      for (const l of f?.lineas ?? []) {
        const c = centros.get(l.centro) ?? { centro: l.centro, libre: 0, libre1032: 0, transito: 0, almacenes: [] };
        c.libre += l.libre; c.libre1032 += l.libre1032; c.transito += l.transito; c.almacenes.push(l);
        centros.set(l.centro, c);
      }
      const lista = [...centros.values()].sort((a, b) => cmpNum(a.centro, b.centro));
      // Lotes de la hoja Corta caducidad que NO son de corta vigencia (≥ 365 días), con libre, en los almacenes de Disponibilidad; la caducidad más próxima primero.
      const lotesLargos = (cond?.lotes ?? [])
        .filter((l) => l.material === material && l.libre > 0 && l.motivo !== 'VIGENCIA' && l.motivo !== 'AMBOS' && (ALMACENES_LIBRE.has(l.almacen) || l.almacen === '1032'))
        .sort((a, b) => (a.fechaCaducidad ?? '9999').localeCompare(b.fechaCaducidad ?? '9999') || cmpNum(a.centro, b.centro));
      return (
        <div className="border-t border-border bg-bg-inset/50 px-3 py-2 text-xs">
          {lista.length > 0 ? (
            <table className="w-full">
              <thead><tr className="text-left text-[11px] text-text-faint"><th className="font-normal">Centro</th><th className="text-right font-normal" title="Libre real 1030+1031+1060">Libre</th><th className="text-right font-normal" title="Libre real en el almacén 1032">Alm. 1032</th><th className="text-right font-normal">Tránsito</th></tr></thead>
              <tbody>
                {lista.map((c) => {
                  const k = `${material}|${c.centro}`;
                  const abierto = desagrupar || centrosAbiertos.has(k);
                  return (
                    <Fragment key={k}>
                      <tr className="cursor-pointer hover:bg-bg-inset" onClick={() => setCentrosAbiertos((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; })}>
                        <td><ChevronRight className={cn('mr-1 inline size-3 text-text-faint transition-transform', abierto && 'rotate-90')} />{c.centro}</td>
                        <td className="text-right tabular-nums">{fmt(c.libre)}</td>
                        <td className={cn('text-right tabular-nums', c.libre1032 > 0 ? 'text-warning' : 'text-text-faint')}>{fmt(c.libre1032)}</td>
                        <td className="text-right tabular-nums text-text-muted">{fmt(c.transito)}</td>
                      </tr>
                      {abierto && [...c.almacenes].sort((a, b) => cmpNum(a.almacen, b.almacen)).map((l, i) => (
                        <tr key={`${k}|${i}`} className="text-text-muted">
                          <td className="pl-5">Alm. {l.almacen}</td>
                          <td className="text-right tabular-nums">{fmt(l.libre)}</td>
                          <td className="text-right tabular-nums">{fmt(l.libre1032)}</td>
                          <td className="text-right tabular-nums">{fmt(l.transito)}</td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-border font-semibold">
                <tr>
                  <td>Total</td>
                  <td className="text-right tabular-nums text-success">{fmt(lista.reduce((s, c) => s + c.libre, 0))}</td>
                  <td className="text-right tabular-nums text-warning">{fmt(lista.reduce((s, c) => s + c.libre1032, 0))}</td>
                  <td className="text-right tabular-nums">{fmt(lista.reduce((s, c) => s + c.transito, 0))}</td>
                </tr>
              </tfoot>
            </table>
          ) : <div className="text-text-faint">Sin existencia en ningún centro.</div>}
          {lotesLargos.length > 0 && (
            <div className="mt-2">
              <div className="mb-1 text-[11px] font-medium text-text-muted" title="Lotes de la pestaña «Corta caducidad» con vigencia de 365 días o más (los de menos de 365 días son corta caducidad y están en «Con condición»).">Caducidades · lotes con vigencia ≥ 365 días</div>
              <table className="w-full">
                <thead><tr className="text-left text-[11px] text-text-faint"><th className="font-normal">Centro</th><th className="font-normal">Almacén</th><th className="font-normal">Lote</th><th className="font-normal">Caduca</th><th className="text-right font-normal">Libre</th></tr></thead>
                <tbody>
                  {lotesLargos.slice(0, 60).map((l, j) => (
                    <tr key={j}><td>{l.centro}</td><td>{l.almacen}</td><td className="font-mono">{l.lote}</td><td>{l.fechaCaducidad ?? '—'}</td><td className="text-right tabular-nums">{fmt(l.libre)}</td></tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-border font-semibold">
                  <tr><td colSpan={4}>Total · {lotesLargos.length} lote{lotesLargos.length === 1 ? '' : 's'}</td><td className="text-right tabular-nums text-success">{fmt(lotesLargos.reduce((a, l) => a + l.libre, 0))}</td></tr>
                </tfoot>
              </table>
            </div>
          )}
          {renderSustitutos(material)}
          {renderAcciones(material)}
        </div>
      );
    }
    // Con condición: una sección por condición (la fila ya viene por material × condición). Agrupado: inventario por centro;
    // desagrupado: por centro y almacén (y, en Corta caducidad, por lote).
    const filas = (cond?.filas ?? []).filter((x) => x.material === material);
    return (
      <div className="border-t border-border bg-bg-inset/50 px-3 py-2 text-xs">
        {filas.map((f, i) => {
          const lotes = desagrupar && f.condicion === CONDICION_CORTA_CADUCIDAD
            ? (cond?.lotes ?? []).filter((l) => l.material === material && l.motivo && l.libre > 0)
            : [];
          const almacenes = desagrupar && cond && f.condicion !== CONDICION_CORTA_CADUCIDAD ? almacenesDeCondicion(cond, f.condicion, material) : [];
          return (
            <div key={i} className="mb-2">
              <div className="font-medium">{f.condicion}{f.detalle ? <span className="font-normal text-text-muted"> · {f.detalle}</span> : null}</div>
              {!desagrupar && (
                <div className="flex flex-wrap gap-x-3 text-text-muted">
                  {Object.entries(f.invByCenter).filter(([, v]) => v > 0).map(([c, v]) => <span key={c}>{c}: <span className="tabular-nums text-text">{fmt(v)}</span></span>)}
                  <span className="font-semibold text-text">Total: <span className="tabular-nums text-success">{fmt(f.invTotal ?? f.invSuma)}</span></span>
                </div>
              )}
              {lotes.length > 0 && (
                <table className="mt-1 w-full">
                  <thead><tr className="text-left text-[11px] text-text-faint"><th className="font-normal">Centro</th><th className="font-normal">Almacén</th><th className="font-normal">Lote</th><th className="font-normal">Caduca</th><th className="text-right font-normal">Libre</th></tr></thead>
                  <tbody>
                    {lotes.slice(0, 60).map((l, j) => (
                      <tr key={j}><td>{l.centro}</td><td>{l.almacen}</td><td className="font-mono">{l.lote}</td><td>{l.fechaCaducidad ?? '—'}</td><td className="text-right tabular-nums">{fmt(l.libre)}</td></tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-border font-semibold">
                    <tr><td colSpan={4}>Total · {lotes.length} lote{lotes.length === 1 ? '' : 's'}</td><td className="text-right tabular-nums text-success">{fmt(lotes.reduce((s, l) => s + l.libre, 0))}</td></tr>
                  </tfoot>
                </table>
              )}
              {almacenes.length > 0 && (
                <table className="mt-1 w-full">
                  <thead><tr className="text-left text-[11px] text-text-faint"><th className="font-normal">Centro</th><th className="font-normal">Almacén</th><th className="text-right font-normal">Cantidad</th></tr></thead>
                  <tbody>
                    {almacenes.map((l, j) => (
                      <tr key={j}><td>{l.centro}</td><td>{l.almacen}</td><td className="text-right tabular-nums">{fmt(l.cantidad)}</td></tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-border font-semibold">
                    <tr><td colSpan={2}>Total</td><td className="text-right tabular-nums text-success">{fmt(almacenes.reduce((s, l) => s + l.cantidad, 0))}</td></tr>
                  </tfoot>
                </table>
              )}
              {desagrupar && lotes.length === 0 && almacenes.length === 0 && <div className="text-text-faint">Sin desglose por almacén.</div>}
            </div>
          );
        })}
        {renderSustitutos(material)}
        {renderAcciones(material)}
      </div>
    );
  }

  function renderAcciones(material: string) {
    return (
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={() => copiar(material)} className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 hover:bg-bg-inset"><Copy className="size-3" /> Copiar código</button>
        <button type="button" onClick={() => setDetalle(material)} className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 hover:bg-bg-inset"><ExternalLink className="size-3" /> Ver todo</button>
        <button type="button" onClick={() => onBuscarEn(modo === 'disp' ? 'cond' : 'disp')} className="ml-auto text-text-muted hover:text-text">Ver en {modo === 'disp' ? 'Con condición' : 'Disponible'}</button>
      </div>
    );
  }

  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border px-3 py-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-text-faint" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Material o descripción (varios códigos: coma o salto de línea)"
            className="h-8 w-full rounded-md border border-border bg-bg pl-7 pr-2 text-xs outline-none focus:border-accent"
          />
        </div>
        <label className="flex shrink-0 cursor-pointer items-center gap-1 text-[11px] text-text-muted">
          <input type="checkbox" checked={soloExistencia} onChange={(e) => setSoloExistencia(e.target.checked)} /> Solo con existencia
        </label>
        <label className="flex shrink-0 cursor-pointer items-center gap-1 text-[11px] text-text-muted" title={modo === 'disp' ? 'Agrupado: por centro (1030+1031+1060). Desagrupado: por centro y almacén.' : 'Agrupado: por condición y centro. Desagrupado: por almacén (y lote).'}>
          <input type="checkbox" checked={desagrupar} onChange={(e) => setDesagrupar(e.target.checked)} /> Ver por almacén
        </label>
      </div>

      {(enfoque || facetas.length > 0) && (
        <div className="shrink-0 space-y-1 border-b border-border bg-bg-inset/40 px-3 py-1.5 text-[11px]">
          {enfoque && (
            <div className="flex flex-wrap items-center gap-1">
              <Crosshair className="size-3 shrink-0 text-accent" />
              <span className="text-text-muted">Viendo</span>
              <button type="button" title="Buscar este código" onClick={() => setQuery(enfoque.material)} className="font-mono text-accent hover:underline">{enfoque.material}</button>
              <span className="min-w-0 max-w-[14rem] truncate text-text-faint" title={enfoque.texto}>{enfoque.texto}</span>
              <button type="button" aria-label="Quitar enfoque" onClick={() => setEnfoque(null)} className="text-text-faint hover:text-text"><X className="size-3" /></button>
              {cadena.length > 0 && <span className="ml-1 text-text-faint">· de lo general a lo particular:</span>}
              {cadena.map((c, i) => (
                <Fragment key={c.etiqueta}>
                  {i > 0 && <ChevronRight className="size-3 text-text-faint" />}
                  <button type="button" title={`Buscar «${c.etiqueta}»`} onClick={() => { setQuery(c.etiqueta); setExpandido(null); }} className={cn('rounded border px-1.5 py-0.5 hover:bg-bg-inset', searchNorm(query) === searchNorm(c.etiqueta) ? 'border-accent text-accent' : 'border-border text-text-muted')}>
                    {c.etiqueta.split(' ').at(-1)} <span className="tabular-nums text-text-faint">{c.n}</span>
                  </button>
                </Fragment>
              ))}
            </div>
          )}
          {facetas.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-text-faint">Afinar:</span>
              {facetas.map((f) => (
                <button key={f.etiqueta} type="button" onClick={() => { setQuery(`${query.trim()} ${f.etiqueta}`); setExpandido(null); }} className="rounded border border-border px-1.5 py-0.5 text-text-muted hover:bg-bg-inset">
                  {f.etiqueta} <span className="tabular-nums text-text-faint">{f.n}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 select-text overflow-auto text-xs">
        {sinDatos ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-text-muted">
            <p>{syncing ? 'Sincronizando inventarios…' : 'Aún no hay datos de inventario cargados.'}</p>
            <button type="button" disabled={syncing} onClick={sincronizar} className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 hover:bg-bg-inset disabled:opacity-50"><RefreshCw className={cn('size-3', syncing && 'animate-spin')} /> Sincronizar</button>
          </div>
        ) : resultados.length === 0 ? (
          <div className="p-6 text-center text-text-muted">Sin coincidencias{soloExistencia ? ' con existencia' : ''}.</div>
        ) : (
          <ul>
            {modo === 'disp' && (
              <li className="sticky top-0 z-10 flex justify-end gap-2 border-b border-border bg-bg-elevated px-3 py-1 text-[11px] text-text-faint">
                <span className="w-14 text-right" title="Libre real en el almacén 1032">Alm. 1032</span>
                <span className="w-16 text-right" title="Libre real 1030+1031+1060">Libre</span>
              </li>
            )}
            {resultados.map((r) => {
              const abierto = expandido === `${r.material}|${r.etiqueta ?? ''}`;
              const clave = `${r.material}|${r.etiqueta ?? ''}`;
              return (
                <li key={clave} className="border-b border-border">
                  <button type="button" onClick={() => { setExpandido(abierto ? null : clave); if (!abierto) setEnfoque({ material: r.material, texto: r.texto || textoDe.get(r.material) || '' }); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-bg-inset">
                    <ChevronRight className={cn('size-3 shrink-0 text-text-faint transition-transform', abierto && 'rotate-90')} />
                    <span className="font-mono text-accent">{r.material}</span>
                    <span className="min-w-0 flex-1 truncate text-text-muted">{r.texto || textoDe.get(r.material) || ''}</span>
                    {r.etiqueta && <span className="shrink-0 rounded bg-accent-soft px-1.5 py-0.5 text-[10px] text-accent">{r.etiqueta}</span>}
                    {r.libre1032 !== undefined && <span title="Libre en almacén 1032" className={cn('w-14 shrink-0 text-right tabular-nums', r.libre1032 > 0 ? 'text-warning' : 'text-text-faint')}>{fmt(r.libre1032)}</span>}
                    <span title={modo === 'disp' ? 'Libre 1030+1031+1060' : undefined} className={cn('w-16 shrink-0 text-right tabular-nums font-medium', r.total > 0 ? 'text-success' : 'text-text-faint')}>{fmt(r.total)}</span>
                  </button>
                  {abierto && renderExpandido(r.material)}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Banda de totales del filtro activo (todos los resultados, no solo los 100 mostrados); columnas alineadas con las filas. */}
      {!sinDatos && (
        <div className="flex shrink-0 items-center gap-2 border-t-2 border-border bg-bg-elevated px-3 py-1.5 text-xs font-semibold shadow-[0_-1px_0_var(--border)]">
          <span className="min-w-0 flex-1 truncate">
            Total · {fmt(totales.n)} material{totales.n === 1 ? '' : 'es'}
            {modo === 'disp' && totales.transito > 0 && <span className="ml-2 font-normal text-text-muted">Tránsito {fmt(totales.transito)}</span>}
            {modo === 'cond' && [...totales.porCondicion.entries()].map(([c, v]) => <span key={c} className="ml-2 font-normal text-text-muted">{c} {fmt(v)}</span>)}
          </span>
          {modo === 'disp' && <span title="Libre en almacén 1032" className="w-14 shrink-0 text-right tabular-nums text-warning">{fmt(totales.libre1032)}</span>}
          <span className="w-16 shrink-0 text-right tabular-nums text-success">{fmt(totales.total)}</span>
        </div>
      )}
      <div className="flex shrink-0 items-center justify-between bg-bg-inset px-3 py-0.5 text-[11px] text-text-faint">
        <span>{hayMas ? `Mostrando los primeros ${MAX_FILAS}; afina la búsqueda` : `${resultados.length} resultado${resultados.length === 1 ? '' : 's'}`}</span>
        <span>{leidoEn ? `Datos: ${new Date(leidoEn).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}` : ''}</span>
      </div>

      <DetalleMaterialDialog material={detalle} onClose={() => setDetalle(null)} />
    </>
  );
}

/** Widget flotante de inventarios: busca materiales por código/descripción y muestra el inventario Disponible o Con condición,
 * para decidir si un material puede cambiarse por otro. Vive en AppShell (como la calculadora) y queda sobre cualquier diálogo. */
export function InventarioWidget() {
  const [open, setOpen] = usePersistedState('inventario.open', false);
  const [modo, setModo] = usePersistedState<Modo>('inventario.modo', 'disp');

  // Alt+I abre/cierra el widget desde cualquier lado.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyI') { e.preventDefault(); setOpen((o) => !o); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [setOpen]);

  return (
    <>
      {createPortal(
        <button
          type="button"
          onClick={() => setOpen(!open)}
          title={open ? 'Ocultar inventarios (Alt+I)' : 'Buscar en inventarios (Alt+I)'}
          data-floating-widget
          className={cn('pointer-events-auto fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-[4.25rem] flex size-11 items-center sm:bottom-6 sm:right-[4.75rem] sm:size-12 justify-center rounded-full border border-border bg-bg-elevated text-text shadow-lg transition-transform hover:scale-105 active:scale-95', Z_WIDGET)}
        >
          <Boxes className="size-5" />
        </button>,
        document.body,
      )}

      {open && (
        <FloatingWindow
          titulo="Inventarios"
          posKey="inventario.pos"
          posInicial={{ x: 24, y: 88 }}
          onClose={() => setOpen(false)}
          redimensionable
          className="h-[30rem] w-[34rem] min-h-[16rem] min-w-[22rem]"
        >
          <div className="flex shrink-0 gap-1 border-b border-border px-3 py-2" role="tablist" aria-label="Tipo de inventario">
            {([['disp', 'Disponible'], ['cond', 'Con condición']] as const).map(([m, etiqueta]) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={modo === m}
                onClick={() => setModo(m)}
                className={cn('rounded-md px-3 py-1 text-xs font-medium transition-colors', modo === m ? 'bg-accent text-accent-fg' : 'text-text-muted hover:bg-bg-inset')}
              >
                {etiqueta}
              </button>
            ))}
          </div>
          <Contenido modo={modo} onBuscarEn={setModo} />
        </FloatingWindow>
      )}
    </>
  );
}
