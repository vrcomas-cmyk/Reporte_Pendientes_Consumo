// ---------------------------------------------------------------------------
// text.ts · Normalizers shared across the core/report layers. Single source
// of truth for `norm` and `num` — previously redefined 7+ times with subtly
// divergent behaviour (especially mappers.num silently stripping thousands
// commas differently from resumenFac.num).
// ---------------------------------------------------------------------------

/** Trim-to-empty string coercion. `null`/`undefined`/numbers → safe string. */
export const norm = (v: unknown): string => (v == null ? '' : String(v)).trim();

/**
 * Numeric coercion used heavily by mappers/aggregators.
 *
 * - `null`/`undefined`/`''` → 0
 * - native numbers pass through unchanged
 * - strings: strip everything except digits, dot, minus and (optionally)
 *   thousands/decimal commas, then `parseFloat`. The `loose` variant keeps
 *   the legacy mappers behaviour (accepts "$ 60.87" / "1,234.5"), while the
 *   default `num` matches the resumenFac/buildBO/analisis variants that
 *   only strip `[^0-9.-]`.
 *
 * Returns 0 for unparseable input (never NaN).
 */
export function num(v: unknown, loose = false): number {
  if (typeof v === 'number') return v;
  if (v == null || v === '') return 0;
  const s = loose
    ? String(v).replace(/[^0-9.,-]/g, '').replace(/,/g, '')
    : String(v).replace(/[^0-9.-]/g, '');
  if (s === '' || s === '-') return 0;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/** Like {@link num} but accepts commas (matches legacy mappers behaviour). */
export const numLoose = (v: unknown): number => num(v, true);
