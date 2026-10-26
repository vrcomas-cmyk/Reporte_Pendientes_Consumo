import { supabase } from '@/lib/supabaseClient';
import { db } from './db';
import type { TrasladoRepository } from './TrasladoRepository';
import type { Traslado } from '@/core/types';

async function currentEmail(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  return data.user?.email ?? 'desconocido';
}

const texto = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);

function rowToTraslado(r: Record<string, unknown>): Traslado {
  return {
    id: r.local_id as number,
    ...(r.oferta_id != null ? { ofertaId: r.oferta_id as number } : {}),
    pedido: (r.pedido as string) ?? '',
    destinatario: (r.destinatario as string) ?? '',
    razonSocial: (r.razon_social as string) ?? '',
    ejecutivo: (r.ejecutivo as string) ?? '',
    zona: (r.zona as string) ?? '',
    material: r.material as string,
    descripcion: (r.descripcion as string) ?? '',
    cantidad: Number(r.cantidad ?? 0),
    um: (r.um as string) ?? '',
    centroOrigen: (r.centro_origen as string) ?? '',
    almacenOrigen: (r.almacen_origen as string) ?? '',
    centroDestino: (r.centro_destino as string) ?? '',
    almacenDestino: (r.almacen_destino as string) ?? '',
    condicion: (r.condicion as string) ?? '',
    lote: (r.lote as string) ?? '',
    comentarios: (r.comentarios as string) ?? '',
    destinatariosCorreo: Array.isArray(r.destinatarios_correo) ? (r.destinatarios_correo as string[]) : [],
    estatus: r.estatus as Traslado['estatus'],
    creadoEn: r.creado_en as string,
    creadoPor: (r.creado_por as string) ?? '',
    ...(texto(r.solicitado_en) ? { solicitadoEn: r.solicitado_en as string } : {}),
    ...(texto(r.solicitado_por) ? { solicitadoPor: r.solicitado_por as string } : {}),
    ...(r.base_libre != null ? { baseLibre: Number(r.base_libre) } : {}),
    ...(r.base_transito != null ? { baseTransito: Number(r.base_transito) } : {}),
    ...(texto(r.base_leido_en) ? { baseLeidoEn: r.base_leido_en as string } : {}),
    ...(r.en_curso_cant != null ? { enCursoCant: Number(r.en_curso_cant) } : {}),
    ...(texto(r.en_curso_leido_en) ? { enCursoLeidoEn: r.en_curso_leido_en as string } : {}),
    ...(r.recibido_cant != null ? { recibidoCant: Number(r.recibido_cant) } : {}),
    ...(texto(r.recibido_leido_en) ? { recibidoLeidoEn: r.recibido_leido_en as string } : {}),
    ...(texto(r.nota_revision) ? { notaRevision: r.nota_revision as string } : {}),
    ...(texto(r.updated_at) ? { updatedAt: r.updated_at as string } : {}),
  };
}

/** Del objeto de la app a columnas (solo lo presente: sirve para insert y para update parcial). */
function aColumnas(t: Partial<Traslado>): Record<string, unknown> {
  const m: [keyof Traslado, string][] = [
    ['ofertaId', 'oferta_id'], ['pedido', 'pedido'], ['destinatario', 'destinatario'], ['razonSocial', 'razon_social'], ['ejecutivo', 'ejecutivo'], ['zona', 'zona'],
    ['material', 'material'], ['descripcion', 'descripcion'], ['cantidad', 'cantidad'], ['um', 'um'], ['centroOrigen', 'centro_origen'], ['almacenOrigen', 'almacen_origen'],
    ['centroDestino', 'centro_destino'], ['almacenDestino', 'almacen_destino'], ['condicion', 'condicion'], ['lote', 'lote'], ['comentarios', 'comentarios'],
    ['destinatariosCorreo', 'destinatarios_correo'], ['estatus', 'estatus'], ['creadoEn', 'creado_en'], ['creadoPor', 'creado_por'], ['solicitadoEn', 'solicitado_en'],
    ['solicitadoPor', 'solicitado_por'], ['baseLibre', 'base_libre'], ['baseTransito', 'base_transito'], ['baseLeidoEn', 'base_leido_en'], ['enCursoCant', 'en_curso_cant'],
    ['enCursoLeidoEn', 'en_curso_leido_en'], ['recibidoCant', 'recibido_cant'], ['recibidoLeidoEn', 'recibido_leido_en'], ['notaRevision', 'nota_revision'],
  ];
  const out: Record<string, unknown> = {};
  for (const [k, col] of m) if (t[k] !== undefined) out[col] = t[k];
  return out;
}

/** Supabase es la fuente de verdad (el equipo ve los mismos traslados); Dexie cachea para lectura sin conexión. */
export class SupabaseTrasladoRepository implements TrasladoRepository {
  async listTraslados(): Promise<Traslado[]> {
    const { data, error } = await supabase.from('degasa_traslados').select('*').order('local_id', { ascending: false });
    if (error) return db.traslados.orderBy('id').reverse().toArray();
    const list = (data ?? []).map(rowToTraslado);
    void db.traslados.clear().then(() => db.traslados.bulkPut(list));
    return list;
  }

  async addTraslado(t: Traslado): Promise<number> {
    const creadoPor = t.creadoPor || (await currentEmail());
    const creadoEn = t.creadoEn || new Date().toISOString();
    const { data, error } = await supabase.from('degasa_traslados').insert(aColumnas({ ...t, creadoPor, creadoEn })).select('local_id').single();
    if (error) throw error;
    const id = data.local_id as number;
    await db.traslados.put({ ...t, id, creadoPor, creadoEn });
    return id;
  }

  async updateTraslado(id: number, patch: Partial<Traslado>): Promise<void> {
    const { error } = await supabase.from('degasa_traslados').update({ ...aColumnas(patch), updated_at: new Date().toISOString() }).eq('local_id', id);
    if (error) throw error;
    await db.traslados.update(id, patch);
  }
}
