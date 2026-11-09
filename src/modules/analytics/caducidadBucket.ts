/** Rangos de caducidad con color propio (clases de `StatePill`): vencido, ≤90, 91–150, 151–210, 211–365 y >365 días. */
export interface BucketCaducidad { key: string; cls: string; rango: string }

export const BUCKETS_CADUCIDAD: BucketCaducidad[] = [
  { key: 'vencido', cls: 'cadVencido', rango: 'Vencido' },
  { key: '90', cls: 'cad90', rango: '≤ 90 d' },
  { key: '150', cls: 'cad150', rango: '91–150 d' },
  { key: '210', cls: 'cad210', rango: '151–210 d' },
  { key: '365', cls: 'cad365', rango: '211–365 d' },
  { key: '365+', cls: 'cad365p', rango: '> 365 d' },
];

export function bucketCaducidad(dias: number): BucketCaducidad {
  if (dias < 0) return BUCKETS_CADUCIDAD[0]!;
  if (dias <= 90) return BUCKETS_CADUCIDAD[1]!;
  if (dias <= 150) return BUCKETS_CADUCIDAD[2]!;
  if (dias <= 210) return BUCKETS_CADUCIDAD[3]!;
  if (dias <= 365) return BUCKETS_CADUCIDAD[4]!;
  return BUCKETS_CADUCIDAD[5]!;
}
