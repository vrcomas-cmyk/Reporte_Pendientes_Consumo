import { describe, it, expect, vi, beforeEach } from 'vitest';

const save = vi.fn().mockResolvedValue(undefined);
const fetchMock = vi.fn();

vi.mock('@/repositories', () => ({ catalogRepository: { save, getCached: vi.fn() } }));
vi.mock('./analysisService', () => ({ parseCatalog: vi.fn() }));
vi.mock('@/services/connectorsService', () => ({
  getConnector: vi.fn().mockResolvedValue('https://script.test/exec'),
  CONNECTOR_KEYS: { appscriptCatalogUrl: 'appscript_catalog_url' },
}));
vi.mock('@/lib/logError', () => ({ logInfo: vi.fn(), logWarn: vi.fn(), logError: vi.fn() }));
vi.mock('@/lib/fetchWithTimeout', () => ({ fetchWithTimeout: (...args: unknown[]) => fetchMock(...args) }));

const { checkForCatalogUpdate } = await import('./catalogService');

function respond(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body };
}

/** Responde `?meta=1` con el modifiedTime dado (o falla si es null) y cualquier pestaña con []. */
function mockSheet(modifiedTime: string | null) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes('meta=1')) return modifiedTime ? respond({ modifiedTime }) : respond({ error: 'no meta' }, false);
    return respond([]);
  });
}
const tabCalls = () => fetchMock.mock.calls.filter(([u]) => !String(u).includes('meta=1')).length;

const RECENT = () => new Date().toISOString();
const OLD = () => new Date(Date.now() - 2 * 3600_000).toISOString();

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
  save.mockClear();
});

describe('checkForCatalogUpdate', () => {
  it('sin catálogo local descarga de inmediato', async () => {
    mockSheet('2026-09-30T10:00:00Z');
    const r = await checkForCatalogUpdate({ cachedLoadedAt: null });
    expect(r.changed).toBe(true);
    expect(tabCalls()).toBe(5);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('mismo modifiedTime: no descarga las pestañas', async () => {
    localStorage.setItem('catalog-sync-meta', JSON.stringify({ modifiedTime: 'T1', checkedAt: new Date(Date.now() - 3600_000).toISOString() }));
    mockSheet('T1');
    const r = await checkForCatalogUpdate({ cachedLoadedAt: RECENT() });
    expect(r.changed).toBe(false);
    expect(tabCalls()).toBe(0);
  });

  it('modifiedTime distinto: descarga y guarda el nuevo', async () => {
    localStorage.setItem('catalog-sync-meta', JSON.stringify({ modifiedTime: 'T1', checkedAt: new Date(Date.now() - 3600_000).toISOString() }));
    mockSheet('T2');
    const r = await checkForCatalogUpdate({ cachedLoadedAt: RECENT() });
    expect(r.changed).toBe(true);
    expect(tabCalls()).toBe(5);
    expect(JSON.parse(localStorage.getItem('catalog-sync-meta')!).modifiedTime).toBe('T2');
  });

  it('revisión reciente (<5 min): no consulta nada', async () => {
    localStorage.setItem('catalog-sync-meta', JSON.stringify({ modifiedTime: 'T1', checkedAt: new Date().toISOString() }));
    mockSheet('T2');
    const r = await checkForCatalogUpdate({ cachedLoadedAt: RECENT() });
    expect(r.changed).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sin endpoint meta: refresca solo si el catálogo local es viejo', async () => {
    mockSheet(null);
    expect((await checkForCatalogUpdate({ cachedLoadedAt: RECENT() })).changed).toBe(false);
    localStorage.clear();
    expect((await checkForCatalogUpdate({ cachedLoadedAt: OLD() })).changed).toBe(true);
  });

  it('force descarga aunque no haya cambios', async () => {
    localStorage.setItem('catalog-sync-meta', JSON.stringify({ modifiedTime: 'T1', checkedAt: new Date().toISOString() }));
    mockSheet('T1');
    const r = await checkForCatalogUpdate({ cachedLoadedAt: RECENT(), force: true });
    expect(r.changed).toBe(true);
    expect(tabCalls()).toBe(5);
  });

  it('llamadas simultáneas comparten una sola descarga', async () => {
    mockSheet('T9');
    const [a, b] = await Promise.all([
      checkForCatalogUpdate({ cachedLoadedAt: null }),
      checkForCatalogUpdate({ cachedLoadedAt: null }),
    ]);
    expect(a).toBe(b);
    expect(tabCalls()).toBe(5);
  });

  it('si una pestaña falla la primera vez, reintenta una vez', async () => {
    let fails = 1;
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('meta=1')) return respond({ modifiedTime: 'T1' });
      if (url.includes('tab=Materiales') && fails-- > 0) throw new Error('timeout');
      return respond([]);
    });
    const r = await checkForCatalogUpdate({ cachedLoadedAt: null });
    expect(r.changed).toBe(true);
    expect(tabCalls()).toBe(6);
  });
});
