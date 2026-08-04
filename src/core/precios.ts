// ---------------------------------------------------------------------------
// precios.ts · Dispersión de precios ENTRE CLIENTES para un mismo material —
// distinto de `precioMin`/`precioMax`/`precioProm` en ConsumoRow, que son el
// rango histórico de UN cliente (su propia volatilidad de precio en el
// tiempo). Aquí se compara, para un mismo material, el precio unitario
// vigente que paga cada cliente distinto — la señal real de fuga de margen
// ("por qué el cliente X paga el doble que el cliente Y por lo mismo").
// ---------------------------------------------------------------------------
import type { ConsumoRow } from './types';
import { norm } from '@/lib/text';

/** Tope de spread razonable — arriba de esto ya no es "el mismo material a
 * precio distinto" sino casi siempre basura de datos: códigos administrativos
 * sin descripción real (p.ej. "SANCIONES Y PENALIZACIONES" cargado como
 * material), errores de captura (un dígito de más), o precio en otra unidad.
 * Medido contra un reporte real: bajar el tope de "sin límite" a 5x (500%)
 * excluye solo 48 de 966 materiales con dispersión — todos degenerados (sin
 * descripción, spreads de miles de veces) — y deja intactos los reales (el
 * mayor legítimo observado fue ~4.7x, un gel antiséptico institucional vs.
 * minorista). Exportado para que la UI pueda mostrar "N excluidos" si hace falta. */
export const MAX_PLAUSIBLE_SPREAD = 5;

export interface PrecioCliente {
  solicitante: string;
  destinatario: string;
  razonSocial: string;
  precioUnitario: number;
}

export interface PrecioDispersionEntry {
  material: string;
  descripcion: string;
  /** Clientes distintos (por destinatario) con precio unitario > 0 para este material. */
  nClientes: number;
  precioMin: number;
  precioMax: number;
  /** Promedio simple entre clientes (no ponderado por volumen) — cada cliente cuenta una vez. */
  precioPromedio: number;
  /** (max - min) / min. */
  spread: number;
  clienteMin: PrecioCliente;
  clienteMax: PrecioCliente;
}

/**
 * Para cada material, agrupa el precio unitario vigente (`precioUnitarioUltima`)
 * por cliente distinto (destinatario) y calcula el spread entre el que paga
 * menos y el que paga más. Solo incluye materiales con al menos 2 clientes
 * distintos con precio > 0 — un solo cliente no tiene con qué compararse.
 * Ordenado por spread descendente (mayor fuga de margen primero).
 */
export function buildPrecioDispersion(consumo: ConsumoRow[]): PrecioDispersionEntry[] {
  const byMaterial = new Map<string, { descripcion: string; porCliente: Map<string, PrecioCliente> }>();

  for (const r of consumo) {
    const precio = r.precioUnitarioUltima;
    if (!(precio > 0)) continue;
    const m = norm(r.material);
    if (!m) continue;
    const dest = norm(r.destinatario) || norm(r.solicitante);
    if (!dest) continue;

    let bucket = byMaterial.get(m);
    if (!bucket) {
      bucket = { descripcion: r.textoMaterial, porCliente: new Map() };
      byMaterial.set(m, bucket);
    }
    // Un cliente puede tener varias filas de Consumo para el mismo material
    // (distintos centros) — nos quedamos con el precio unitario más alto
    // reportado para ese cliente+material, que es el que de verdad refleja
    // lo que paga (evita que un centro con dato incompleto/0 diluya el real).
    const existing = bucket.porCliente.get(dest);
    if (!existing || precio > existing.precioUnitario) {
      bucket.porCliente.set(dest, { solicitante: r.solicitante, destinatario: dest, razonSocial: r.razonSocial, precioUnitario: precio });
    }
  }

  const out: PrecioDispersionEntry[] = [];
  byMaterial.forEach((bucket, material) => {
    if (!bucket.descripcion.trim()) return; // sin descripción real casi siempre es un código administrativo, no un producto
    const clientes = [...bucket.porCliente.values()];
    if (clientes.length < 2) return;
    let clienteMin = clientes[0];
    let clienteMax = clientes[0];
    let suma = 0;
    for (const c of clientes) {
      if (c.precioUnitario < clienteMin.precioUnitario) clienteMin = c;
      if (c.precioUnitario > clienteMax.precioUnitario) clienteMax = c;
      suma += c.precioUnitario;
    }
    if (clienteMax.precioUnitario <= clienteMin.precioUnitario) return; // sin dispersión real
    const spread = (clienteMax.precioUnitario - clienteMin.precioUnitario) / clienteMin.precioUnitario;
    if (spread > MAX_PLAUSIBLE_SPREAD) return; // ver MAX_PLAUSIBLE_SPREAD arriba
    out.push({
      material,
      descripcion: bucket.descripcion,
      nClientes: clientes.length,
      precioMin: clienteMin.precioUnitario,
      precioMax: clienteMax.precioUnitario,
      precioPromedio: suma / clientes.length,
      spread,
      clienteMin,
      clienteMax,
    });
  });

  return out.sort((a, b) => b.spread - a.spread);
}
