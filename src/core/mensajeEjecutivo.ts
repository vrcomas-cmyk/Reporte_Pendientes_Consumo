// ---------------------------------------------------------------------------
// mensajeEjecutivo.ts · Mensaje para pedirle a un ejecutivo comercial (p. ej. por WhatsApp) que revise si puede ofertar a sus clientes
// alguno de los productos ofertables de un material. Separa sustitutos, corta caducidad y otras condiciones.
// Puro: la UI arma las filas y los lotes y solo copia el texto. Sin costos internos (el texto sale de la empresa) y SIN rellenos: si falta un dato
// (precio, lote, caducidad, cliente…) simplemente no se escribe, en vez de poner «sin precio» o «—».
// ---------------------------------------------------------------------------

/** Una fila elegida de Sugerencias (pedido pendiente) o de Consumo (cliente que compra el material). */
export interface FilaMensaje {
  tipo: 'sug' | 'cons';
  ejecutivo: string;
  cliente: string;
  /** Solo sugerencias. */
  pedido?: string;
  /** Sugerencias: cantidad pendiente. Consumo: consumo promedio mensual. */
  cantidad: number;
}

/** Un producto ofertable (lote o existencia general) a proponer. */
export interface LoteMensaje {
  material: string;
  descripcion: string;
  lote: string;
  /** Fecha ya formateada para mostrar (o ''). */
  caducidad: string;
  disponible: number;
  /** 0 = sin precio: no se menciona. */
  precio: number;
  /** Condición / fuente: Sustituto, Corta caducidad, etc. */
  fuente: string;
}

export interface EntradaMensaje {
  material: string;
  descripcion: string;
  /** Vacío cuando el detalle es del material completo (no de un centro): no se menciona. */
  centro: string;
  filas: readonly FilaMensaje[];
  /** Los productos a proponer: los marcados o, si no hay marcados, todos los visibles (lo decide quien llama). */
  lotes: readonly LoteMensaje[];
}

export interface MensajeEjecutivo {
  ejecutivo: string;
  filas: FilaMensaje[];
  texto: string;
}

export const SIN_EJECUTIVO = 'Sin ejecutivo';

const num = (n: number) => new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 }).format(n);
const moneda = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);
const limpio = (t: string | undefined) => (t ?? '').trim();
const sinAcentos = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Primer nombre para el saludo ("Ana María Pérez" → "Ana"); si viene en MAYÚSCULAS lo pasa a Título. */
function primerNombre(ejecutivo: string): string {
  const p = limpio(ejecutivo).split(/\s+/)[0] ?? '';
  return p.length > 1 && p === p.toUpperCase() ? p[0] + p.slice(1).toLowerCase() : p;
}

/** Saludo: por el primer nombre; una VACANTE (se muestra como «002 · VACANTE», con su zona) no tiene a quién saludar, así que se menciona la zona. */
function saludo(ejecutivo: string): string {
  if (ejecutivo === SIN_EJECUTIVO) return 'Hola, ¿cómo estás?';
  if (/vacante/i.test(ejecutivo)) {
    const zona = /^\s*(\d{1,3})\b/.exec(ejecutivo)?.[1];
    return `Hola, ¿cómo estás?${zona ? ` Te escribo por la zona ${zona}.` : ''}`;
  }
  return `Que tal ${primerNombre(ejecutivo)}, ¿cómo estás?`;
}

type CategoriaLote = 'sustituto' | 'cortaCaducidad' | 'otros';

/** Corta caducidad manda sobre las demás; luego sustituto (por condición, o por ser otro código que el del pedido). */
function categoriaLote(l: LoteMensaje, materialPedido: string): CategoriaLote {
  const fuente = sinAcentos(l.fuente);
  if (fuente.includes('corta caducidad')) return 'cortaCaducidad';
  if (fuente.includes('sustituto') || (limpio(l.material) !== '' && limpio(l.material) !== limpio(materialPedido))) return 'sustituto';
  return 'otros';
}

/** Condiciones distintas de los productos a proponer, para el texto «tenemos material de …»: «sustituto», «corta caducidad», PNC, el Status de
 * Revision (p. ej. «lento mov»)… La existencia común («General») no es una condición. Sin duplicados y en el orden en que aparecen. */
export function condicionesDe(lotes: readonly LoteMensaje[], materialPedido: string): string[] {
  const vistas = new Set<string>();
  const out: string[] = [];
  const agrega = (t: string) => {
    const nombre = limpio(t);
    const clave = sinAcentos(nombre);
    if (!clave || clave === 'general' || vistas.has(clave)) return;
    vistas.add(clave);
    // Siglas (PNC) tal cual; el resto en minúsculas para que lea natural dentro de la frase.
    out.push(nombre === nombre.toUpperCase() && nombre.length <= 4 ? nombre : nombre.toLowerCase());
  };
  for (const l of lotes) {
    if (limpio(l.material) !== '' && limpio(l.material) !== limpio(materialPedido)) agrega('sustituto');
    for (const parte of l.fuente.split('/')) agrega(parte);
  }
  return out;
}

/** «a», «a y b», «a, b y c». */
function listaNatural(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

/** "• Pedido 123 · CLIENTE · pendiente 10" — cada pieza solo si existe. */
function lineaFila(f: FilaMensaje): string {
  const partes: string[] = [];
  if (f.tipo === 'sug' && limpio(f.pedido)) partes.push(`Pedido ${limpio(f.pedido)}`);
  if (limpio(f.cliente)) partes.push(limpio(f.cliente));
  if (f.cantidad > 0) partes.push(f.tipo === 'sug' ? `pendiente ${num(f.cantidad)}` : `compra en promedio ${num(f.cantidad)} al mes`);
  return partes.length ? `• ${partes.join(' · ')}` : '';
}

/** "• 100952 CINTA · lote A1 · caduca 01/12/2027 · 40 disponibles · $85.00" — cada pieza solo si existe. */
function lineaLote(l: LoteMensaje, materialPedido: string, marcarSustituto: boolean): string {
  const partes = [`${limpio(l.material)}${limpio(l.descripcion) ? ` ${limpio(l.descripcion)}` : ''}`.trim()];
  if (marcarSustituto && limpio(l.material) && limpio(l.material) !== limpio(materialPedido)) partes.push(`sustituto del ${limpio(materialPedido)}`);
  if (limpio(l.lote)) partes.push(`lote ${limpio(l.lote)}`);
  if (limpio(l.caducidad)) partes.push(`caduca ${limpio(l.caducidad)}`);
  if (l.disponible > 0) partes.push(`${num(l.disponible)} disponibles`);
  if (l.precio > 0) partes.push(moneda(l.precio));
  return `• ${partes.filter(Boolean).join(' · ')}`;
}

/** Agrega el apartado solo si tiene productos. */
function apartado(lineas: string[], titulo: string, lotes: readonly LoteMensaje[], materialPedido: string, marcarSustituto: boolean): void {
  if (!lotes.length) return;
  lineas.push('', titulo, ...lotes.map((l) => lineaLote(l, materialPedido, marcarSustituto)));
}

/** Un mensaje por ejecutivo con sus filas elegidas y los productos ofertables, en tono cercano. Sin filas → []. */
export function armarMensajesEjecutivo(e: EntradaMensaje): MensajeEjecutivo[] {
  const por = new Map<string, FilaMensaje[]>();
  for (const f of e.filas) {
    const k = limpio(f.ejecutivo) || SIN_EJECUTIVO;
    const arr = por.get(k) ?? [];
    arr.push(f);
    por.set(k, arr);
  }
  const material = limpio(e.material);
  const sustitutos = e.lotes.filter((l) => categoriaLote(l, material) === 'sustituto');
  const corta = e.lotes.filter((l) => categoriaLote(l, material) === 'cortaCaducidad');
  const otros = e.lotes.filter((l) => categoriaLote(l, material) === 'otros');
  const descripcion = limpio(e.descripcion);
  const centro = limpio(e.centro);
  // Lo que se esté seleccionando (o, sin selección, lo visible): sus condiciones van en «tenemos material de …».
  const condiciones = listaNatural(condicionesDe(e.lotes, material));

  return [...por]
    .sort(([x], [y]) => (x === SIN_EJECUTIVO ? 1 : y === SIN_EJECUTIVO ? -1 : x.localeCompare(y, 'es')))
    .map(([ejecutivo, filas]) => {
      const pedidos = filas.filter((f) => f.tipo === 'sug').map(lineaFila).filter(Boolean);
      const clientes = filas.filter((f) => f.tipo === 'cons').map(lineaFila).filter(Boolean);
      const que = `${material}${descripcion ? ` ${descripcion}` : ''}`;
      const l: string[] = [
        saludo(ejecutivo),
        `Estoy revisando el codigo ${que}${centro ? ` en el centro ${centro}` : ''} y tenemos material${condiciones ? ` de ${condiciones}` : ' disponible'}. Me ayudas a revisar con tus clientes si nos acepta alguno, por fa.`,
      ];
      if (pedidos.length) l.push('', 'Tienen pedidos pendientes de este material:', ...pedidos);
      if (clientes.length) l.push('', 'Estos clientes lo compran con frecuencia:', ...clientes);
      if (e.lotes.length) l.push('', 'Lo que tenemos para ofrecerles:');
      apartado(l, `Como sustituto del ${material}:`, sustitutos, material, false);
      apartado(l, 'Con corta caducidad y podiamos darle precio especial y/o carta canje:', corta, material, true);
      apartado(l, e.lotes.length > otros.length ? 'Otras opciones:' : 'Opciones:', otros, material, false);
      l.push('', 'Me dices si necesitas más detalle de alguno? por favor.');
      return { ejecutivo, filas, texto: l.join('\n') };
    });
}

// ---------------------------------------------------------------------------
// Mensaje de UN pedido (detalle de Seg. de pedidos): folio, cliente y, por cada material del pedido con lotes elegidos, esos lotes con su condición.
// Misma redacción y mismas reglas (sin rellenos, sin costos) que el mensaje por material.
// ---------------------------------------------------------------------------

/** Un renglón del pedido con los lotes que se eligieron para ofertarle. */
export interface ItemPedidoMensaje {
  /** Material que viene en el pedido. */
  material: string;
  descripcion: string;
  /** Cantidad pendiente del renglón (0 = no se menciona). */
  pendiente: number;
  lotes: readonly LoteMensaje[];
}

export interface EntradaMensajePedido {
  ejecutivo: string;
  /** Folio del pedido. */
  pedido: string;
  oc?: string;
  cliente: string;
  centro?: string;
  items: readonly ItemPedidoMensaje[];
}

/** Mensaje al ejecutivo del pedido con los renglones que tienen lotes elegidos. `null` si no hay ninguno. */
export function armarMensajePedido(e: EntradaMensajePedido): MensajeEjecutivo | null {
  const items = e.items.filter((i) => i.lotes.length > 0);
  if (!items.length) return null;
  const ejecutivo = limpio(e.ejecutivo) || SIN_EJECUTIVO;
  const pedido = limpio(e.pedido);
  const oc = limpio(e.oc);
  const cliente = limpio(e.cliente);
  const centro = limpio(e.centro);
  // Condiciones de TODOS los lotes elegidos (sin repetir), cada una vista desde el material de su renglón.
  const vistas = new Set<string>();
  const condiciones: string[] = [];
  for (const it of items) {
    for (const c of condicionesDe(it.lotes, limpio(it.material))) {
      if (!vistas.has(sinAcentos(c))) { vistas.add(sinAcentos(c)); condiciones.push(c); }
    }
  }
  const cond = listaNatural(condiciones);
  const sobre = [
    pedido ? `el pedido ${pedido}${oc ? ` (OC ${oc})` : ''}` : 'un pedido',
    cliente ? ` de ${cliente}` : '',
    centro ? ` en el centro ${centro}` : '',
  ].join('');
  const l: string[] = [
    saludo(ejecutivo),
    `Estoy revisando ${sobre} y tenemos material${cond ? ` de ${cond}` : ' disponible'}. Me ayudas a revisar con tu cliente si nos acepta alguno, por fa.`,
  ];
  for (const it of items) {
    const material = limpio(it.material);
    const encabezado = [`${material}${limpio(it.descripcion) ? ` ${limpio(it.descripcion)}` : ''}`.trim(), it.pendiente > 0 ? `pendiente ${num(it.pendiente)}` : ''].filter(Boolean).join(' · ');
    l.push('', encabezado);
    apartado(l, `Como sustituto del ${material}:`, it.lotes.filter((x) => categoriaLote(x, material) === 'sustituto'), material, false);
    apartado(l, 'Con corta caducidad y podiamos darle precio especial y/o carta canje:', it.lotes.filter((x) => categoriaLote(x, material) === 'cortaCaducidad'), material, true);
    const otros = it.lotes.filter((x) => categoriaLote(x, material) === 'otros');
    apartado(l, otros.length < it.lotes.length ? 'Otras opciones:' : 'Opciones:', otros, material, false);
  }
  l.push('', 'Me dices si necesitas más detalle de alguno? por favor.');
  return { ejecutivo, filas: [], texto: l.join('\n') };
}
