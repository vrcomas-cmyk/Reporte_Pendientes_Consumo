import { LocalCatalogRepository } from './LocalCatalogRepository';
import { LocalReportRepository } from './LocalReportRepository';
import { SupabaseReportRepository } from './SupabaseReportRepository';
import { LocalSolicitudRepository } from './LocalSolicitudRepository';
import { LocalOportunidadRepository } from './LocalOportunidadRepository';
import { SupabaseOportunidadRepository } from './SupabaseOportunidadRepository';
import { LocalClienteConocimientoRepository } from './LocalClienteConocimientoRepository';
import { SupabaseClienteConocimientoRepository } from './SupabaseClienteConocimientoRepository';
import { LocalOfertaRepository } from './LocalOfertaRepository';
import { SupabaseOfertaRepository } from './SupabaseOfertaRepository';
import type { CatalogRepository } from './CatalogRepository';
import type { ReportRepository } from './ReportRepository';
import type { SolicitudRepository } from './SolicitudRepository';
import type { OportunidadRepository } from './OportunidadRepository';
import type { ClienteConocimientoRepository } from './ClienteConocimientoRepository';
import type { OfertaRepository } from './OfertaRepository';

export type { CatalogRepository } from './CatalogRepository';
export type { ReportRepository } from './ReportRepository';
export type { SolicitudRepository } from './SolicitudRepository';
export type { OportunidadRepository } from './OportunidadRepository';
export type { ClienteConocimientoRepository } from './ClienteConocimientoRepository';
export type { OfertaRepository } from './OfertaRepository';

/** Simple factory: swap backends without touching services/UI code.
 * 'supabase' moves history/settings/logs to Supabase (per-user, RLS-scoped)
 * while analyses/catalog stay local — see fase 1 del plan de migración. */
export type RepositoryBackend = 'local' | 'supabase';

export function createCatalogRepository(backend: RepositoryBackend = 'local'): CatalogRepository {
  switch (backend) {
    case 'local':
    default:
      return new LocalCatalogRepository();
  }
}

export function createReportRepository(backend: RepositoryBackend = 'supabase'): ReportRepository {
  switch (backend) {
    case 'supabase':
      return new SupabaseReportRepository();
    case 'local':
    default:
      return new LocalReportRepository();
  }
}

/** DRP requests are always local — there's no Supabase backend for them yet
 * (they're small, per-device, and independent of the history/logs/settings
 * "fase 1" migration). */
export function createSolicitudRepository(): SolicitudRepository {
  return new LocalSolicitudRepository();
}

/** El conocimiento del módulo Oportunidades es del equipo (no por
 * dispositivo) — Supabase por defecto, con Dexie como caché/fallback offline
 * (ver SupabaseOportunidadRepository). */
export function createOportunidadRepository(backend: RepositoryBackend = 'supabase'): OportunidadRepository {
  switch (backend) {
    case 'supabase':
      return new SupabaseOportunidadRepository();
    case 'local':
    default:
      return new LocalOportunidadRepository();
  }
}

/** Ficha de cliente (fase 2): mismo criterio que Oportunidad — conocimiento
 * del equipo, Supabase por defecto con Dexie como caché offline. */
export function createClienteConocimientoRepository(backend: RepositoryBackend = 'supabase'): ClienteConocimientoRepository {
  switch (backend) {
    case 'supabase':
      return new SupabaseClienteConocimientoRepository();
    case 'local':
    default:
      return new LocalClienteConocimientoRepository();
  }
}

/** Ofertas (fase 3): mismo criterio — conocimiento del equipo. */
export function createOfertaRepository(backend: RepositoryBackend = 'supabase'): OfertaRepository {
  switch (backend) {
    case 'supabase':
      return new SupabaseOfertaRepository();
    case 'local':
    default:
      return new LocalOfertaRepository();
  }
}

export const catalogRepository = createCatalogRepository();
export const reportRepository = createReportRepository();
export const solicitudRepository = createSolicitudRepository();
export const oportunidadRepository = createOportunidadRepository();
export const clienteConocimientoRepository = createClienteConocimientoRepository();
export const ofertaRepository = createOfertaRepository();
