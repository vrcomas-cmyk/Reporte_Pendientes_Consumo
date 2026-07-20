import { LocalCatalogRepository } from './LocalCatalogRepository';
import { LocalReportRepository } from './LocalReportRepository';
import { SupabaseReportRepository } from './SupabaseReportRepository';
import type { CatalogRepository } from './CatalogRepository';
import type { ReportRepository } from './ReportRepository';

export type { CatalogRepository } from './CatalogRepository';
export type { ReportRepository } from './ReportRepository';

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

export const catalogRepository = createCatalogRepository();
export const reportRepository = createReportRepository();
