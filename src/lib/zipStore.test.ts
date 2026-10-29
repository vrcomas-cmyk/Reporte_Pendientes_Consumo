import { describe, expect, it } from 'vitest';
import { crc32, zipStore } from './zipStore';

describe('zipStore', () => {
  it('crc32 estándar', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('arma un ZIP con registro final correcto y nombres UTF-8', () => {
    const zip = zipStore([{ name: 'Reporte_Ana_López.xlsx', data: new Uint8Array([1, 2, 3]) }, { name: 'b.xlsx', data: new Uint8Array([9]) }]);
    const v = new DataView(zip.buffer);
    expect(v.getUint32(0, true)).toBe(0x04034b50);
    const fin = zip.length - 22;
    expect(v.getUint32(fin, true)).toBe(0x06054b50);
    expect(v.getUint16(fin + 10, true)).toBe(2);
    // el directorio central empieza donde dice el registro final
    expect(v.getUint32(v.getUint32(fin + 16, true), true)).toBe(0x02014b50);
  });
});
