import { describe, it, expect } from 'vitest';
import { bucketCaducidad } from './caducidadBucket';

describe('bucketCaducidad', () => {
  it.each([[-1, 'vencido'], [0, '90'], [90, '90'], [91, '150'], [150, '150'], [151, '210'], [210, '210'], [211, '365'], [365, '365'], [366, '365+']])('%i días → %s', (d, k) => {
    expect(bucketCaducidad(d).key).toBe(k);
  });
});
