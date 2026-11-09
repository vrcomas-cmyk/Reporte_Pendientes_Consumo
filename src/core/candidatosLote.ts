import type { ConsumoRow } from '@/core/types';
import type { BOItem } from '@/core/buildBO';
import { mesKey, serieMatDest, type RFIndex } from '@/core/resumenFac';
import { percentilPonderado } from '@/core/politicaPrecios';
import { p50Mensual } from '@/core/reporteEjecutivo';
import { norm } from '@/lib/text';

/** Un cliente al que se le puede ofrecer un material, con su historial de compra de ESE material. */
export interface Candidato {
  /** Destinatario normalizado (llave). */
  dest: string;
  destinatario: string;
  razon: string;
  ejecutivo: string;
  /** Centros del cliente para este material (consumo y pedidos). */
  centros: string[];
  /** Pendiente (pedidos abiertos) de este material. */
  pendiente: number;
  pedidos: string[];
  ultimoMes: string;
  cantUltima: number;
  penultimoMes: string;
  cantPenultima: number;
  precioUltimo: number;
  precioPenultimo: number;
  precioP50: number;
  precioMin: number;
  precioMax: number;
  /** Mediana mensual de cantidad (12 meses cerrados). */
  p50Cant: number;
  consumoActual: number;
  consumoProm: number;
  /** Presente cuando el cliente NO compra este código sino su sustituto: `material` es el código que sí compra. */
  via?: { material: string; texto: string };
}

export interface CtxCandidatos {
  consumo: ConsumoRow[];
  bo: BOItem[];
  rf: RFIndex | null;
  /** Ejecutivo del cliente: recibe la fila de consumo principal (si hay) y el destinatario. */
  ejecutivoDe: (fila: ConsumoRow | undefined, destinatario: string) => string;
}

/** Cantidad sugerida a ofertar: lo pendiente, si no la mediana mensual, topado al disponible del lote. */
export function cantidadSugerida(c: Pick<Candidato, 'pendiente' | 'p50Cant' | 'cantUltima'>, disponible: number): number {
  const base = c.pendiente > 0 ? c.pendiente : c.p50Cant > 0 ? Math.round(c.p50Cant) : c.cantUltima > 0 ? c.cantUltima : disponible;
  return Math.max(0, Math.min(disponible, Math.round(base)));
}

export type ModosCentro = Readonly<Record<string, 'local' | 'compartido'>>;
/** `mismo` = el cliente es del centro del lote (lote local) · `compartido` = lote que se ofrece a varios centros · `excepcion` = lote local
 * a un cliente de otro centro (solo con el interruptor) · `no` = no se ofrece. */
export type AlcanceOferta = 'mismo' | 'compartido' | 'excepcion' | 'no';

export const modoDeCentro = (centro: string, modos: ModosCentro): 'local' | 'compartido' => modos[centro] ?? 'compartido';

/** Regla de centros para ofrecer un lote: un lote de centro LOCAL solo va a clientes de ese centro; uno COMPARTIDO, a cualquiera.
 * Un cliente sin centros conocidos no se descarta. */
export function reglaOferta(centroLote: string, centrosCliente: readonly string[], modos: ModosCentro, incluirOtros: boolean): AlcanceOferta {
  if (modoDeCentro(centroLote, modos) === 'compartido' || !centrosCliente.length) return 'compartido';
  if (centrosCliente.includes(centroLote)) return 'mismo';
  return incluirOtros ? 'excepcion' : 'no';
}

/** ¿El lote de `centroLote` se le puede vender a un cliente con estos centros? Sin centros conocidos, sí.
 * `pasa(centroLote, centroCliente)` es la regla del filtro "Considerar centros". */
export function loteAplicaACandidato(centroLote: string, centros: readonly string[], pasa: (centroLote: string, centroCliente: string) => boolean): boolean {
  if (!centros.length) return true;
  return centros.some((c) => pasa(centroLote, c));
}

export function construirCandidato(destinatario: string, material: string, filas: ConsumoRow[], pedidos: BOItem[], ctx: CtxCandidatos): Candidato {
  const principal = filas.slice().sort((x, y) => mesKey(y.ultimoMesFacturacion) - mesKey(x.ultimoMesFacturacion) || y.consumoActual - x.consumoActual)[0];
  const serie = serieMatDest(ctx.rf, destinatario, material);
  const puntos = serie.filter((p) => p.cant > 0 && p.imp > 0).map((p) => ({ valor: p.imp / p.cant, peso: p.cant }));
  const mins = filas.map((f) => f.precioMin).filter((v) => v > 0);
  const maxs = filas.map((f) => f.precioMax).filter((v) => v > 0);
  const centros = [...new Set([...filas.map((f) => f.centro), ...pedidos.map((p) => p.bo.centroPedido)].filter(Boolean))];
  return {
    dest: norm(destinatario),
    destinatario,
    razon: principal?.razonSocial || pedidos[0]?.bo.razonSocial || destinatario,
    ejecutivo: ctx.ejecutivoDe(principal, destinatario),
    centros,
    pendiente: pedidos.reduce((s, p) => s + (p.bo.cantidadPendiente || 0), 0),
    pedidos: [...new Set(pedidos.map((p) => p.bo.pedido).filter(Boolean))],
    ultimoMes: principal?.ultimoMesFacturacion ?? '',
    cantUltima: principal?.cantidadUltima ?? 0,
    penultimoMes: principal?.penultimoMes ?? '',
    cantPenultima: principal?.cantidadPenultima ?? 0,
    precioUltimo: principal?.precioUnitarioUltima ?? 0,
    precioPenultimo: principal?.precioUnitarioPenultima ?? 0,
    precioP50: percentilPonderado(puntos, 0.5) || principal?.precioProm || 0,
    precioMin: mins.length ? Math.min(...mins) : 0,
    precioMax: maxs.length ? Math.max(...maxs) : 0,
    p50Cant: p50Mensual(serie, ctx.rf?.curmes ?? ''),
    consumoActual: filas.reduce((s, f) => s + (f.consumoActual || 0), 0),
    consumoProm: filas.reduce((s, f) => s + (f.consumoPromedioMensual || 0), 0),
  };
}

/** Candidatos de un material: clientes que lo compraron (Consumo) o lo tienen pendiente (BO). Con pendiente primero, luego la compra más reciente. */
export function candidatosDeMaterial(material: string, ctx: CtxCandidatos): Candidato[] {
  const m = norm(material);
  const filas = new Map<string, { dest: string; filas: ConsumoRow[]; pedidos: BOItem[] }>();
  const grupo = (dest: string) => {
    const k = norm(dest);
    let g = filas.get(k);
    if (!g) { g = { dest, filas: [], pedidos: [] }; filas.set(k, g); }
    return g;
  };
  for (const r of ctx.consumo) if (norm(r.material) === m && r.destinatario) grupo(r.destinatario).filas.push(r);
  for (const it of ctx.bo) if (norm(it.bo.materialBase) === m && it.bo.cantidadPendiente > 0 && it.bo.destinatario) grupo(it.bo.destinatario).pedidos.push(it);
  return ordenarCandidatos([...filas.values()].map((g) => construirCandidato(g.dest, material, g.filas, g.pedidos, ctx)));
}

export function ordenarCandidatos(list: Candidato[]): Candidato[] {
  return list.sort((x, y) => {
    const px = x.pendiente > 0, py = y.pendiente > 0;
    if (px !== py) return px ? -1 : 1;
    // Con pendiente: primero quienes compran el código propio, luego los de sustituto.
    if (px && !!x.via !== !!y.via) return x.via ? 1 : -1;
    return mesKey(y.ultimoMes) - mesKey(x.ultimoMes) || y.cantUltima - x.cantUltima || (x.via ? 1 : 0) - (y.via ? 1 : 0);
  });
}

/** Candidatos del material más los clientes de sus sustitutos (marcados con `via`). Un cliente que ya compra el código propio no se duplica;
 * si aparece por varios sustitutos se queda el de mayor pendiente / compra más reciente. */
export function candidatosConSustitutos(material: string, sustitutos: readonly { material: string; texto: string }[], ctx: CtxCandidatos): Candidato[] {
  const porDest = new Map<string, Candidato>();
  for (const c of candidatosDeMaterial(material, ctx)) porDest.set(c.dest, c);
  const mejor = (x: Candidato, y: Candidato) => (y.pendiente > 0 && !(x.pendiente > 0)) || (y.pendiente > 0) === (x.pendiente > 0) && mesKey(y.ultimoMes) > mesKey(x.ultimoMes);
  for (const s of sustitutos) {
    if (norm(s.material) === norm(material)) continue;
    for (const c of candidatosDeMaterial(s.material, ctx)) {
      const previo = porDest.get(c.dest);
      if (previo && (!previo.via || !mejor(previo, c))) continue;
      porDest.set(c.dest, { ...c, via: { material: s.material, texto: s.texto } });
    }
  }
  return ordenarCandidatos([...porDest.values()]);
}

/** Materiales distintos que un cliente compra o tiene pendientes (para listar OTROS lotes que le sirven). */
export function materialesDeCliente(destinatario: string, consumo: ConsumoRow[], bo: BOItem[]): string[] {
  const d = norm(destinatario);
  const out = new Map<string, string>();
  for (const r of consumo) if (norm(r.destinatario) === d && r.material) out.set(norm(r.material), r.material);
  for (const it of bo) if (norm(it.bo.destinatario) === d && it.bo.cantidadPendiente > 0 && it.bo.materialBase) out.set(norm(it.bo.materialBase), it.bo.materialBase);
  return [...out.values()];
}
