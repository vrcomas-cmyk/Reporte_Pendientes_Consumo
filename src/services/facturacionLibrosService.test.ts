import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COLUMNAS_FAC, type FilaFac } from '@/core/facturacionLibros';
import type { FacturacionLibroRow } from '@/repositories/db';
import type { DerivadosFac } from '@/repositories/facturacionCache';
import type { RFIndex } from '@/core/resumenFac';

// El servicio habla con Apps Script e IndexedDB: se simulan ambos (sin red ni base).
const guardados = new Map<string, FacturacionLibroRow>();
let derivadosGuardados: DerivadosFac | null = null;
vi.mock('@/repositories/facturacionCache', () => ({
  getLibrosFacturacion: async () => [...guardados.values()],
  getLibrosFacturacionDeAUno: async () => [...guardados.values()],
  getIdsLibrosFacturacion: async () => [...guardados.keys()],
  getLibroFacturacion: async (id: string) => guardados.get(id),
  getMetaLibrosFacturacion: async () => [...guardados.values()].map((g) => ({ id: g.id, nombre: g.nombre, orden: g.orden, ultimaModificacion: g.ultimaModificacion, filas: g.rows.length })),
  putLibroFacturacion: async (row: FacturacionLibroRow) => { guardados.set(row.id, row); },
  deleteLibrosFacturacion: async (ids: string[]) => { ids.forEach((id) => guardados.delete(id)); },
  FAC_DERIVADOS_ESQUEMA: 1,
  guardarDerivadosFac: async (d: DerivadosFac) => { derivadosGuardados = d; },
  leerDerivadosFac: async (firma: string) => (derivadosGuardados && derivadosGuardados.firma === firma ? derivadosGuardados : null),
}));
vi.mock('@/services/pedidosService', () => ({
  pedidosConfigurado: async () => true,
  requireUrl: async () => 'http://apps-script.test/exec',
  withRetries: async <T,>(_label: string, fn: () => Promise<T>) => fn(),
  explicarFalla: (e: unknown) => (e instanceof Error ? e : new Error(String(e))),
}));
vi.mock('@/lib/logError', () => ({ logInfo: async () => undefined, logWarn: async () => undefined }));

const fila = (mes: string, material: string, cant: number, imp: number): FilaFac => [mes, '1', 'CLIENTE', '2', material, 'TEXTO', '1018', '1031', '15', '24', cant, imp];

interface LibroMock { id: string; nombre: string; orden: number; mod: string; bloques: FilaFac[][] }
let libros: LibroMock[] = [];
let llamadas: string[] = [];
let fallar: string | null = null;

function instalarFetch() {
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const url = new URL(input);
    const accion = url.searchParams.get('action');
    llamadas.push(accion === 'fac_chunk' ? `chunk:${url.searchParams.get('fileId')}:${url.searchParams.get('offset')}` : String(accion));
    if (accion === 'fac_manifest') {
      return new Response(JSON.stringify({ ok: true, libros: libros.map((l) => ({ id: l.id, nombre: l.nombre, periodo: l.nombre, orden: l.orden, ultimaModificacion: l.mod, totalRows: l.bloques.length * 5000, chunkSize: 5000 })) }));
    }
    const libro = libros.find((l) => l.id === url.searchParams.get('fileId'));
    if (!libro || fallar === libro.id) return new Response('boom', { status: 500 });
    const bloque = libro.bloques[Number(url.searchParams.get('offset')) / 5000] ?? [];
    return new Response(JSON.stringify({ ok: true, columnas: COLUMNAS_FAC, rows: bloque }));
  }));
}

async function cargar() {
  vi.resetModules(); // el servicio memoriza el último resultado: cada prueba parte limpia
  return (await import('./facturacionLibrosService')).cargarFacturacionLibros();
}

describe('cargarFacturacionLibros', () => {
  beforeEach(() => {
    guardados.clear();
    derivadosGuardados = null;
    llamadas = [];
    fallar = null;
    libros = [
      { id: 'A', nombre: '2Q 2026', orden: 20262, mod: 'm1', bloques: [[fila('05/2026', '100', 10, 100)]] },
      { id: 'B', nombre: '3Q 2026', orden: 20263, mod: 'm2', bloques: [[fila('09/2026', '100', 5, 50)], [fila('09/2026', '100', 7, 70), fila('09/2026', '200', 1, 10)]] },
    ];
    instalarFetch();
  });

  it('primera vez: baja todos los bloques, une los duplicados entre bloques y arma las dos pestañas', async () => {
    const { resumenFac, facMensualCam } = await cargar();
    expect(llamadas.filter((l) => l.startsWith('chunk'))).toHaveLength(3);
    const sep100 = resumenFac.rows.find((r) => r[4] === '100' && r[6] === '09/2026');
    expect(sep100?.[7]).toBe(12); // 5 + 7 de dos bloques
    expect(sep100?.[8]).toBe(120);
    expect(facMensualCam.rowCount).toBe(3);
    expect(guardados.size).toBe(2); // quedan en caché
  });

  it('solo vuelve a bajar el libro que cambió en Drive (los demás salen de la caché)', async () => {
    await cargar();
    llamadas = [];
    libros[1]!.mod = 'm3';
    libros[1]!.bloques = [[fila('09/2026', '100', 99, 990)]];
    const { resumenFac } = await cargar();
    expect(llamadas).toEqual(['fac_manifest', 'chunk:B:0']);
    expect(resumenFac.rows.find((r) => r[6] === '05/2026')?.[7]).toBe(10); // A, de caché
    expect(resumenFac.rows.find((r) => r[6] === '09/2026' && r[4] === '100')?.[7]).toBe(99); // B, nuevo (reemplaza al anterior)
  });

  it('un libro que falla usa su copia anterior en vez de dejar totales incompletos', async () => {
    await cargar();
    libros[1]!.mod = 'm3';
    fallar = 'B';
    const { resumenFac } = await cargar();
    expect(resumenFac.rows.find((r) => r[6] === '09/2026' && r[4] === '100')?.[7]).toBe(12); // la copia vieja de B
  });

  it('un libro que falla SIN copia anterior lanza error (no se entregan totales incompletos)', async () => {
    fallar = 'A';
    await expect(cargar()).rejects.toThrow(/2Q 2026/);
  });

  it('sync sin cambios en Drive: solo consulta el manifiesto y NO toca los datos del store (no se recalcula nada)', async () => {
    vi.resetModules();
    const { syncFacturacion } = await import('./facturacionLibrosService');
    const { useFacturacionStore } = await import('@/store/facturacionStore');
    await syncFacturacion();
    const antes = useFacturacionStore.getState().resumenFac;
    expect(antes?.length).toBeGreaterThan(0);
    llamadas = [];
    await syncFacturacion();
    expect(llamadas).toEqual(['fac_manifest']);
    expect(useFacturacionStore.getState().resumenFac).toBe(antes); // misma referencia
    expect(useFacturacionStore.getState().syncing).toBe(false);
  });

  it('sync con un libro cambiado: baja solo ese y entrega datos nuevos', async () => {
    vi.resetModules();
    const { syncFacturacion } = await import('./facturacionLibrosService');
    const { useFacturacionStore } = await import('@/store/facturacionStore');
    await syncFacturacion();
    const antes = useFacturacionStore.getState().resumenFac;
    llamadas = [];
    libros[1]!.mod = 'm3';
    libros[1]!.bloques = [[fila('09/2026', '100', 99, 990)]];
    await syncFacturacion();
    expect(llamadas).toEqual(['fac_manifest', 'chunk:B:0']);
    expect(useFacturacionStore.getState().resumenFac).not.toBe(antes);
  });

  it('forzar: si la descarga falla, la copia anterior sigue en la caché (no se borra antes)', async () => {
    vi.resetModules();
    const { syncFacturacion } = await import('./facturacionLibrosService');
    await syncFacturacion();
    fallar = 'B';
    await expect(syncFacturacion({ forzar: true })).rejects.toThrow();
    expect(guardados.size).toBe(2);
  });

  it('restaurar: con los índices ya calculados vigentes los usa tal cual (no reconstruye desde los libros)', async () => {
    vi.resetModules();
    const s1 = await import('./facturacionLibrosService');
    const st1 = (await import('@/store/facturacionStore')).useFacturacionStore;
    await s1.syncFacturacion();
    const filas = st1.getState().resumenFac!;
    const rf = { marca: 'rf' } as unknown as RFIndex;
    await s1.persistirDerivadosFacturacion(filas, rf, []);
    expect(derivadosGuardados?.resumenFac).toBe(filas);

    // Sesión nueva: módulos y store vacíos, la "base" conserva libros y derivados.
    vi.resetModules();
    const s2 = await import('./facturacionLibrosService');
    const st2 = (await import('@/store/facturacionStore')).useFacturacionStore;
    await s2.restaurarFacturacion();
    expect(st2.getState().resumenFac?.length).toBe(filas.length);
    expect(st2.getState().derivados?.rf).toBe(rf);
    expect(st2.getState().derivados?.filas).toBe(st2.getState().resumenFac);
  });

  it('restaurar: si un libro cambió después de calcular, los índices guardados se descartan y se arma desde los libros', async () => {
    vi.resetModules();
    const s1 = await import('./facturacionLibrosService');
    const st1 = (await import('@/store/facturacionStore')).useFacturacionStore;
    await s1.syncFacturacion();
    await s1.persistirDerivadosFacturacion(st1.getState().resumenFac!, {} as RFIndex, []);
    guardados.get('B')!.ultimaModificacion = 'otra-fecha'; // p. ej. el sync del reporte bajó una versión nueva de ese libro

    vi.resetModules();
    const s2 = await import('./facturacionLibrosService');
    const st2 = (await import('@/store/facturacionStore')).useFacturacionStore;
    await s2.restaurarFacturacion();
    expect(st2.getState().resumenFac?.length).toBeGreaterThan(0);
    expect(st2.getState().derivados).toBeNull();
  });

  it('persistirDerivadosFacturacion no guarda si las filas ya no son las del store (llegó un sync nuevo mientras se calculaba)', async () => {
    vi.resetModules();
    const s1 = await import('./facturacionLibrosService');
    const st1 = (await import('@/store/facturacionStore')).useFacturacionStore;
    await s1.syncFacturacion();
    const viejas = st1.getState().resumenFac!;
    libros[1]!.mod = 'm9';
    libros[1]!.bloques = [[fila('09/2026', '100', 1, 10)]];
    await s1.syncFacturacion();
    derivadosGuardados = null;
    await s1.persistirDerivadosFacturacion(viejas, {} as RFIndex, []);
    expect(derivadosGuardados).toBeNull();
  });
});
