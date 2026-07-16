import { LocalCatalogRepository } from './LocalCatalogRepository';
import { LocalReportRepository } from './LocalReportRepository';
import type { CatalogRepository } from './CatalogRepository';
import type { ReportRepository } from './ReportRepository';

export type { CatalogRepository } from './CatalogRepository';
export type { ReportRepository } from './ReportRepository';

/** Simple factory: swap 'local' for a future 'supabase'/'api' backend
 * without touching services/UI code. Kept intentionally minimal — no
 * plugin registry, just a switch — since only one backend exists today. */
export type RepositoryBackend = 'local';

export function createCatalogRepository(backend: RepositoryBackend = 'local'): CatalogRepository {
  switch (backend) {
    case 'local':
    default:
      return new LocalCatalogRepository();
  }
}

export function createReportRepository(backend: RepositoryBackend = 'local'): ReportRepository {
  switch (backend) {
    case 'local':
    default:
      return new LocalReportRepository();
  }
}

export const catalogRepository = createCatalogRepository();
export const reportRepository = createReportRepository();
