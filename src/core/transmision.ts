// ---------------------------------------------------------------------------
// transmision.ts · «En transmisión» para Seg. de pedidos. Puro: sin red ni disco.
//
// Una entrega está en transmisión si su pedido aparece en las pestañas mensuales de transmisión (Pedido SAP + Delivery). Esas pestañas NO traen material ni lote:
// el material de una entrega solo se conoce por el histórico «Envio en transmision» (Pedido, Material, Lote) que la propia gente fue enviando a los centros. Por eso el
// estado «en transmisión» es del PEDIDO / ENTREGA, y el marcador por material solo aparece cuando el histórico permite atribuirlo.
//
// Todas las claves (pedido, delivery, material) se normalizan igual —sin ceros a la izquierda, sin espacios, en minúsculas—: la app original comparaba unas veces con ceros y otras
// sin ellos, y «0080012345» no coincidía con «80012345».
// ---------------------------------------------------------------------------

/** Una entrega en transmisión: delivery, nº de transmisión, fecha de transmisión ('dd/mm/aaaa') y pestaña (mes) de donde sale. */
export interface EntregaTx { d: string; n: string; f: string; p: string }

/** Índice compacto que entrega el servidor: pedido normalizado → sus entregas en transmisión. No lleva clientes ni importes. */
export type IndiceTx = Readonly<Record<string, readonly EntregaTx[]>>;

/** Material y lote que el histórico asocia a una entrega: delivery normalizado → [{ m: material, l: lote }]. */
export type HistorialMaterialesTx = Readonly<Record<string, readonly { m: string; l: string }[]>>;

/** Clave de comparación de pedidos, entregas y materiales: sin espacios, sin ceros a la izquierda y en minúsculas. */
export const normalizarClaveTx = (v: unknown): string => String(v ?? '').trim().replace(/^0+/, '').toLowerCase();

/** 'dd/mm/aaaa' → milisegundos (0 si no se entiende), para ordenar por fecha. */
function fechaMs(f: string): number {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(f.trim());
  return m ? Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : 0;
}

/** Entregas en transmisión de un pedido, la más reciente primero. [] si el pedido no está (o no hay índice). */
export function transmisionDePedido(indice: IndiceTx | null | undefined, pedido: unknown): EntregaTx[] {
  if (!indice) return [];
  const k = normalizarClaveTx(pedido);
  if (!k) return [];
  const lista = indice[k];
  if (!lista?.length) return [];
  return [...lista].sort((a, b) => fechaMs(b.f) - fechaMs(a.f));
}

/** Texto corto para la celda: «Entrega 80012345 · 05/11/2026», o «3 entregas · última 05/11/2026». '' si no está en transmisión. */
export function textoTransmision(entregas: readonly EntregaTx[]): string {
  if (!entregas.length) return '';
  const e = entregas[0];
  if (entregas.length === 1) return `Entrega ${e.d}${e.f ? ` · ${e.f}` : ''}`;
  return `${entregas.length} entregas${e.f ? ` · última ${e.f}` : ''}`;
}

/** Material en transmisión dentro de un pedido: en qué entregas y con qué lotes. */
export interface MaterialEnTx { entregas: string[]; lotes: string[] }

/** Materiales del pedido que el histórico ubica en alguna de sus entregas en transmisión (clave: material normalizado). Si no hay histórico, el mapa sale vacío:
 *  el pedido sigue marcado «en transmisión» a nivel de entrega, pero no se afirma nada de sus materiales. */
export function materialesEnTransmision(indice: IndiceTx | null | undefined, historial: HistorialMaterialesTx | null | undefined, pedido: unknown): Map<string, MaterialEnTx> {
  const out = new Map<string, MaterialEnTx>();
  if (!historial) return out;
  for (const e of transmisionDePedido(indice, pedido)) {
    for (const { m, l } of historial[normalizarClaveTx(e.d)] ?? []) {
      const k = normalizarClaveTx(m);
      if (!k) continue;
      const cur = out.get(k) ?? { entregas: [], lotes: [] };
      if (!cur.entregas.includes(e.d)) cur.entregas.push(e.d);
      const lote = String(l ?? '').trim();
      if (lote && !cur.lotes.includes(lote)) cur.lotes.push(lote);
      out.set(k, cur);
    }
  }
  return out;
}

/** Valida lo que llega del servidor: descarta lo que no tiene la forma de un índice (para que un cambio del Apps Script no rompa la pantalla). */
export function indiceDeRespuesta(raw: unknown): IndiceTx {
  const out: Record<string, EntregaTx[]> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [pedido, lista] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(lista)) continue;
    const entregas = lista
      .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
      .map((x) => ({ d: String(x.d ?? '').trim(), n: String(x.n ?? '').trim(), f: String(x.f ?? '').trim(), p: String(x.p ?? '').trim() }))
      .filter((x) => x.d);
    if (entregas.length) out[normalizarClaveTx(pedido)] = entregas;
  }
  return out;
}

export function historialDeRespuesta(raw: unknown): HistorialMaterialesTx {
  const out: Record<string, { m: string; l: string }[]> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [delivery, lista] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(lista)) continue;
    const mats = lista
      .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
      .map((x) => ({ m: String(x.m ?? '').trim(), l: String(x.l ?? '').trim() }))
      .filter((x) => x.m);
    if (mats.length) out[normalizarClaveTx(delivery)] = mats;
  }
  return out;
}
