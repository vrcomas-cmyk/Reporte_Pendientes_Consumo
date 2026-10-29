import { supabase } from '@/lib/supabaseClient';
import { logWarn } from '@/lib/logError';
import { prepararEnvio } from '@/core/estatusPrecios';
import { POLITICA_DEFECTO, SECTOR_GLOBAL, precioValido, type AmbitoMargen, type Politica, type ReglaMarkdown, type TramoCc } from '@/core/politicaPrecios';

export type ConceptoPrecio = 'base' | 'oferta';
export type EstadoPropuesta = 'borrador' | 'enviado' | 'autorizado' | 'rechazado';

export interface Propuesta {
  id: string;
  material: string;
  concepto: ConceptoPrecio;
  /** Combinación de condiciones ('CC', 'CC + Lento mov', …) para `oferta`; '' para la base. */
  condicion: string;
  lote: string;
  costoAlEnviar: number;
  /** Precio base con el que se calculó (null en propuestas anteriores a v2). */
  baseAlEnviar: number | null;
  precioCalculado: number;
  precioPropuesto: number;
  estado: EstadoPropuesta;
  solicitadoPor: string;
  solicitadoEn: string;
  autorizadoPor: string | null;
  autorizadoEn: string | null;
  comentario: string | null;
  /** Precio con el que se mandó a autorizar (null en propuestas anteriores). Si difiere de `precioPropuesto`, el autorizador lo modificó. */
  precioEnviado: number | null;
  /** Archivo del director con el que se resolvió (null = dentro de la app). */
  archivoAutorizacion: string | null;
  /** Lotes (centro|almacén|lote) del renglón cuando se mandó; null = no se guardaron (propuestas anteriores). */
  lotesEnviados: string[] | null;
  /** Vigencia (aaaa-mm-dd). null = sin límite. Pasada `vigenteHasta` vuelve a regir el autorizado anterior de la misma combinación. */
  vigenteDesde: string | null;
  vigenteHasta: string | null;
}

export interface NuevaPropuesta {
  material: string;
  concepto: ConceptoPrecio;
  condicion: string;
  costo: number;
  base: number;
  precioCalculado: number;
  precioPropuesto: number;
  /** Lotes del renglón al mandarlo (para avisar de lotes nuevos). */
  lotes?: string[];
}

interface PropuestaDb {
  id: string; material: string; concepto: ConceptoPrecio; condicion: string; lote: string; costo_al_enviar: number | null; base_al_enviar: number | null;
  precio_calculado: number; precio_propuesto: number; estado: EstadoPropuesta; solicitado_por: string | null; solicitado_en: string;
  autorizado_por: string | null; autorizado_en: string | null; comentario: string | null; precio_enviado: number | null; archivo_autorizacion: string | null; lotes_enviados: string[] | null; vigente_desde?: string | null; vigente_hasta?: string | null;
}

const COLUMNAS_SIN_COSTO = 'id, material, concepto, condicion, lote, precio_calculado, precio_propuesto, estado, solicitado_por, solicitado_en, autorizado_por, autorizado_en, comentario, base_al_enviar, precio_enviado, archivo_autorizacion, lotes_enviados, vigente_desde, vigente_hasta';

const deDb = (r: PropuestaDb): Propuesta => ({
  id: r.id, material: r.material, concepto: r.concepto, condicion: r.condicion ?? '', lote: r.lote ?? '', costoAlEnviar: Number(r.costo_al_enviar ?? 0),
  baseAlEnviar: r.base_al_enviar == null ? null : Number(r.base_al_enviar),
  precioCalculado: Number(r.precio_calculado), precioPropuesto: Number(r.precio_propuesto), estado: r.estado, solicitadoPor: r.solicitado_por ?? '',
  solicitadoEn: r.solicitado_en, autorizadoPor: r.autorizado_por, autorizadoEn: r.autorizado_en, comentario: r.comentario,
  precioEnviado: r.precio_enviado == null ? null : Number(r.precio_enviado), archivoAutorizacion: r.archivo_autorizacion ?? null,
  lotesEnviados: Array.isArray(r.lotes_enviados) ? r.lotes_enviados : null,
  vigenteDesde: r.vigente_desde ?? null, vigenteHasta: r.vigente_hasta ?? null,
});

/** Política guardada (global + por sector + matriz + condiciones + márgenes mínimos). Sin tablas / sin filas → `POLITICA_DEFECTO`; nunca lanza. */
export async function cargarPolitica(): Promise<Politica> {
  try {
    const [pol, md, cond, mm] = await Promise.all([
      supabase.from('degasa_precio_politica').select('sector, margen_min, margen_objetivo'),
      supabase.from('degasa_precio_markdown').select('sector, combinacion, tramo_cc, pct_cede, margen_min'),
      supabase.from('degasa_precio_condicion').select('status, incluida, pct_cede, margen_min'),
      supabase.from('degasa_precio_margen_min').select('ambito, clave, condicion, margen_min'),
    ]);
    if (pol.error || md.error) throw pol.error ?? md.error;
    const out: Politica = { global: POLITICA_DEFECTO.global, porSector: {}, markdown: POLITICA_DEFECTO.markdown, condiciones: {}, margenesMin: [] };
    // Sin las migraciones 0018 / 0019 esas tablas no existen: quedan vacías (ningún Status incluido, sin márgenes por ámbito) sin romper el resto.
    for (const r of cond.data ?? []) out.condiciones[r.status] = { incluida: !!r.incluida, pctCede: Number(r.pct_cede), margenMin: Number(r.margen_min) };
    for (const r of mm.data ?? []) out.margenesMin.push({ ambito: r.ambito as AmbitoMargen, clave: r.clave, condicion: r.condicion ?? '', margenMin: Number(r.margen_min) });
    for (const r of pol.data ?? []) {
      const p = { margenMin: Number(r.margen_min), margenObjetivo: Number(r.margen_objetivo) };
      if (r.sector === SECTOR_GLOBAL) out.global = p;
      else out.porSector[r.sector] = p;
    }
    if (md.data?.length) {
      out.markdown = md.data.map((r): ReglaMarkdown => ({
        sector: r.sector, combinacion: r.combinacion, tramoCc: (r.tramo_cc ?? '') as TramoCc,
        pctCede: Number(r.pct_cede), margenMin: Number(r.margen_min),
      }));
    }
    return out;
  } catch {
    return POLITICA_DEFECTO;
  }
}

/** Guarda la política (solo admin por RLS). Valida: márgenes mínimos > 0 y % que se cede < 100 %. */
export async function guardarPolitica(pol: Politica, email: string): Promise<void> {
  for (const r of pol.markdown) {
    if (!(r.margenMin > 0 && r.margenMin < 1)) throw new Error(`La regla ${r.combinacion} necesita un margen mínimo mayor a 0%.`);
    if (!(r.pctCede >= 0 && r.pctCede < 1)) throw new Error(`El % del margen que cede ${r.combinacion} debe ser menor a 100%.`);
  }
  for (const [status, c] of Object.entries(pol.condiciones)) {
    if (!(c.margenMin > 0 && c.margenMin < 1)) throw new Error(`La condición "${status}" necesita un margen mínimo mayor a 0%.`);
    if (!(c.pctCede >= 0 && c.pctCede < 1)) throw new Error(`El % del margen que cede "${status}" debe ser menor a 100%.`);
  }
  for (const r of pol.margenesMin) {
    if (!r.clave.trim() || !(r.margenMin > 0 && r.margenMin < 1)) throw new Error(`Margen mínimo inválido en ${r.ambito} "${r.clave}": debe ser mayor a 0% y menor a 100%.`);
  }
  const filasPol = [
    { sector: SECTOR_GLOBAL, margen_min: pol.global.margenMin, margen_objetivo: pol.global.margenObjetivo, updated_by: email },
    ...Object.entries(pol.porSector).map(([sector, p]) => ({ sector, margen_min: p.margenMin, margen_objetivo: p.margenObjetivo, updated_by: email })),
  ];
  const a = await supabase.from('degasa_precio_politica').upsert(filasPol);
  if (a.error) throw a.error;

  const condRows = Object.entries(pol.condiciones).map(([status, c]) => ({ status, incluida: c.incluida, pct_cede: c.pctCede, margen_min: c.margenMin, updated_by: email }));
  if (condRows.length) {
    const c = await supabase.from('degasa_precio_condicion').upsert(condRows);
    if (c.error) throw c.error;
  }
  const b = await supabase.from('degasa_precio_markdown').upsert(
    pol.markdown.map((r) => ({
      sector: r.sector, combinacion: r.combinacion, tramo_cc: r.tramoCc, pct_cede: r.pctCede, margen_min: r.margenMin, updated_by: email,
    })),
  );
  if (b.error) throw b.error;

  // Márgenes mínimos por material / grupo / sector: se guardan los vigentes y se borran los que el usuario quitó.
  const llave = (r: { ambito: string; clave: string; condicion: string }) => `${r.ambito}|${r.clave}|${r.condicion}`;
  const vigentesK = new Set(pol.margenesMin.map(llave));
  const existentes = await supabase.from('degasa_precio_margen_min').select('ambito, clave, condicion');
  if (existentes.error) throw existentes.error;
  for (const r of existentes.data ?? []) {
    const condicion = r.condicion ?? '';
    if (vigentesK.has(llave({ ambito: r.ambito, clave: r.clave, condicion }))) continue;
    const d = await supabase.from('degasa_precio_margen_min').delete().eq('ambito', r.ambito).eq('clave', r.clave).eq('condicion', condicion);
    if (d.error) throw d.error;
  }
  if (pol.margenesMin.length) {
    const m = await supabase.from('degasa_precio_margen_min').upsert(
      pol.margenesMin.map((r) => ({ ambito: r.ambito, clave: r.clave, condicion: r.condicion, margen_min: r.margenMin, updated_by: email })),
    );
    if (m.error) throw m.error;
  }
}

/** ¿El error de Supabase es por una columna que no existe (migración sin aplicar o esquema sin recargar)? */
export const esColumnaFaltante = (e: { message?: string; code?: string } | null | undefined): boolean =>
  !!e && (e.code === 'PGRST204' || e.code === '42703' || /schema cache|could not find the .* column|column .* does not exist/i.test(e.message ?? ''));

const AYUDA_MIGRACION = "Ejecuta la migración en el SQL editor de Supabase y, si ya la corriste, recarga el esquema con: notify pgrst, 'reload schema';";

/** Todas las propuestas (más recientes primero). Sin tablas → []. */
export async function listarPropuestas(): Promise<Propuesta[]> {
  try {
    // El costo solo lo devuelve la función a quien tiene permiso de verlo (migración 0028); sin la migración se cae a la lectura directa de antes.
    const rpc = await supabase.rpc('degasa_precio_propuestas').limit(5000);
    if (!rpc.error) return ((rpc.data ?? []) as PropuestaDb[]).map(deDb);
    void logWarn('precios-propuestas-rpc', `degasa_precio_propuestas falló (${rpc.error.message}); se leen las propuestas sin la columna de costo.`);
    // Respaldo SIN costo_al_enviar: con la migración 0028 esa columna ya no se puede leer directo (un `select *` responde 403).
    const { data, error } = await supabase.from('degasa_precio_propuesta').select(COLUMNAS_SIN_COSTO).order('solicitado_en', { ascending: false }).limit(5000);
    if (error) throw error;
    return ((data ?? []) as PropuestaDb[]).map(deDb);
  } catch {
    return [];
  }
}

export interface ResultadoEnvio { enviadas: number; omitidas: { sinCondicion: number; repetidas: number; yaPendientes: number } }

/**
 * Crea propuestas en estado `enviado` (primera autorización obligatoria). Rechaza precios ≤ costo antes de tocar la red y NUNCA manda algo sin
 * condición (la «base» no se autoriza) ni una solicitud repetida o que ya esté pendiente de respuesta (consulta lo pendiente en la base).
 */
export async function enviarPropuestas(items: NuevaPropuesta[], email: string): Promise<ResultadoEnvio> {
  const malas = items.filter((i) => !precioValido(i.precioPropuesto, i.costo));
  if (malas.length) throw new Error(`${malas.length} precio(s) no superan el costo (p. ej. ${malas[0].material}).`);
  // Lo pendiente hoy en la base (no solo lo que esta pantalla tiene cargado): evita duplicar aunque otro usuario ya lo haya mandado.
  const pend = await supabase.from('degasa_precio_propuesta').select('material, concepto, condicion').eq('estado', 'enviado');
  if (pend.error) throw pend.error;
  const { enviar, omitidos } = prepararEnvio(items, (pend.data ?? []) as { material: string; concepto: 'base' | 'oferta'; condicion: string }[]);
  const omitidas = {
    sinCondicion: omitidos.filter((o) => o.motivo === 'sin-condicion').length,
    repetidas: omitidos.filter((o) => o.motivo === 'repetido-en-el-envio').length,
    yaPendientes: omitidos.filter((o) => o.motivo === 'ya-pendiente').length,
  };
  if (!enviar.length) return { enviadas: 0, omitidas };
  const { error } = await supabase.from('degasa_precio_propuesta').insert(
    enviar.map((i) => ({
      material: i.material, concepto: i.concepto, condicion: i.condicion, lote: '', costo_al_enviar: i.costo, base_al_enviar: i.base,
      precio_calculado: i.precioCalculado, precio_propuesto: i.precioPropuesto, estado: 'enviado', solicitado_por: email,
      ...(i.lotes ? { lotes_enviados: i.lotes } : {}),
    })),
  );
  if (esColumnaFaltante(error)) throw new Error(`Falta aplicar la migración 0021_precios_lotes_enviados.sql (${error?.message}). ${AYUDA_MIGRACION}`);
  // 23505 = índice único (migración 0022): otra persona la mandó justo ahora.
  if (error?.code === '23505') throw new Error('Alguna de esas solicitudes ya está pendiente de autorización (la mandó otra persona hace un momento). Actualiza y vuelve a intentar.');
  if (error) throw error;
  return { enviadas: enviar.length, omitidas };
}

/**
 * Autoriza o rechaza (solo admin por RLS). `precios`: precio ajustado por el administrador por id (p. ej. el calculado fue 20 y autorizaron 25);
 * debe seguir por encima del costo con el que se envió.
 */
export async function resolverPropuestas(
  propuestas: readonly Propuesta[],
  estado: 'autorizado' | 'rechazado',
  email: string,
  opciones: { comentario?: string; precios?: Readonly<Record<string, number>> } = {},
): Promise<void> {
  for (const p of propuestas) {
    const precio = opciones.precios?.[p.id];
    if (estado === 'autorizado' && precio != null && !precioValido(precio, p.costoAlEnviar)) {
      throw new Error(`El precio de ${p.material} (${precio}) debe ser mayor al costo (${p.costoAlEnviar}).`);
    }
    const { error } = await supabase.from('degasa_precio_propuesta')
      .update({
        estado, autorizado_por: email, autorizado_en: new Date().toISOString(), comentario: opciones.comentario ?? null, precio_enviado: p.precioPropuesto,
        ...(estado === 'autorizado' && precio != null ? { precio_propuesto: precio } : {}),
      })
      .eq('id', p.id)
      .eq('estado', 'enviado');
    if (error) throw error;
  }
}

/** Qué se hace con una propuesta al cargar el archivo del director. */
export interface DecisionArchivo {
  propuesta: Propuesta;
  /** `autorizado` (con `precio`) o `rechazado` (no autorizado por el director). */
  estado: 'autorizado' | 'rechazado';
  precio?: number;
  comentario?: string;
}

export interface ResultadoAplicacion { aplicadas: number; fallidas: { material: string; motivo: string }[] }

/**
 * Aplica las decisiones del archivo del director (solo admin por RLS). Los autorizados llevan el precio del director (siempre > costo) y conservan en
 * `precio_enviado` el que se mandó; los no autorizados quedan «rechazado». Solo toca propuestas que siguen en `enviado`. Va en tandas de 20.
 */
export async function aplicarAutorizacion(decisiones: readonly DecisionArchivo[], email: string, archivo: string): Promise<ResultadoAplicacion> {
  // Antes de tocar nada: si faltan las columnas de la migración 0020 se avisa UNA vez (y no se intenta aplicar renglón por renglón).
  const prueba = await supabase.from('degasa_precio_propuesta').select('precio_enviado, archivo_autorizacion').limit(1);
  if (esColumnaFaltante(prueba.error)) throw new Error(`Falta aplicar la migración 0020_precios_autorizacion_excel.sql (${prueba.error?.message}). ${AYUDA_MIGRACION}`);
  const fallidas: ResultadoAplicacion['fallidas'] = [];
  let aplicadas = 0;
  const ahora = new Date().toISOString();
  const listas = decisiones.filter((d) => {
    if (d.estado === 'autorizado' && !precioValido(d.precio ?? 0, d.propuesta.costoAlEnviar)) {
      fallidas.push({ material: d.propuesta.material, motivo: 'El precio autorizado debe ser mayor al costo.' });
      return false;
    }
    return true;
  });
  for (let i = 0; i < listas.length; i += 20) {
    await Promise.all(listas.slice(i, i + 20).map(async (d) => {
      const { error, data } = await supabase.from('degasa_precio_propuesta')
        .update({
          estado: d.estado, autorizado_por: email, autorizado_en: ahora, comentario: d.comentario?.trim() || null,
          precio_enviado: d.propuesta.precioPropuesto, archivo_autorizacion: archivo,
          ...(d.estado === 'autorizado' ? { precio_propuesto: d.precio } : {}),
        })
        .eq('id', d.propuesta.id)
        .eq('estado', 'enviado')
        .select('id');
      if (error) fallidas.push({ material: d.propuesta.material, motivo: error.message });
      else if (!data?.length) fallidas.push({ material: d.propuesta.material, motivo: 'Ya no estaba pendiente.' });
      else aplicadas += 1;
    }));
  }
  return { aplicadas, fallidas };
}

/** aaaa-mm-dd de una fecha en hora local. */
export const diaIso = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export type EstadoVigencia = 'vigente' | 'programado' | 'vencido';

/** ¿Está dentro de su ventana de fechas? (`vigenteHasta` incluye ese día). */
export function estadoVigencia(p: Pick<Propuesta, 'vigenteDesde' | 'vigenteHasta'>, hoy: string = diaIso(new Date())): EstadoVigencia {
  if (p.vigenteDesde && p.vigenteDesde > hoy) return 'programado';
  if (p.vigenteHasta && p.vigenteHasta < hoy) return 'vencido';
  return 'vigente';
}

/** Fija (o quita, con null) la vigencia de propuestas ya autorizadas (solo admin por RLS). */
export async function fijarVigencia(ids: readonly string[], desde: string | null, hasta: string | null): Promise<void> {
  if (desde && hasta && hasta < desde) throw new Error('La fecha final no puede ser anterior a la inicial.');
  const { error } = await supabase.from('degasa_precio_propuesta').update({ vigente_desde: desde, vigente_hasta: hasta }).in('id', [...ids]).eq('estado', 'autorizado');
  if (esColumnaFaltante(error)) throw new Error(`Falta aplicar la migración 0025_precios_vigencia.sql (${error?.message}). ${AYUDA_MIGRACION}`);
  if (error) throw error;
}

/**
 * Última propuesta autorizada por (material, concepto, condición) DENTRO DE SU VIGENCIA; descarta las que ya no superan el costo vigente.
 * Una oferta temporal vencida (o aún no iniciada) no cuenta: rige la autorizada anterior, que sigue guardada como histórico.
 */
export function vigentes(propuestas: Propuesta[], costoDe: (material: string) => number, hoy: string = diaIso(new Date())): Propuesta[] {
  const por = new Map<string, Propuesta>();
  for (const p of propuestas) {
    if (p.estado !== 'autorizado' || estadoVigencia(p, hoy) !== 'vigente') continue;
    const k = `${p.material}|${p.concepto}|${p.condicion}|${p.lote}`;
    const cur = por.get(k);
    if (!cur || (p.autorizadoEn ?? '') > (cur.autorizadoEn ?? '')) por.set(k, p);
  }
  return [...por.values()].filter((p) => precioValido(p.precioPropuesto, costoDe(p.material)));
}

/** Histórico de precios autorizados de cada material + condición (más reciente primero), para compararlos. */
export function historicoAutorizados(propuestas: readonly Propuesta[]): Map<string, Propuesta[]> {
  const out = new Map<string, Propuesta[]>();
  for (const p of propuestas) {
    if (p.estado !== 'autorizado' || p.concepto !== 'oferta' || !p.condicion.trim()) continue;
    const k = `${p.material}|${p.condicion}`;
    out.set(k, [...(out.get(k) ?? []), p]);
  }
  for (const l of out.values()) l.sort((x, y) => (y.autorizadoEn ?? '').localeCompare(x.autorizadoEn ?? ''));
  return out;
}

/**
 * Registra precios YA autorizados con vigencia (captura manual de concursos / promociones): no pasan por «Por autorizar». Solo admin (RLS).
 * Al vencer `hasta` vuelve a regir el autorizado anterior de la misma combinación. Rechaza precios ≤ costo antes de tocar la red.
 */
export async function registrarVigentes(items: NuevaPropuesta[], email: string, desde: string, hasta: string): Promise<number> {
  if (!hasta) throw new Error('Indica hasta cuándo es válida la vigencia.');
  if (desde && hasta < desde) throw new Error('La fecha final no puede ser anterior a la inicial.');
  const malas = items.filter((i) => !precioValido(i.precioPropuesto, i.costo));
  if (malas.length) throw new Error(`${malas.length} precio(s) no superan el costo (p. ej. ${malas[0].material}).`);
  if (!items.length) return 0;
  const ahora = new Date().toISOString();
  const { error } = await supabase.from('degasa_precio_propuesta').insert(
    items.map((i) => ({
      material: i.material, concepto: 'oferta', condicion: i.condicion, lote: '', costo_al_enviar: i.costo, base_al_enviar: null,
      precio_calculado: i.precioCalculado, precio_propuesto: i.precioPropuesto, precio_enviado: i.precioPropuesto, estado: 'autorizado',
      solicitado_por: email, autorizado_por: email, autorizado_en: ahora, comentario: 'Captura manual con vigencia',
      vigente_desde: desde || null, vigente_hasta: hasta,
    })),
  );
  if (esColumnaFaltante(error)) throw new Error(`Falta aplicar la migración 0025_precios_vigencia.sql (${error?.message}). ${AYUDA_MIGRACION}`);
  if (error?.code === '42501') throw new Error(`Supabase rechazó el registro por permisos (${error.message}). La sesión (${email}) no es administradora en degasa_allowed_users / degasa_roles (is_admin).`);
  if (error) throw error;
  return items.length;
}
