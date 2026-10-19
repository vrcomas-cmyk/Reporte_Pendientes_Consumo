// ---------------------------------------------------------------------------
// resumenDisponibilidad.ts · Filas con la forma de "Resumen Sin Sugerencias" (`ResumenSinSugerenciaRow`) armadas
// con los libros crudos, para que el módulo Inventario (pivot Material x Centro) funcione IGUAL con datos de
// Disponibilidad. Puro: sin React, sin red, sin disco. Solo relaciones por Material/Centro/Almacén:
//
//   · Inventario → Disponibilidad: Libre real = Libre Utilización − Entrega a cliente (piso 0 por fila),
//                  y Cant. en Tránsito.
//   · Pendiente  → Seg pedidos (pendiente > 0) por Centro/Almacén/Material. Por omisión solo el LIBERADO (sin bloqueo de crédito ni de
//                  entrega); `modoBloqueo` permite sumar también los bloqueados o ver solo los bloqueados.
//   · Consumo    → Fac_Mensual_CAM (promedio de los 12 meses cerrados, último y penúltimo mes con venta) — el
//                  mismo cálculo que ya usa el detalle de Inventario (`promedioPeriodo`).
//
// Las columnas de `raw` llevan los nombres de las de la hoja del reporte, así `buildRSS` y todo el módulo
// funcionan sin cambios.
// ---------------------------------------------------------------------------
import { libreReal } from './inventoryRules';
import { bloqueoPedido, claveMaterial, indiceColumna, numero, type HojaIndexada } from './pedidos';
import { mesDeKey, periodo12Cerrados, promedioPeriodo, type FacMensualIndex } from './facMensual';
import type { ResumenSinSugerenciaRow } from './types';

/** Qué pendiente cuenta: solo el liberado (por omisión), liberado + bloqueado, o solo el bloqueado (crédito y/o entrega). */
export type ModoBloqueo = 'liberados' | 'todos' | 'bloqueados';

const ALMACENES_GENERALES = ['1030', '1031', '1060'];
const ALMACENES_INV = ['1030', '1031', '1032', '1060'] as const;

interface InvAlmacen {
  libre: number;
  transito: number;
}

interface Pendiente {
  cantidad: number;
  importe: number;
  pedidos: Set<string>;
}

const claveCA = (mat: string, centro: string, alm: string) => `${mat}|${centro}|${alm}`;

/** Los dos últimos meses con venta (cantidad > 0) de un material/centro/almacén en `Fac_Mensual_CAM`. */
function ultimosMeses(fac: FacMensualIndex | null, mat: string, centro: string, alm: string): { mes: string; cant: number }[] {
  const porMes = fac?.get(mat)?.get(centro)?.get(alm);
  if (!porMes) return [];
  return [...porMes.entries()]
    .filter(([, cant]) => cant > 0)
    .sort((a, b) => b[0] - a[0])
    .slice(0, 2)
    .map(([k, cant]) => ({ mes: mesDeKey(k), cant }));
}

/** Arma una fila por Material/Centro/Almacén presente en Disponibilidad o con pedidos pendientes. */
export function filasResumenDisponibilidad(
  dispo: HojaIndexada,
  pedidos: HojaIndexada | undefined,
  fac: FacMensualIndex | null,
  modoBloqueo: ModoBloqueo = 'liberados',
): ResumenSinSugerenciaRow[] {
  const iCentro = indiceColumna(dispo.nombres, ['centro']);
  const iAlmacen = indiceColumna(dispo.nombres, ['almacen']);
  const iLibre = indiceColumna(dispo.nombres, ['libre utilizacion']);
  const iEntrega = indiceColumna(dispo.nombres, ['entrega a cliente']);
  const iTransito = indiceColumna(dispo.nombres, ['cant. en transito', 'transito']);
  const iDesc = indiceColumna(dispo.nombres, ['descripcion', 'texto breve', 'texto material']);

  // Inventario por material|centro|almacén (Libre real) y descripción por material.
  const inv = new Map<string, InvAlmacen>();
  const desc = new Map<string, string>();
  for (const f of dispo.rows) {
    const mat = claveMaterial(f[dispo.idxMaterial]);
    if (!mat) continue;
    const k = claveCA(mat, claveMaterial(f[iCentro]), claveMaterial(f[iAlmacen]));
    const a = inv.get(k) ?? { libre: 0, transito: 0 };
    a.libre += libreReal(numero(f[iLibre]), numero(f[iEntrega]));
    a.transito += numero(f[iTransito]);
    inv.set(k, a);
    if (!desc.has(mat) && iDesc !== -1) desc.set(mat, String(f[iDesc] ?? '').trim());
  }

  // Pendiente por material|centro|almacén (solo pendiente > 0), desde Seg pedidos.
  const pend = new Map<string, Pendiente>();
  if (pedidos) {
    const c = (alias: string[]) => indiceColumna(pedidos.nombres, alias);
    const [iPed, iPCentro, iPAlm, iPendiente, iPrecio, iPDesc] = [c(['pedido']), c(['centro']), c(['almacen']), c(['pendiente']), c(['precio']), c(['texto material'])];
    const [iCredito, iBloqueo] = [c(['sts. cred.']), c(['bloqueo ent.'])];
    for (const f of pedidos.rows) {
      const cantidad = numero(f[iPendiente]);
      const mat = claveMaterial(f[pedidos.idxMaterial]);
      if (cantidad <= 0 || !mat) continue;
      // Por omisión solo el pendiente LIBERADO: un pedido con bloqueo de crédito o de entrega puede no liberarse y cancelarse, así que no cuenta.
      const bloqueado = bloqueoPedido(String(f[iCredito] ?? '').trim(), String(f[iBloqueo] ?? '').trim()) !== '';
      if (modoBloqueo === 'liberados' && bloqueado) continue;
      if (modoBloqueo === 'bloqueados' && !bloqueado) continue;
      const k = claveCA(mat, claveMaterial(f[iPCentro]), claveMaterial(f[iPAlm]));
      const p = pend.get(k) ?? { cantidad: 0, importe: 0, pedidos: new Set<string>() };
      p.cantidad += cantidad;
      p.importe += cantidad * numero(f[iPrecio]);
      p.pedidos.add(String(f[iPed] ?? '').trim());
      pend.set(k, p);
      if (!desc.has(mat) && iPDesc !== -1) desc.set(mat, String(f[iPDesc] ?? '').trim());
    }
  }

  const claves = new Set<string>([...inv.keys(), ...pend.keys()]);

  // Inventario por almacén de cada material|centro (igual para todas las filas del centro) y totales por material.
  const invCentro = new Map<string, Record<string, number>>();
  const sumaInv = new Map<string, number>();
  const sumaPend = new Map<string, number>();
  for (const [k, a] of inv) {
    const [mat = '', centro = '', alm = ''] = k.split('|');
    const kc = `${mat}|${centro}`;
    const porAlm = invCentro.get(kc) ?? { '1030': 0, '1031': 0, '1032': 0, '1060': 0 };
    if (alm in porAlm) porAlm[alm] = (porAlm[alm] ?? 0) + a.libre;
    invCentro.set(kc, porAlm);
    if (ALMACENES_GENERALES.includes(alm)) sumaInv.set(mat, (sumaInv.get(mat) ?? 0) + a.libre);
  }
  for (const [k, p] of pend) {
    const mat = k.split('|')[0] ?? '';
    sumaPend.set(mat, (sumaPend.get(mat) ?? 0) + p.cantidad);
  }

  const periodo = periodo12Cerrados(fac);
  const rows: ResumenSinSugerenciaRow[] = [];

  for (const k of claves) {
    const [mat = '', centro = '', alm = ''] = k.split('|');
    const a = inv.get(k);
    const p = pend.get(k);
    const porAlm = invCentro.get(`${mat}|${centro}`) ?? { '1030': 0, '1031': 0, '1032': 0, '1060': 0 };
    const prom = periodo ? promedioPeriodo(fac, { material: mat, centro, almacen: alm }, periodo.desde, periodo.hasta).promedio : 0;
    const invAlm = porAlm[alm] ?? 0;
    const meses = prom > 0 ? invAlm / prom : 0;
    const [ult, pen] = ultimosMeses(fac, mat, centro, alm);
    const d1031 = invCentro.get(`${mat}|1031`);

    rows.push({
      centro,
      almacen: alm,
      pedidos: String(p?.pedidos.size ?? 0),
      material: mat,
      descripcion: desc.get(mat) ?? '',
      cantidadPendiente: p?.cantidad ?? 0,
      importePendiente: p?.importe ?? 0,
      promedioConsumo12M: prom,
      mesesInventario: meses,
      sumaInventario: sumaInv.get(mat) ?? 0,
      sumaPendiente: sumaPend.get(mat) ?? 0,
      statusRevision: '',
      fuente: '',
      raw: {
        Centro: centro,
        Almacen: alm,
        Pedidos: String(p?.pedidos.size ?? 0),
        Material: mat,
        Descripcion: desc.get(mat) ?? '',
        Cantidad_Pendiente: p?.cantidad ?? 0,
        Importe_Pendiente: p?.importe ?? 0,
        Promedio_Consumo_12M: prom,
        Ultimo_Mes_Consumo: ult?.mes ?? '',
        Cantidad_Ultimo_Mes: ult?.cant ?? 0,
        Penultimo_Mes_Consumo: pen?.mes ?? '',
        Cantidad_Penultimo_Mes: pen?.cant ?? 0,
        Meses_Inventario: meses,
        ...Object.fromEntries(ALMACENES_INV.map((x) => [`Inv ${x}`, porAlm[x] ?? 0])),
        'Cant. en Tránsito': a?.transito ?? 0,
        'Disponible 1031-1030': d1031?.['1030'] ?? 0,
        'Disponible 1031-1032': d1031?.['1032'] ?? 0,
        'Suma inventario': sumaInv.get(mat) ?? 0,
        'Suma pendiente': sumaPend.get(mat) ?? 0,
        'Status Revisión': '',
        Fuente: '',
      },
    });
  }
  return rows;
}
