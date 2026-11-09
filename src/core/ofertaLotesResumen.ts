import type { ItemOfertaLote } from '@/store/ofertaLotesStore';

export interface GrupoCliente { destinatario: string; cliente: string; items: ItemOfertaLote[] }
export interface GrupoEjecutivo { ejecutivo: string; clientes: GrupoCliente[] }

const SIN_EJEC = 'Sin ejecutivo';

/** Selección → ejecutivo → cliente → lotes (orden alfabético; los lotes por caducidad más próxima). */
export function agruparOferta(items: readonly ItemOfertaLote[]): GrupoEjecutivo[] {
  const porEjec = new Map<string, Map<string, GrupoCliente>>();
  for (const it of items) {
    const e = it.ejecutivo || SIN_EJEC;
    let clientes = porEjec.get(e);
    if (!clientes) { clientes = new Map(); porEjec.set(e, clientes); }
    let g = clientes.get(it.destinatario);
    if (!g) { g = { destinatario: it.destinatario, cliente: it.cliente || it.destinatario, items: [] }; clientes.set(it.destinatario, g); }
    g.items.push(it);
  }
  const fecha = (s: string | null) => s || '9999-99-99';
  return [...porEjec]
    .map(([ejecutivo, m]) => ({
      ejecutivo,
      clientes: [...m.values()]
        .map((g) => ({ ...g, items: g.items.slice().sort((x, y) => fecha(x.caducidad).localeCompare(fecha(y.caducidad)) || x.material.localeCompare(y.material)) }))
        .sort((x, y) => x.cliente.localeCompare(y.cliente)),
    }))
    .sort((x, y) => x.ejecutivo.localeCompare(y.ejecutivo));
}

export const importeItem = (it: ItemOfertaLote): number => it.cantidad * it.precioOferta;

const num = (n: number) => new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 }).format(n);
const money = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);

function fechaCorta(iso: string | null): string {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

function lineaItem(it: ItemOfertaLote): string {
  const precio = it.precioOferta > 0 ? ` · ${money(it.precioOferta)}` : '';
  const sust = it.viaSustituto ? ` · sustituto de lo que compras: ${it.viaSustituto}` : '';
  return `• ${it.material} ${it.desc} — Lote ${it.lote || '—'} (Centro ${it.centro}) · ${num(it.cantidad)} pzas · cad. ${fechaCorta(it.caducidad)}${precio}${sust}`;
}

/** Texto para el cliente: solo sus lotes. */
export function textoCliente(g: GrupoCliente): string {
  return [`Hola, ${g.cliente}. Tenemos disponibles para ti:`, ...g.items.map(lineaItem), 'Quedamos atentos para confirmar.'].join('\n');
}

/** Texto para el ejecutivo: todos sus clientes con los lotes por ofrecer. */
export function textoEjecutivo(g: GrupoEjecutivo): string {
  const partes = g.clientes.map((c) => [`${c.cliente}`, ...c.items.map(lineaItem)].join('\n'));
  return [`${g.ejecutivo}: lotes por ofrecer`, '', partes.join('\n\n')].join('\n');
}

/** Filas planas para Excel (una por lote × cliente). */
export function filasOferta(items: readonly ItemOfertaLote[]): Record<string, unknown>[] {
  return agruparOferta(items).flatMap((e) => e.clientes.flatMap((c) => c.items.map((it) => ({
    Ejecutivo: e.ejecutivo, Cliente: c.cliente, Destinatario: c.destinatario,
    Material: it.material, Descripción: it.desc, 'Sustituye a': it.viaSustituto ?? '', Lote: it.lote, Centro: it.centro, Almacén: it.almacen,
    Caducidad: fechaCorta(it.caducidad), Disponible: it.disponible, 'Cantidad a ofertar': it.cantidad,
    'Precio oferta': it.precioOferta || '', 'Último precio cliente': it.precioUltimo || '', 'Precio P50 cliente': it.precioP50 || '',
    Importe: importeItem(it) || '',
  }))));
}
