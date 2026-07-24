import { LocalCatalogRepository } from './LocalCatalogRepository';
import { LocalReportRepository } from './LocalReportRepository';
import { SupabaseReportRepository } from './SupabaseReportRepository';
import { LocalSolicitudRepository } from './LocalSolicitudRepository';
import type { CatalogRepository } from './CatalogRepository';
import type { ReportRepository } from './ReportRepository';
import type { SolicitudRepository } from './SolicitudRepository';

export type { CatalogRepository } from './CatalogRepository';
export type { ReportRepository } from './ReportRepository';
export type { SolicitudRepository } from './SolicitudRepository';

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

export const catalogRepository = createCatalogRepository();
export const reportRepository = createReportRepository();
export const solicitudRepository = createSolicitudRepository();
