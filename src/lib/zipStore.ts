// ZIP mínimo sin compresión (método "store"): los .xlsx ya van comprimidos, así que basta para juntar varios archivos en uno y mandarlo por correo o WhatsApp.

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(datos: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < datos.length; i++) c = TABLA_CRC[(c ^ datos[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ArchivoZip { name: string; data: Uint8Array }

export function zipStore(archivos: readonly ArchivoZip[], fecha: Date = new Date()): Uint8Array {
  const enc = new TextEncoder();
  const hora = (fecha.getHours() << 11) | (fecha.getMinutes() << 5) | (fecha.getSeconds() >> 1);
  const dia = ((Math.max(fecha.getFullYear(), 1980) - 1980) << 9) | ((fecha.getMonth() + 1) << 5) | fecha.getDate();
  const nombres = archivos.map((a) => enc.encode(a.name));
  const crcs = archivos.map((a) => crc32(a.data));
  const tamLocal = archivos.reduce((s, a, i) => s + 30 + nombres[i]!.length + a.data.length, 0);
  const tamCentral = nombres.reduce((s, n) => s + 46 + n.length, 0);
  const out = new Uint8Array(tamLocal + tamCentral + 22);
  const v = new DataView(out.buffer);
  const offsets: number[] = [];
  let p = 0;
  archivos.forEach((a, i) => {
    offsets.push(p);
    v.setUint32(p, 0x04034b50, true); v.setUint16(p + 4, 20, true); v.setUint16(p + 6, 0x0800, true); v.setUint16(p + 8, 0, true);
    v.setUint16(p + 10, hora, true); v.setUint16(p + 12, dia, true); v.setUint32(p + 14, crcs[i]!, true);
    v.setUint32(p + 18, a.data.length, true); v.setUint32(p + 22, a.data.length, true); v.setUint16(p + 26, nombres[i]!.length, true); v.setUint16(p + 28, 0, true);
    out.set(nombres[i]!, p + 30);
    out.set(a.data, p + 30 + nombres[i]!.length);
    p += 30 + nombres[i]!.length + a.data.length;
  });
  const inicioCentral = p;
  archivos.forEach((a, i) => {
    v.setUint32(p, 0x02014b50, true); v.setUint16(p + 4, 20, true); v.setUint16(p + 6, 20, true); v.setUint16(p + 8, 0x0800, true); v.setUint16(p + 10, 0, true);
    v.setUint16(p + 12, hora, true); v.setUint16(p + 14, dia, true); v.setUint32(p + 16, crcs[i]!, true);
    v.setUint32(p + 20, a.data.length, true); v.setUint32(p + 24, a.data.length, true); v.setUint16(p + 28, nombres[i]!.length, true);
    v.setUint16(p + 30, 0, true); v.setUint16(p + 32, 0, true); v.setUint16(p + 34, 0, true); v.setUint16(p + 36, 0, true); v.setUint32(p + 38, 0, true);
    v.setUint32(p + 42, offsets[i]!, true);
    out.set(nombres[i]!, p + 46);
    p += 46 + nombres[i]!.length;
  });
  v.setUint32(p, 0x06054b50, true); v.setUint16(p + 4, 0, true); v.setUint16(p + 6, 0, true);
  v.setUint16(p + 8, archivos.length, true); v.setUint16(p + 10, archivos.length, true);
  v.setUint32(p + 12, tamCentral, true); v.setUint32(p + 16, inicioCentral, true); v.setUint16(p + 20, 0, true);
  return out;
}

/** Descarga un ZIP ya armado con el navegador. */
export function descargarZip(nombre: string, archivos: readonly ArchivoZip[]): void {
  const blob = new Blob([zipStore(archivos) as BlobPart], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
