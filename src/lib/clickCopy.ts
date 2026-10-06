// ---------------------------------------------------------------------------
// clickCopy.ts · Qué texto copiar con el clic derecho: la selección, la
// palabra/código bajo el cursor y el texto de la celda/línea que lo contiene.
// `extraerToken` y `textoDeBloque` son puros (testeables); `capturarClicDerecho`
// toca el DOM (caret bajo el cursor + selección).
// ---------------------------------------------------------------------------

export interface ClickCopy {
  /** Texto seleccionado a mano (vacío si no hay). */
  seleccion: string;
  /** Palabra o código bajo el cursor (p. ej. un material). */
  palabra: string;
  /** Texto de la celda/línea que contiene a la palabra (si difiere de ella). */
  bloque: string;
}

export const CLICK_COPY_VACIO: ClickCopy = { seleccion: '', palabra: '', bloque: '' };

const MAX_BLOQUE = 200;
const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

/** Palabra/código que cubre `offset` en `texto`: letras, números y `._-/`. Sin signos sueltos en los extremos. */
export function extraerToken(texto: string, offset: number): string {
  const re = /[\p{L}\p{N}._\-/]+/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto)) !== null) {
    const ini = m.index;
    const fin = ini + m[0].length;
    if (offset >= ini && offset <= fin) return m[0].replace(/^[._\-/]+|[._\-/]+$/g, '');
  }
  return '';
}

const PARAR = new Set(['TR', 'TBODY', 'THEAD', 'TFOOT', 'TABLE', 'BODY', 'HTML']);

/** Texto de un elemento uniendo sus nodos de texto con espacio (`textContent`
 * pega "1001234" + "GASA" sin separador cuando están en elementos distintos). */
function textoVisible(el: Element): string {
  const partes: string[] = [];
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) partes.push(n.textContent ?? '');
  return norm(partes.join(' '));
}

/** Texto del ancestro más cercano a `el` (incluido) que tenga entre 1 y 200
 * caracteres y sea distinto de `palabra` — la celda o línea completa, no el
 * código solo. Se detiene en la fila de la tabla. */
export function textoDeBloque(el: Element | null, palabra = ''): string {
  let cur: Element | null = el;
  while (cur && !PARAR.has(cur.tagName)) {
    const t = textoVisible(cur);
    if (t && t.length <= MAX_BLOQUE && t !== palabra) return t;
    if (t.length > MAX_BLOQUE) return '';
    cur = cur.parentElement;
  }
  return '';
}

type DocConCaret = Document & {
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
};

/** Lee del DOM la selección, la palabra bajo (x, y) y el texto de su bloque. */
export function capturarClicDerecho(target: EventTarget | null, x: number, y: number): ClickCopy {
  const seleccion = norm(window.getSelection?.()?.toString());
  let nodo: Node | null = null;
  let offset = 0;
  const d = document as DocConCaret;
  if (d.caretPositionFromPoint) {
    const p = d.caretPositionFromPoint(x, y);
    if (p) { nodo = p.offsetNode; offset = p.offset; }
  } else if (d.caretRangeFromPoint) {
    const r = d.caretRangeFromPoint(x, y);
    if (r) { nodo = r.startContainer; offset = r.startOffset; }
  }
  const palabra = nodo && nodo.nodeType === Node.TEXT_NODE ? extraerToken(nodo.textContent ?? '', offset) : '';
  const el = target instanceof Element ? target : null;
  return { seleccion, palabra, bloque: textoDeBloque(el, palabra) };
}

// Último clic derecho capturado (lo escribe `GlobalCopyMenu` en fase de captura,
// antes de que Radix abra su propio menú, y lo leen los menús de fila al abrirse).
let ultimo: ClickCopy = CLICK_COPY_VACIO;
export const setClickCopy = (c: ClickCopy): void => { ultimo = c; };
export const getClickCopy = (): ClickCopy => ultimo;

/** Recorta un texto para mostrarlo en el menú. */
export const recortar = (s: string, max = 38): string => (s.length > max ? `${s.slice(0, max - 1)}…` : s);
