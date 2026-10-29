import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { ReportPage, PageHeader } from '@/components/layout/report';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Send, Check, X, Save, Plus, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { EmptyState } from '@/components/feedback/EmptyState';
import { formatCurrency, formatNumber, formatFraccion } from '@/lib/utils';
import { exportXlsx, stamp } from '@/lib/exportXlsx';
import { toast } from '@/store/toastStore';
import { supabase } from '@/lib/supabaseClient';
import { useAnalytics } from '@/modules/analytics/AnalyticsContext';
import { useFacturacionLibros } from '@/modules/analytics/useFacturacionLibros';
import { useDataStore } from '@/store/dataStore';
import { usePermissionsStore } from '@/store/permissionsStore';
import { usePreciosStore } from '@/store/preciosStore';
import { useCostoVisible } from '@/modules/analytics/panels/CostoMaterial';
import { norm } from '@/lib/text';
import {
  analisisPrecio, combinacionDe, precioValido, POLITICA_DEFECTO, SECTOR_GLOBAL, CONDICION_DEFECTO,
  type AmbitoMargen, type CondicionRevision, type OrigenBase, type Politica, type ReglaMargenMin,
} from '@/core/politicaPrecios';
import {
  combinacionesEncontradas, filasCalculadora, historialDeFacturacion, lotesPncDeDetalle, recalcularOferta, segmentosDeMaterial,
  type EntradaSegmentos, type FilaOferta, type HistorialPrecio, type LoteSeg, type MaterialPrecio, type Segmento,
} from '@/core/calculadoraPrecios';
import { etiquetaCombinacion } from '@/core/enrich';
import { AutorizacionExcel } from './AutorizacionExcel';
import { useFiltroPropuestas } from './useFiltroPropuestas';
import { HistorialPrecios, VigenciaCelda } from './VigenciaPrecios';
import { StatePill } from '@/modules/analytics/ui';
import { CapturaPrecios } from './CapturaPrecios';
import { estatusDeFila, resumenAvisos, type Aviso, type Estatus, type EstatusFila } from '@/core/estatusPrecios';
import { cargarPolitica, guardarPolitica, enviarPropuestas, resolverPropuestas, vigentes, type NuevaPropuesta } from '@/services/preciosService';

const MESES_HISTORIAL = 12;
const ORIGEN_TXT: Record<OrigenBase, string> = {
  'mercado-p50': 'Mediana del material',
  grupo: 'Razón del grupo de artículos',
  sector: 'Razón del sector',
  'sin-historial': 'Margen objetivo (sin ventas)',
  'tope-lista06': 'Tope LISTA 06',
  'piso-margen': 'Margen mínimo',
};
const AMBITO_TXT: Record<AmbitoMargen, string> = { material: 'Material', grupo: 'Grupo de artículos', sector: 'Sector' };
const ORIGEN_MARGEN_TXT: Record<string, string> = { manual: 'a mano', material: 'por material', grupo: 'por grupo', sector: 'por sector', condicion: 'de la condición' };
const origenTitulo = (f: FilaOferta) => {
  const b = f.base;
  return `Base = ${b.base ? formatCurrency(b.base) : '—'}\nPunto medio (${ORIGEN_TXT[b.origenBase ?? 'sin-historial']}): ${b.referencia ? formatCurrency(b.referencia) : '—'}${b.techo ? ` · Tope LISTA 06: ${formatCurrency(b.techo)}` : ''}\nBase = el punto medio, acotado por el tope y por el margen mínimo.`;
};
const ESTATUS_TXT: Record<Estatus, { txt: string; cls: string; ayuda: string }> = {
  'sin-enviar': { txt: 'Sin enviar', cls: 'border-accent/40 bg-accent-soft text-accent', ayuda: 'Nunca se ha mandado a autorizar' },
  pendiente: { txt: 'Pendiente', cls: 'amb', ayuda: 'Ya se mandó: espera al director' },
  autorizado: { txt: 'Autorizado', cls: 'verde', ayuda: 'Autorizado: este precio ya se usa en los demás reportes' },
  rechazado: { txt: 'Rechazado', cls: 'rojo', ayuda: 'El director no lo autorizó' },
  reenviar: { txt: 'Reenviar', cls: 'rojo', ayuda: 'El precio autorizado ya no supera el costo: hay que volver a mandarlo' },
};
const AVISO_TXT: Record<Aviso, string> = { nuevo: 'Nuevo', 'lote-nuevo': 'Lote nuevo', 'calculo-distinto': 'Cálculo cambió', invalido: 'Autorizado inválido' };

/** ¿El autorizador cambió el precio que se le mandó? */
const modificado = (p: { precioEnviado: number | null; precioPropuesto: number }) => p.precioEnviado != null && Math.abs(p.precioEnviado - p.precioPropuesto) >= 0.005;
const claveFila = (f: FilaOferta) => `${f.material}|${combinacionDe(f.banderas)}`;

/** Muestra y captura un porcentaje como "10" (no 0.1): el valor interno sigue siendo la fracción. */
function PctInput({ valor, onChange, disabled, ariaLabel, vacio, placeholder, className }: {
  valor: number | null; onChange: (v: number | null) => void; disabled?: boolean; ariaLabel: string; vacio?: boolean; placeholder?: string; className?: string;
}) {
  const fmt = (v: number | null) => (v == null ? '' : String(Math.round(v * 10000) / 100));
  const [txt, setTxt] = useState(fmt(valor));
  const ultimo = useRef(valor);
  useEffect(() => {
    if (ultimo.current !== valor && (ultimo.current == null || valor == null || Math.abs(ultimo.current - valor) > 1e-9)) {
      ultimo.current = valor;
      setTxt(fmt(valor));
    }
  }, [valor]);
  return (
    <span className="inline-flex items-center gap-0.5">
      <input
        aria-label={ariaLabel} inputMode="decimal" disabled={disabled} placeholder={placeholder}
        className={className ?? 'h-8 w-16 rounded border border-border bg-bg-elevated px-1 text-right tabular-nums'}
        value={txt}
        onChange={(e) => {
          const t = e.target.value;
          setTxt(t);
          const n = parseFloat(t.replace(',', '.'));
          const v = t.trim() === '' && vacio ? null : Number.isFinite(n) ? n / 100 : undefined;
          if (v === undefined) return;
          ultimo.current = v;
          onChange(v);
        }}
      />
      <span className="text-xs text-text-faint">%</span>
    </span>
  );
}

const inputCls = 'h-8 w-24 rounded border bg-bg-elevated px-1 text-right text-sm tabular-nums';

export function PreciosPage() {
  useFacturacionLibros(); // pide (y revisa en Drive) la facturación de los libros: de ahí salen Mín / Prom / Máx
  const a = useAnalytics();
  const catalog = useDataStore((s) => s.catalog);
  const isAdmin = usePermissionsStore((s) => s.perms.isAdmin);
  const costoVisible = useCostoVisible();
  const propuestas = usePreciosStore((s) => s.propuestas);
  const recargar = usePreciosStore((s) => s.load);
  const [pol, setPol] = useState<Politica>(POLITICA_DEFECTO);
  const [email, setEmail] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [margenManual, setMargenManual] = useState<Record<string, number | null>>({});
  const [ajuste, setAjuste] = useState<Record<string, string>>({});
  const [filtro, setFiltro] = useState('');
  const [filtroEstatus, setFiltroEstatus] = useState<'todos' | Estatus | 'aviso'>('todos');
  const [ocupado, setOcupado] = useState(false);
  const [nuevaRegla, setNuevaRegla] = useState<{ ambito: AmbitoMargen; clave: string; condicion: string; margenMin: number | null }>({ ambito: 'sector', clave: '', condicion: '', margenMin: null });

  useEffect(() => {
    void recargar();
    void cargarPolitica().then(setPol);
    void supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ''));
  }, [recargar]);

  // Catálogo → materiales con sector y grupo de artículos.
  const materiales = useMemo(() => {
    const m = new Map<string, MaterialPrecio>();
    for (const x of catalog?.materiales ?? []) {
      m.set(norm(x.material), { material: x.material, texto: x.textoBreve, sector: x.descrSector, grupo: x.descrGrupoArt, costo: x.costo, lista06: x.lista06 || undefined });
    }
    return m;
  }, [catalog]);

  // Últimos 12 meses facturados (Resumen_Fac de los libros): precio = importe / cantidad, ponderado por volumen.
  const historial = useMemo<Map<string, HistorialPrecio>>(() => {
    if (!a.facturacion.rf) return new Map();
    return historialDeFacturacion(a.facturacion.rf.rows, new Set(a.mesesDisponibles.slice(-MESES_HISTORIAL)));
  }, [a.facturacion.rf, a.mesesDisponibles]);

  // Lotes por material: CC se calcula en la app (hoja Corta caducidad); PNC viene del archivo.
  const inventarios = useMemo(() => {
    const lotesCc = new Map<string, LoteSeg[]>();
    for (const l of a.lotesLibros) {
      if (!(l.cantidadDisp > 0)) continue;
      const f = l.fechaCaducidad ? new Date(`${l.fechaCaducidad}T00:00:00`) : null;
      const k = norm(l.material);
      const arr = lotesCc.get(k) ?? [];
      arr.push({ cantidad: l.cantidadDisp, vence: f && !Number.isNaN(f.getTime()) ? f : null, id: `${l.centro}|${l.almacen}|${l.lote}` });
      lotesCc.set(k, arr);
    }
    return { lotesCc, lotesPnc: lotesPncDeDetalle(a.detalleLotesLibros?.PNC) };
  }, [a.lotesLibros, a.detalleLotesLibros]);

  const filas = useMemo(() => {
    const { lotesCc, lotesPnc } = inventarios;
    const claves = new Set<string>([...lotesCc.keys(), ...lotesPnc.keys(), ...a.estadosRevisionLibros.keys()]);
    const segmentos = new Map<string, Segmento[]>();
    const mats: MaterialPrecio[] = [];
    for (const k of claves) {
      const m = materiales.get(k);
      if (!m) continue;
      const rev = a.estadosRevisionLibros.get(k);
      // Solo los Status que el usuario marcó como incluidos (Parámetros) entran como condición.
      const estados = (rev?.estados ?? []).filter((st) => pol.condiciones[st]?.incluida);
      const segs = segmentosDeMaterial({ lotesCc: lotesCc.get(k) ?? [], lotesPnc: lotesPnc.get(k) ?? [], libreGeneral: rev?.libreGeneral ?? 0, estados });
      if (!segs.length) continue;
      mats.push(m);
      segmentos.set(m.material, segs);
    }
    const universo = [...materiales.values()];
    const historialPorMat = new Map(universo.flatMap((m) => { const h = historial.get(norm(m.material)); return h ? [[m.material, h] as const] : []; }));
    return filasCalculadora(mats, historialPorMat, segmentos, pol, universo);
  }, [materiales, historial, inventarios, a.estadosRevisionLibros, pol]);

  // Todos los Status que trae la pestaña Revision (cada uno es una condición) con cuántos materiales lo tienen.
  const estadosRev = useMemo(() => {
    const m = new Map<string, number>();
    a.estadosRevisionLibros.forEach((v) => v.estados.forEach((st) => m.set(st, (m.get(st) ?? 0) + 1)));
    for (const st of Object.keys(pol.condiciones)) if (!m.has(st)) m.set(st, 0);
    return [...m].sort((x, y) => x[0].localeCompare(y[0], 'es'));
  }, [a.estadosRevisionLibros, pol.condiciones]);

  // Combinaciones que existen en los datos (con TODOS los Status considerados) para decidir qué entra.
  const combinaciones = useMemo(() => {
    const entradas = new Map<string, EntradaSegmentos & { sector: string }>();
    const claves = new Set<string>([...inventarios.lotesCc.keys(), ...inventarios.lotesPnc.keys(), ...a.estadosRevisionLibros.keys()]);
    for (const k of claves) {
      const rev = a.estadosRevisionLibros.get(k);
      entradas.set(k, { lotesCc: inventarios.lotesCc.get(k) ?? [], lotesPnc: inventarios.lotesPnc.get(k) ?? [], libreGeneral: rev?.libreGeneral ?? 0, estados: rev?.estados ?? [], sector: materiales.get(k)?.sector ?? '' });
    }
    return combinacionesEncontradas(entradas, pol);
  }, [materiales, inventarios, a.estadosRevisionLibros, pol]);

  const sectores = useMemo(() => [...new Set([...materiales.values()].map((m) => m.sector).filter(Boolean))].sort((x, y) => x.localeCompare(y, 'es')), [materiales]);
  const grupos = useMemo(() => [...new Set([...materiales.values()].map((m) => m.grupo).filter(Boolean))].sort((x, y) => x.localeCompare(y, 'es')), [materiales]);
  const condicionesOpc = useMemo(() => ['CC', 'PNC', ...estadosRev.map(([s]) => s)], [estadosRev]);

  const setCondicion = (status: string, patch: Partial<CondicionRevision>) =>
    setPol((p) => ({ ...p, condiciones: { ...p.condiciones, [status]: { ...(p.condiciones[status] ?? CONDICION_DEFECTO), ...patch } } }));

  // Estatus de autorización de cada renglón (material + combinación) frente a TODAS las propuestas, con los avisos de lo nuevo.
  const estatusDe = useMemo(() => {
    const m = new Map<string, EstatusFila>();
    for (const f of filas) {
      m.set(claveFila(f), estatusDeFila({
        material: f.material, combinacion: combinacionDe(f.banderas), costo: f.costo, precioCalculado: recalcularOferta(f, pol, null)?.precio ?? null, lotes: f.lotes,
      }, propuestas));
    }
    return m;
  }, [filas, propuestas, pol]);
  const resumen = useMemo(() => resumenAvisos([...estatusDe.values()]), [estatusDe]);

  const visibles = useMemo(() => {
    const q = norm(filtro);
    return filas.filter((f) => {
      if (q && !(norm(f.material).includes(q) || norm(f.texto).includes(q) || norm(f.sector).includes(q) || norm(f.grupo).includes(q))) return false;
      if (filtroEstatus === 'todos') return true;
      const e = estatusDe.get(claveFila(f));
      return filtroEstatus === 'aviso' ? (e?.avisos.length ?? 0) > 0 : e?.estatus === filtroEstatus;
    });
  }, [filas, filtro, filtroEstatus, estatusDe]);

  /** Oferta de la fila con el margen mínimo decidido a mano para ese caso (si lo hay) y el precio efectivo (calculado o escrito). */
  const detalleFila = (f: FilaOferta) => {
    const k = claveFila(f);
    const oferta = recalcularOferta(f, pol, margenManual[k]);
    const t = edit[k];
    const precio = t != null && t !== '' ? Number(t) : oferta?.precio ?? 0;
    return { k, oferta, precio, an: f.base.base ? analisisPrecio(precio, f.base.base, f.costo) : null };
  };

  /** ¿Se puede mandar a autorizar? Con precio válido y que no esté ya esperando al director; uno ya autorizado solo si tiene un aviso o se editó su precio. */
  const seleccionable = (f: FilaOferta): boolean => {
    const d = detalleFila(f);
    const e = estatusDe.get(d.k);
    if (!d.oferta || !precioValido(d.precio, f.costo) || !e || e.estatus === 'pendiente') return false;
    return e.estatus !== 'autorizado' || e.avisos.length > 0 || (edit[d.k] ?? '') !== '' || margenManual[d.k] != null;
  };
  const clavesSeleccionables = visibles.filter(seleccionable).map(claveFila);
  const todasMarcadas = clavesSeleccionables.length > 0 && clavesSeleccionables.every((k) => sel.has(k));
  const alternarTodas = () => setSel((s0) => { const n = new Set(s0); for (const k of clavesSeleccionables) { if (todasMarcadas) n.delete(k); else n.add(k); } return n; });
  const seleccionarNuevos = () => setSel(new Set(filas.filter((f) => estatusDe.get(claveFila(f))?.estatus === 'sin-enviar' && seleccionable(f)).map(claveFila)));

  async function enviar() {
    const items: NuevaPropuesta[] = [];
    for (const f of filas) {
      const d = detalleFila(f);
      // Solo ofertas CON condición (la «base» del material no se autoriza).
      if (!sel.has(d.k) || !d.oferta || !d.oferta.combinacion || !f.base.base) continue;
      items.push({ material: f.material, concepto: 'oferta', condicion: d.oferta.combinacion, costo: f.costo, base: f.base.base, precioCalculado: recalcularOferta(f, pol, null)?.precio ?? d.oferta.precio, precioPropuesto: d.precio, lotes: f.lotes });
    }
    if (!items.length) { toast.warning('Selecciona al menos una fila'); return; }
    setOcupado(true);
    try {
      const r = await enviarPropuestas(items, email);
      const omitidas = r.omitidas.repetidas + r.omitidas.yaPendientes + r.omitidas.sinCondicion;
      if (!r.enviadas) toast.warning('No se envió nada', `Todo lo seleccionado ya estaba pendiente de autorización${r.omitidas.sinCondicion ? ' o no tiene condición' : ''}.`);
      else toast.success('Enviado a autorización', `${r.enviadas} precio(s)${omitidas ? `; ${omitidas} omitido(s) porque ya estaban pendientes` : ''}. No se verán en otros reportes hasta autorizarse.`);
      setSel(new Set());
      await recargar();
    } catch (e) {
      toast.error('No se pudo enviar', e instanceof Error ? e.message : String(e));
    } finally { setOcupado(false); }
  }

  async function resolver(p: (typeof propuestas)[number], estado: 'autorizado' | 'rechazado') {
    setOcupado(true);
    try {
      const t = ajuste[p.id];
      const precios = t != null && t !== '' ? { [p.id]: Number(t) } : undefined;
      await resolverPropuestas([p], estado, email, { precios });
      toast.success(estado === 'autorizado' ? 'Autorizado' : 'Rechazado', `${p.material}${precios ? ` a ${formatCurrency(precios[p.id])}` : ''}.`);
      await recargar();
    } catch (e) {
      toast.error('No se pudo resolver', e instanceof Error ? e.message : String(e));
    } finally { setOcupado(false); }
  }

  function agregarRegla() {
    const clave = nuevaRegla.clave.trim();
    if (!clave || nuevaRegla.margenMin == null || !(nuevaRegla.margenMin > 0 && nuevaRegla.margenMin < 1)) {
      toast.warning('Completa la regla', 'Indica el material / grupo / sector y un margen mínimo mayor a 0%.');
      return;
    }
    const regla: ReglaMargenMin = { ambito: nuevaRegla.ambito, clave, condicion: nuevaRegla.condicion, margenMin: nuevaRegla.margenMin };
    setPol((p) => ({ ...p, margenesMin: [...p.margenesMin.filter((r) => !(r.ambito === regla.ambito && r.clave === regla.clave && r.condicion === regla.condicion)), regla] }));
    setNuevaRegla({ ...nuevaRegla, clave: '', margenMin: null });
  }

  // «Por autorizar» y «Autorizados» solo muestran ofertas CON condición (la «base» sin condición ya no se autoriza).
  const esOferta = (p: { concepto: string; condicion: string }) => p.concepto === 'oferta' && p.condicion.trim() !== '';
  const porAutorizar = useMemo(() => propuestas.filter((p) => p.estado === 'enviado' && esOferta(p)), [propuestas]);
  const autorizados = useMemo(() => vigentes(propuestas, (m) => a.enrich.matCosto(m)).filter((p) => p.concepto === 'oferta' && p.condicion.trim() !== ''), [propuestas, a.enrich]);
  // Buscador + filtros por cualquier columna (y embudo en cada encabezado) de «Por autorizar» y «Autorizados».
  const fAut = useFiltroPropuestas(porAutorizar, a, costoVisible);
  const fVig = useFiltroPropuestas(autorizados, a, costoVisible);

  /** Descuento / % del margen cedido / margen de un precio contra su base y costo (CÁLCULO INVERSO). */
  const celdasAnalisis = (precio: number, base: number | null, costo: number) => {
    const an = base ? analisisPrecio(precio, base, costo) : null;
    return an;
  };

  return (
    <ReportPage>
      <PageHeader title="Precios" subtitle="Punto medio del mercado (mediana facturada) y precio de oferta por condición cediendo un % del margen. Nada se publica a otros reportes hasta que se autoriza, y siempre queda por encima del costo." />
      {a.facturacionCalculando && <p className="text-sm text-text-muted" role="status">Calculando facturación… {Math.round(a.facturacionProgreso * 100)}% — Mín / Prom / Máx aparecen al terminar.</p>}
      {a.facturacionError && <p className="text-sm text-danger">No se pudo armar la facturación: {a.facturacionError}</p>}
      {!a.facturacionCalculando && !a.facturacion.rf && <p className="text-sm text-text-faint">Sin facturación cargada: la base se calcula solo con el margen objetivo. Sincroniza la facturación en Carga.</p>}
      <Tabs defaultValue="calc">
        <TabsList>
          <TabsTrigger value="calc" title="Combinaciones nuevas sin enviar y otros avisos">Calculadora{resumen.nuevos > 0 ? ` · ${resumen.nuevos} nuevas` : ''}{resumen.conAviso - resumen.nuevos > 0 ? ` · ${resumen.conAviso - resumen.nuevos} avisos` : ''}</TabsTrigger>
          <TabsTrigger value="cap" title="Buscar o pegar materiales con su precio y vigencia (sin autorización)">Captura manual</TabsTrigger>
          <TabsTrigger value="aut">Por autorizar ({porAutorizar.length})</TabsTrigger>
          <TabsTrigger value="vig">Autorizados ({autorizados.length})</TabsTrigger>
          <TabsTrigger value="his" title="Todos los precios autorizados, también los que ya no rigen">Histórico</TabsTrigger>
          <TabsTrigger value="par">Parámetros</TabsTrigger>
        </TabsList>

        <TabsContent value="calc">
          <Card className="p-3">
            {(resumen.nuevos > 0 || resumen.loteNuevo > 0 || resumen.calculoDistinto > 0 || resumen.invalidos > 0) && (
              <div role="status" className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
                <span className="font-semibold">Hay cambios que no se han considerado para autorización:</span>
                {resumen.nuevos > 0 && <span><b>{resumen.nuevos}</b> combinación(es) material + condición <b>nuevas</b> sin enviar</span>}
                {resumen.loteNuevo > 0 && <span><b>{resumen.loteNuevo}</b> con <b>lotes nuevos</b></span>}
                {resumen.calculoDistinto > 0 && <span><b>{resumen.calculoDistinto}</b> con el <b>cálculo distinto</b> al que se mandó</span>}
                {resumen.invalidos > 0 && <span><b>{resumen.invalidos}</b> autorizado(s) que ya no supera(n) el costo</span>}
                <span className="ml-auto flex gap-2">
                  {resumen.nuevos > 0 && <button type="button" className="text-accent hover:underline" onClick={() => setFiltroEstatus('sin-enviar')}>Ver nuevas</button>}
                  <button type="button" className="text-accent hover:underline" onClick={() => setFiltroEstatus('aviso')}>Ver con aviso</button>
                  {filtroEstatus !== 'todos' && <button type="button" className="text-text-faint hover:underline" onClick={() => setFiltroEstatus('todos')}>Quitar filtro</button>}
                </span>
              </div>
            )}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Input className="w-64" placeholder="Buscar material / sector / grupo…" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
              <Select aria-label="Filtrar por estatus" value={filtroEstatus} onChange={(e) => setFiltroEstatus(e.target.value as typeof filtroEstatus)}>
                <option value="todos">Estatus: todos</option>
                <option value="sin-enviar">Sin enviar ({resumen.sinEnviar})</option>
                <option value="pendiente">Pendiente ({resumen.pendientes})</option>
                <option value="autorizado">Autorizado ({resumen.autorizados})</option>
                <option value="rechazado">Rechazado ({resumen.rechazados})</option>
                <option value="reenviar">Reenviar ({resumen.reenviar})</option>
                <option value="aviso">Con aviso ({resumen.conAviso})</option>
              </Select>
              <Button size="sm" variant="outline" disabled={!resumen.sinEnviar} onClick={seleccionarNuevos} title="Marca todas las combinaciones que nunca se han mandado a autorizar">Seleccionar nuevos ({resumen.sinEnviar})</Button>
              <Button size="sm" disabled={ocupado || !sel.size} onClick={enviar}><Send className="size-4" /> Enviar a autorizar ({sel.size})</Button>
              <Button size="sm" variant="outline" onClick={() => exportXlsx(`precios-${stamp()}.xlsx`, visibles.map((f) => {
                const d = detalleFila(f);
                return {
                  Material: f.material, Descripción: f.texto, Sector: f.sector, Grupo: f.grupo, ...(costoVisible ? { Costo: f.costo } : {}),
                  Mín: f.base.min, Prom: f.base.promedio, P50: f.base.p50, Máx: f.base.max, Base: f.base.base, 'Origen de la base': f.base.origenBase ? ORIGEN_TXT[f.base.origenBase] : '',
                  Condición: etiquetaCombinacion(combinacionDe(f.banderas)), Inventario: f.inventario,
                  'Precio sugerido': d.precio, Estatus: ESTATUS_TXT[estatusDe.get(d.k)?.estatus ?? 'sin-enviar'].txt, Avisos: (estatusDe.get(d.k)?.avisos ?? []).map((x) => AVISO_TXT[x]).join(', '), 'Precio autorizado': estatusDe.get(d.k)?.autorizado ?? '-', 'Descuento %': d.an ? d.an.descuento * 100 : '', 'Cede del margen %': d.an ? d.an.cede * 100 : '', 'Margen %': d.an ? d.an.margen * 100 : '',
                };
              }), 'Precios')}><Download className="size-4" /> Exportar</Button>
            </div>
            {!visibles.length ? <EmptyState title="Sin materiales con condición" description="Se necesitan el catálogo, la facturación y los libros de Inv_Condicion cargados, y al menos un Status incluido en Parámetros." /> : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="w-8"><input type="checkbox" aria-label="Seleccionar todos los visibles" title="Seleccionar todos los visibles que se pueden mandar a autorizar" checked={todasMarcadas} disabled={!clavesSeleccionables.length} onChange={alternarTodas} /></TableHead>
                  <TableHead>Material</TableHead><TableHead>Sector / Grupo</TableHead>
                  {costoVisible && <TableHead className="text-right">Costo</TableHead>}
                  <TableHead className="text-right">Mín</TableHead><TableHead className="text-right">Prom</TableHead><TableHead className="text-right">P50</TableHead><TableHead className="text-right">Máx</TableHead>
                  <TableHead className="text-right">Base</TableHead><TableHead>Origen de la base</TableHead><TableHead>Condición</TableHead><TableHead className="text-right">Inventario</TableHead>
                  <TableHead className="text-right">Margen mín.</TableHead><TableHead className="text-right">Precio sugerido</TableHead><TableHead>Estatus</TableHead><TableHead className="text-right" title="Solo hay precio cuando el director lo autorizó; mientras tanto: -">Precio autorizado</TableHead>
                  <TableHead className="text-right">Descuento</TableHead><TableHead className="text-right">Cede del margen</TableHead><TableHead className="text-right">Margen</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {visibles.slice(0, 500).map((f) => {
                    const { k, oferta, precio, an } = detalleFila(f);
                    const est = estatusDe.get(k);
                    const mal = !precioValido(precio, f.costo);
                    const bajoMinimo = !mal && oferta != null && precio < oferta.piso - 0.005;
                    return (
                      <TableRow key={k}>
                        <TableCell><input type="checkbox" aria-label="Seleccionar" checked={sel.has(k)} disabled={!seleccionable(f)}
                          onChange={(e) => setSel((s) => { const n = new Set(s); if (e.target.checked) n.add(k); else n.delete(k); return n; })} /></TableCell>
                        <TableCell><div className="font-mono text-xs">{f.material}</div><div className="max-w-64 truncate text-[11px] text-text-faint">{f.texto}</div></TableCell>
                        <TableCell className="text-xs"><div>{f.sector}</div><div className="text-text-faint">{f.grupo}</div></TableCell>
                        {costoVisible && <TableCell className="text-right tabular-nums">{formatCurrency(f.costo)}</TableCell>}
                        <TableCell className="text-right tabular-nums">{f.base.min ? formatCurrency(f.base.min) : '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">{f.base.promedio ? formatCurrency(f.base.promedio) : '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">{f.base.p50 ? formatCurrency(f.base.p50) : '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">{f.base.max ? formatCurrency(f.base.max) : '—'}</TableCell>
                        <TableCell className="text-right tabular-nums" title={origenTitulo(f)}>{f.base.base ? formatCurrency(f.base.base) : '—'}</TableCell>
                        <TableCell className="text-xs" title={origenTitulo(f)}>{f.base.origenBase ? ORIGEN_TXT[f.base.origenBase] : '—'}</TableCell>
                        <TableCell className="text-xs">{etiquetaCombinacion(combinacionDe(f.banderas)) || '—'}{oferta?.recortado && <span title="El margen mínimo recortó el precio (nunca bajo costo)"> ⚑</span>}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(f.inventario)}</TableCell>
                        <TableCell className="text-right">
                          {oferta ? (
                            <PctInput ariaLabel={`Margen mínimo ${f.material}`} vacio valor={margenManual[k] ?? null} placeholder={String(Math.round(oferta.margenMin * 10000) / 100)}
                              onChange={(v) => setMargenManual((s) => ({ ...s, [k]: v }))}
                              className="h-8 w-14 rounded border border-border bg-bg-elevated px-1 text-right tabular-nums placeholder:text-text-faint" />
                          ) : '—'}
                          {oferta && <div className="text-[11px] text-text-faint">{ORIGEN_MARGEN_TXT[oferta.origenMargenMin]}</div>}
                        </TableCell>
                        <TableCell className="text-right">
                          {oferta ? (
                            <input aria-label="Precio propuesto" inputMode="decimal" title={mal ? 'Debe ser mayor al costo' : bajoMinimo ? 'Por debajo del margen mínimo elegido' : undefined}
                              className={`${inputCls} ${mal ? 'border-danger text-danger' : bajoMinimo ? 'border-warning' : 'border-border'}`}
                              value={edit[k] ?? oferta.precio.toFixed(2)} onChange={(e) => setEdit((s) => ({ ...s, [k]: e.target.value }))} />
                          ) : <span className="text-text-faint">{f.base.flags.includes('sin-costo') ? 'sin costo' : '—'}</span>}
                        </TableCell>
                        <TableCell className="text-xs">
                          {est && <span title={ESTATUS_TXT[est.estatus].ayuda}><StatePill label={ESTATUS_TXT[est.estatus].txt} cls={ESTATUS_TXT[est.estatus].cls} /></span>}
                          {est?.avisos.filter((x) => x !== 'nuevo').map((x) => (
                            <div key={x} className="mt-0.5 text-[11px] font-medium text-warning"
                              title={x === 'lote-nuevo' ? `Lotes que no estaban cuando se mandó: ${est.lotesNuevos.join(', ')}` : x === 'calculo-distinto' ? 'El precio calculado hoy no es el que se calculó al mandarlo (cambió el costo, la caducidad, la base o los parámetros)' : 'El precio autorizado ya no supera el costo'}>
                              {AVISO_TXT[x]}{x === 'lote-nuevo' ? ` (${est.lotesNuevos.length})` : ''}
                            </div>
                          ))}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{est?.autorizado != null ? formatCurrency(est.autorizado) : <span className="text-text-faint" title="Sin precio autorizado">-</span>}</TableCell>
                        <TableCell className="text-right tabular-nums">{an && !mal ? formatFraccion(an.descuento) : '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">{an && !mal ? formatFraccion(an.cede) : '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">{an && !mal ? formatFraccion(an.margen) : '—'}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
            {visibles.length > 500 && <p className="mt-2 text-xs text-text-faint">Mostrando 500 de {visibles.length}; filtra para ver el resto.</p>}
          </Card>
        </TabsContent>

        <TabsContent value="aut">
          <Card className="p-3">
            <AutorizacionExcel a={a} pendientes={porAutorizar} isAdmin={isAdmin} email={email} costoVisible={costoVisible} onAplicado={recargar} />
            {!porAutorizar.length ? <EmptyState title="Nada por autorizar" description="Los precios enviados desde la Calculadora aparecen aquí." /> : (
              <>
                {isAdmin && <p className="mb-2 text-xs text-text-faint">Puedes ajustar el precio antes de autorizar (p. ej. calculó 20 y autorizas 25): el descuento, el % del margen cedido y el margen se recalculan al instante.</p>}
                {fAut.barra}
                {!fAut.visibles.length ? <p className="py-6 text-center text-sm text-text-muted">Ningún renglón coincide con la búsqueda o los filtros.</p> : (
                <Table wrapperClassName="max-h-[70vh] rounded-lg border border-border">
                  <TableHeader className="sticky top-0 z-20 bg-bg-elevated shadow-[0_1px_0_var(--border)]">
                    <TableRow>
                      {fAut.th('material', 'Material')}{fAut.th('sector', 'Sector / Grupo')}{fAut.th('condicion', 'Condición')}
                      {costoVisible && fAut.th('costo', 'Costo', true)}{fAut.th('base', 'Base', true)}{fAut.th('calculado', 'Calculado', true)}
                      {fAut.th('precio', 'Precio', true)}{fAut.th('descuento', 'Descuento', true)}{fAut.th('cede', 'Cede del margen', true)}{fAut.th('margen', 'Margen', true)}
                      {fAut.th('solicito', 'Solicitó')}<TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fAut.visibles.map((p) => {
                      const t = ajuste[p.id];
                      const precio = t != null && t !== '' ? Number(t) : p.precioPropuesto;
                      const mal = !precioValido(precio, p.costoAlEnviar);
                      const an = celdasAnalisis(precio, p.baseAlEnviar, p.costoAlEnviar);
                      return (
                        <TableRow key={p.id}>
                          <TableCell><div className="font-mono text-xs">{p.material}</div><div className="max-w-64 truncate text-[11px] text-text-faint">{a.enrich.matTexto(p.material)}</div></TableCell>
                          <TableCell className="text-xs"><div>{a.enrich.matSector(p.material)}</div><div className="text-text-faint">{a.enrich.matGrupo(p.material)}</div></TableCell>
                          <TableCell>{etiquetaCombinacion(p.condicion)}</TableCell>
                          {costoVisible && <TableCell className="text-right tabular-nums">{formatCurrency(p.costoAlEnviar)}</TableCell>}
                          <TableCell className="text-right tabular-nums">{p.baseAlEnviar ? formatCurrency(p.baseAlEnviar) : '—'}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatCurrency(p.precioCalculado)}</TableCell>
                          <TableCell className="text-right">
                            {isAdmin ? (
                              <input aria-label={`Precio a autorizar ${p.material}`} inputMode="decimal" title={mal ? 'Debe ser mayor al costo' : undefined}
                                className={`${inputCls} ${mal ? 'border-danger text-danger' : 'border-border'}`} value={t ?? p.precioPropuesto.toFixed(2)}
                                onChange={(e) => setAjuste((s) => ({ ...s, [p.id]: e.target.value }))} />
                            ) : <span className="tabular-nums">{formatCurrency(p.precioPropuesto)}</span>}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{an && !mal ? formatFraccion(an.descuento) : '—'}</TableCell>
                          <TableCell className="text-right tabular-nums">{an && !mal ? formatFraccion(an.cede) : '—'}</TableCell>
                          <TableCell className="text-right tabular-nums">{!mal ? formatFraccion((precio - p.costoAlEnviar) / precio) : '—'}</TableCell>
                          <TableCell className="text-xs">{p.solicitadoPor}</TableCell>
                          <TableCell className="text-right">
                            {isAdmin ? (
                              <>
                                <Button size="sm" variant="outline" disabled={ocupado || mal} onClick={() => resolver(p, 'autorizado')}><Check className="size-4" /> Autorizar</Button>{' '}
                                <Button size="sm" variant="outline" disabled={ocupado} onClick={() => resolver(p, 'rechazado')}><X className="size-4" /> Rechazar</Button>
                              </>
                            ) : <span className="text-xs text-text-faint">Pendiente de un administrador</span>}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                )}
              </>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="vig">
          <Card className="p-3">
            {!autorizados.length ? <EmptyState title="Sin precios autorizados" description="Al autorizarse, el precio de oferta sustituye al de los demás reportes." /> : (
              <>
              {fVig.barra}
              {!fVig.visibles.length ? <p className="py-6 text-center text-sm text-text-muted">Ningún renglón coincide con la búsqueda o los filtros.</p> : (
              <Table wrapperClassName="max-h-[70vh] rounded-lg border border-border">
                <TableHeader className="sticky top-0 z-20 bg-bg-elevated shadow-[0_1px_0_var(--border)]">
                  <TableRow>
                    {fVig.th('material', 'Material')}{fVig.th('sector', 'Sector / Grupo')}{fVig.th('condicion', 'Condición')}
                    {costoVisible && fVig.th('costo', 'Costo', true)}{fVig.th('base', 'Base', true)}{fVig.th('precio', 'Precio', true)}
                    {fVig.th('descuento', 'Descuento', true)}{fVig.th('cede', 'Cede del margen', true)}{fVig.th('margen', 'Margen', true)}{fVig.th('autorizo', 'Autorizó')}<TableHead title="Un precio temporal deja de regir al pasar su fecha final y vuelve el autorizado anterior">Vigencia</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fVig.visibles.map((p) => {
                    const an = celdasAnalisis(p.precioPropuesto, p.baseAlEnviar, p.costoAlEnviar);
                    return (
                      <TableRow key={p.id}>
                        <TableCell><div className="font-mono text-xs">{p.material}</div><div className="max-w-64 truncate text-[11px] text-text-faint">{a.enrich.matTexto(p.material)}</div></TableCell>
                        <TableCell className="text-xs"><div>{a.enrich.matSector(p.material)}</div><div className="text-text-faint">{a.enrich.matGrupo(p.material)}</div></TableCell>
                        <TableCell>{etiquetaCombinacion(p.condicion)}</TableCell>
                        {costoVisible && <TableCell className="text-right tabular-nums">{formatCurrency(p.costoAlEnviar)}</TableCell>}
                        <TableCell className="text-right tabular-nums">{p.baseAlEnviar ? formatCurrency(p.baseAlEnviar) : '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {modificado(p) ? <span title="El autorizador cambió el precio que se le mandó"><span className="text-text-faint line-through">{formatCurrency(p.precioEnviado ?? 0)}</span> → </span> : null}
                          {formatCurrency(p.precioPropuesto)}
                          {modificado(p) && <div className="text-[11px] text-warning">modificado</div>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{an ? formatFraccion(an.descuento) : '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">{an ? formatFraccion(an.cede) : '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatFraccion((p.precioPropuesto - p.costoAlEnviar) / p.precioPropuesto)}</TableCell>
                        <TableCell className="text-xs">{p.autorizadoPor}{p.archivoAutorizacion && <div className="max-w-40 truncate text-[11px] text-text-faint" title={p.archivoAutorizacion}>{p.archivoAutorizacion}</div>}</TableCell>
                        <TableCell><VigenciaCelda p={p} editable={isAdmin} onGuardado={() => void recargar()} /></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              )}
              </>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="cap">
          <CapturaPrecios materiales={materiales} estados={estadosRev.map(([st]) => st)} email={email} costoVisible={costoVisible} onEnviado={recargar} />
        </TabsContent>

        <TabsContent value="his">
          <div className="space-y-3">
            <Input type="search" aria-label="Buscar en el histórico" placeholder="Buscar material o condición…" value={filtro} onChange={(e) => setFiltro(e.target.value)} className="max-w-sm" />
            <HistorialPrecios propuestas={propuestas} matTexto={(m) => a.enrich.matTexto(m)} filtro={filtro} />
          </div>
        </TabsContent>

        <TabsContent value="par">
          <Card className="space-y-5 p-3">
            {!isAdmin && <p className="text-sm text-text-faint">Solo un administrador puede modificar los parámetros.</p>}

            <div>
              <h3 className="text-sm font-semibold">Precio base</h3>
              <p className="mb-2 text-xs text-text-faint">El punto medio es la mediana facturada (P50) de los últimos 12 meses; con menos de 6 facturas se usa la razón precio ÷ costo de su grupo de artículos (o del sector). Tope: LISTA 06.</p>
              <div className="flex flex-wrap items-end gap-4">
                <label className="text-sm">Margen mínimo del precio base
                  <div className="mt-1"><PctInput ariaLabel="Margen mínimo base" disabled={!isAdmin} valor={pol.global.margenMin} onChange={(v) => v != null && setPol({ ...pol, global: { ...pol.global, margenMin: v } })} /></div>
                </label>
                <label className="text-sm">Margen objetivo (solo sin ninguna referencia de mercado)
                  <div className="mt-1"><PctInput ariaLabel="Margen objetivo" disabled={!isAdmin} valor={pol.global.margenObjetivo} onChange={(v) => v != null && setPol({ ...pol, global: { ...pol.global, margenObjetivo: v } })} /></div>
                </label>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold">Margen mínimo que quiero ganar — por sector, grupo de artículos, material o condición</h3>
              <p className="mb-2 text-xs text-text-faint">Gana la regla más específica: material › grupo › sector; dentro de cada una, la que sea para la condición gana sobre «cualquiera». Sin regla se usa el de la condición. Siempre mayor a 0%, así el precio nunca llega al costo. En la Calculadora también puedes fijarlo para un caso.</p>
              {isAdmin && (
                <div className="mb-2 flex flex-wrap items-end gap-2">
                  <label className="text-xs">Ámbito
                    <Select className="mt-1" value={nuevaRegla.ambito} onChange={(e) => setNuevaRegla({ ...nuevaRegla, ambito: e.target.value as AmbitoMargen, clave: '' })}>
                      {(Object.keys(AMBITO_TXT) as AmbitoMargen[]).map((k) => <option key={k} value={k}>{AMBITO_TXT[k]}</option>)}
                    </Select>
                  </label>
                  <label className="text-xs">{AMBITO_TXT[nuevaRegla.ambito]}
                    <input list="precios-claves" className="mt-1 block h-8 w-64 rounded border border-border bg-bg-elevated px-2 text-sm" value={nuevaRegla.clave} placeholder={nuevaRegla.ambito === 'material' ? 'Código de material' : 'Escribe o elige'}
                      onChange={(e) => setNuevaRegla({ ...nuevaRegla, clave: e.target.value })} />
                    <datalist id="precios-claves">{(nuevaRegla.ambito === 'sector' ? sectores : nuevaRegla.ambito === 'grupo' ? grupos : []).map((c) => <option key={c} value={c} />)}</datalist>
                  </label>
                  <label className="text-xs">Condición
                    <Select className="mt-1" value={nuevaRegla.condicion} onChange={(e) => setNuevaRegla({ ...nuevaRegla, condicion: e.target.value })}>
                      <option value="">Cualquiera</option>
                      {condicionesOpc.map((c) => <option key={c} value={c}>{etiquetaCombinacion(c)}</option>)}
                    </Select>
                  </label>
                  <label className="text-xs">Margen mínimo
                    <div className="mt-1"><PctInput ariaLabel="Margen mínimo nueva regla" valor={nuevaRegla.margenMin} vacio onChange={(v) => setNuevaRegla({ ...nuevaRegla, margenMin: v })} /></div>
                  </label>
                  <Button size="sm" variant="outline" onClick={agregarRegla}><Plus className="size-4" /> Agregar</Button>
                </div>
              )}
              {!pol.margenesMin.length ? <p className="text-sm text-text-faint">Sin reglas: cada condición usa su propio margen mínimo.</p> : (
                <Table>
                  <TableHeader><TableRow><TableHead>Ámbito</TableHead><TableHead>Clave</TableHead><TableHead>Condición</TableHead><TableHead className="text-right">Margen mínimo</TableHead><TableHead /></TableRow></TableHeader>
                  <TableBody>
                    {pol.margenesMin.map((r, i) => (
                      <TableRow key={`${r.ambito}|${r.clave}|${r.condicion}`}>
                        <TableCell>{AMBITO_TXT[r.ambito]}</TableCell><TableCell>{r.clave}</TableCell><TableCell>{r.condicion ? etiquetaCombinacion(r.condicion) : 'Cualquiera'}</TableCell>
                        <TableCell className="text-right"><PctInput ariaLabel={`Margen mínimo ${r.clave}`} disabled={!isAdmin} valor={r.margenMin} onChange={(v) => v != null && setPol({ ...pol, margenesMin: pol.margenesMin.map((x, j) => (j === i ? { ...x, margenMin: v } : x)) })} /></TableCell>
                        <TableCell className="text-right">{isAdmin && <Button size="sm" variant="outline" aria-label="Quitar regla" onClick={() => setPol({ ...pol, margenesMin: pol.margenesMin.filter((_, j) => j !== i) })}><Trash2 className="size-4" /></Button>}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>

            <div>
              <h3 className="text-sm font-semibold">Condiciones de la pestaña Revision</h3>
              <p className="mb-2 text-xs text-text-faint">Cada Status de Revision es una condición. Marca cuáles entran y qué % del margen cede cada una; los % se apilan con Corta caducidad y PNC. Los que no marques se ignoran.</p>
              {!estadosRev.length ? <p className="text-sm text-text-faint">No hay Status: carga el libro Inv_Condicion (pestaña Revision).</p> : (
                <Table>
                  <TableHeader><TableRow><TableHead>Incluir</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Materiales</TableHead><TableHead className="text-right">Cede del margen</TableHead><TableHead className="text-right">Margen mínimo</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {estadosRev.map(([status, n]) => {
                      const c = pol.condiciones[status] ?? CONDICION_DEFECTO;
                      return (
                        <TableRow key={status}>
                          <TableCell><input type="checkbox" aria-label={`Incluir ${status}`} disabled={!isAdmin} checked={c.incluida} onChange={(e) => setCondicion(status, { incluida: e.target.checked })} /></TableCell>
                          <TableCell>{status}</TableCell>
                          <TableCell className="text-right tabular-nums">{n}</TableCell>
                          <TableCell className="text-right"><PctInput ariaLabel={`Cede ${status}`} disabled={!isAdmin || !c.incluida} valor={c.pctCede} onChange={(v) => v != null && setCondicion(status, { pctCede: v })} /></TableCell>
                          <TableCell className="text-right"><PctInput ariaLabel={`Margen mínimo ${status}`} disabled={!isAdmin || !c.incluida} valor={c.margenMin} onChange={(v) => v != null && setCondicion(status, { margenMin: v })} /></TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>

            <div>
              <h3 className="text-sm font-semibold">Combinaciones encontradas</h3>
              <p className="mb-2 text-xs text-text-faint">Todas las combinaciones de condiciones que existen hoy en el inventario (con todos los Status de Revision), con el % del margen que ceden. Cada una es una fila con su propio precio en la Calculadora.</p>
              {!combinaciones.length ? <p className="text-sm text-text-faint">No hay combinaciones: faltan lotes de Corta caducidad / PNC o el libro de Disponibilidad.</p> : (
                <Table>
                  <TableHeader><TableRow><TableHead>Combinación</TableHead><TableHead className="text-right">Materiales</TableHead><TableHead className="text-right">Inventario</TableHead><TableHead className="text-right">Cede del margen</TableHead><TableHead>Entra</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {combinaciones.map((c) => (
                      <TableRow key={c.combinacion}>
                        <TableCell>{etiquetaCombinacion(c.combinacion)}</TableCell>
                        <TableCell className="text-right tabular-nums">{c.materiales}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(c.inventario)}</TableCell>
                        <TableCell className="text-right tabular-nums">{c.dtoMin === c.dtoMax ? formatFraccion(c.dtoMin) : `${formatFraccion(c.dtoMin)} – ${formatFraccion(c.dtoMax)}`}</TableCell>
                        <TableCell className="text-xs">{c.entra ? 'Sí' : 'No (Status sin incluir)'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>

            <div>
              <h3 className="text-sm font-semibold">Corta caducidad y PNC</h3>
              <Table>
                <TableHeader><TableRow><TableHead>Sector</TableHead><TableHead>Condición</TableHead><TableHead>Vigencia</TableHead><TableHead className="text-right">Cede del margen</TableHead><TableHead className="text-right">Margen mínimo</TableHead></TableRow></TableHeader>
                <TableBody>
                  {pol.markdown.map((r, i) => (
                    <TableRow key={`${r.sector}|${r.combinacion}|${r.tramoCc}`}>
                      <TableCell>{r.sector === SECTOR_GLOBAL ? 'Todos' : r.sector}</TableCell>
                      <TableCell>{etiquetaCombinacion(r.combinacion)}</TableCell>
                      <TableCell>{r.tramoCc ? `${r.tramoCc} meses` : '—'}</TableCell>
                      <TableCell className="text-right"><PctInput ariaLabel={`Cede ${r.combinacion} ${r.tramoCc}`} disabled={!isAdmin} valor={r.pctCede} onChange={(v) => v != null && setPol({ ...pol, markdown: pol.markdown.map((x, j) => (j === i ? { ...x, pctCede: v } : x)) })} /></TableCell>
                      <TableCell className="text-right"><PctInput ariaLabel={`Margen mínimo ${r.combinacion} ${r.tramoCc}`} disabled={!isAdmin} valor={r.margenMin} onChange={(v) => v != null && setPol({ ...pol, markdown: pol.markdown.map((x, j) => (j === i ? { ...x, margenMin: v } : x)) })} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {isAdmin && (
              <Button size="sm" disabled={ocupado} onClick={async () => {
                try { await guardarPolitica(pol, email); toast.success('Parámetros guardados'); } catch (e) { toast.error('No se pudo guardar', e instanceof Error ? e.message : String(e)); }
              }}><Save className="size-4" /> Guardar parámetros</Button>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </ReportPage>
  );
}
