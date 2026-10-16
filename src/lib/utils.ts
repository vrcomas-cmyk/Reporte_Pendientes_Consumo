import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { excelDateToIso } from '@/core/mappers';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(n: number, digits = 0): string {
  return n.toLocaleString('es-MX', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function formatCurrency(n: number): string {
  return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: '2-digit' });
}

const MESES_ABR = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Formats an internal ISO (yyyy-mm-dd) date as dd/mmm/aaaa, e.g. "16/jul/2026" —
 * the display format expected for fechas de caducidad. Parses the ISO string
 * directly (no `Date` object) so it can't shift a day due to timezone offset. */
export function formatFechaCaducidad(iso: string | null | undefined): string {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) {
    // Self-heals records saved (catalog or analysis, in IndexedDB) before
    // `excelDateToIso` learned to detect epoch-ms values coming back as a raw
    // number/digit-string (e.g. "1931040000000") — normalizes on read instead
    // of silently printing the raw value until the user re-syncs everything.
    const normalized = excelDateToIso(iso);
    if (normalized) return formatFechaCaducidad(normalized);
    return String(iso);
  }
  const [, y, mo, d] = m;
  const mes = MESES_ABR[Number(mo) - 1] ?? mo;
  return `${d}/${mes}/${y}`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('es-MX', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${m}m ${rem}s`;
}

/** "12.3%" (es-MX). `p` ya viene en porcentaje (12.3 = 12.3 %). */
export function formatPercent(p: number, digits = 1): string {
  return `${p.toLocaleString('es-MX', { maximumFractionDigits: digits, minimumFractionDigits: digits })}%`;
}

/** Cifra compacta para tarjetas: 12,345 → "12.3 k", 2,500,000 → "2.5 M", 3.2e9 → "3.2 mil M"; menos de 10,000 se muestra completa. */
export function formatCompact(n: number, digits = 1): string {
  const a = Math.abs(n);
  const signo = n < 0 ? '-' : '';
  const fmt = (v: number) => v.toLocaleString('es-MX', { maximumFractionDigits: digits });
  if (a >= 1e9) return `${signo}${fmt(a / 1e9)} mil M`;
  if (a >= 1e6) return `${signo}${fmt(a / 1e6)} M`;
  if (a >= 1e4) return `${signo}${fmt(a / 1e3)} k`;
  return formatNumber(n);
}

/** Variación porcentual con flecha y tono (▲ verde / ▼ rojo / 0 neutro) — una sola forma de mostrarla en toda la app. */
export function formatDelta(p: number, digits = 1): { texto: string; tono: 'success' | 'danger' | 'neutral' } {
  if (!Number.isFinite(p) || Math.abs(p) < 10 ** -digits / 2) return { texto: formatPercent(0, digits), tono: 'neutral' };
  return { texto: `${p > 0 ? '▲' : '▼'} ${formatPercent(Math.abs(p), digits)}`, tono: p > 0 ? 'success' : 'danger' };
}
