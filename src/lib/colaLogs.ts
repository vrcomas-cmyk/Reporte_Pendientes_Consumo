// ---------------------------------------------------------------------------
// colaLogs.ts · Cola de logs que se envían en BLOQUE.
//
// Antes cada log eran DOS peticiones (`auth.getUser()` + un insert con `.select()`), y cuando Supabase estaba saturado cada reintento de cada bloque de una carga escribía
// otro log: cientos de peticiones extra justo en el peor momento. Ahora los logs se acumulan en memoria y se envían juntos (un solo insert) cada ~30 s, al juntarse un lote
// o al ocultar/cerrar la página. Si el envío falla (servidor saturado) se conservan —hasta un tope— y se reintenta con espera creciente.
// ---------------------------------------------------------------------------

export interface EntradaLog { at: string; level: string; event: string; detail?: string }

export interface OpcionesCola {
  /** Cada cuánto se envía lo acumulado. */
  intervaloMs?: number;
  /** Al juntarse este número se envía de inmediato. */
  maxLote?: number;
  /** Tope de logs retenidos si el envío falla: pasado esto se descartan los más viejos. */
  maxCola?: number;
  /** Espera máxima entre reintentos tras fallos. */
  maxEsperaMs?: number;
}

export class ColaLogs {
  private cola: EntradaLog[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private enCurso = false;
  private fallos = 0;
  private readonly enviar: (lote: EntradaLog[]) => Promise<void>;
  private readonly intervaloMs: number;
  private readonly maxLote: number;
  private readonly maxCola: number;
  private readonly maxEsperaMs: number;

  constructor(enviar: (lote: EntradaLog[]) => Promise<void>, o: OpcionesCola = {}) {
    this.enviar = enviar;
    this.intervaloMs = o.intervaloMs ?? 30_000;
    this.maxLote = o.maxLote ?? 50;
    this.maxCola = o.maxCola ?? 200;
    this.maxEsperaMs = o.maxEsperaMs ?? 5 * 60_000;
  }

  get pendientes(): number { return this.cola.length; }

  /** Agrega un log. No espera a la red ni lanza. */
  agregar(e: EntradaLog): void {
    this.cola.push(e);
    if (this.cola.length > this.maxCola) this.cola.splice(0, this.cola.length - this.maxCola);
    if (this.cola.length >= this.maxLote) void this.vaciar();
    else this.programar();
  }

  private programar(): void {
    if (this.timer) return;
    // Con fallos seguidos la espera crece (×2 por fallo, con tope) para no martillar a un servidor que ya está mal.
    const espera = Math.min(this.maxEsperaMs, this.intervaloMs * 2 ** this.fallos);
    this.timer = setTimeout(() => { this.timer = null; void this.vaciar(); }, espera);
  }

  /** Envía lo acumulado (en lotes de `maxLote`). Nunca lanza; si falla, lo conserva y reprograma. */
  async vaciar(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.enCurso || !this.cola.length) return;
    this.enCurso = true;
    try {
      while (this.cola.length) {
        const lote = this.cola.slice(0, this.maxLote);
        await this.enviar(lote);
        this.cola.splice(0, lote.length);
        this.fallos = 0;
      }
    } catch {
      this.fallos++;
    } finally {
      this.enCurso = false;
      if (this.cola.length) this.programar();
    }
  }
}
