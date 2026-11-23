// ---------------------------------------------------------------------------
// sincronizacionLocal.ts · «Primero lo local» para datos del equipo que ya se espejan en IndexedDB (oportunidades, ofertas, clientes, traslados…).
//
// Antes cada F5 volvía a pedir TODAS esas tablas a Supabase aunque se hubieran sincronizado un minuto antes. Ahora, si la última sincronización buena fue hace menos de
// `ttlMs`, se lee del espejo local (Dexie) sin tocar la red; si no, se consulta al servidor (que además renueva el espejo) y se anota la marca.
//
// Salvaguardas:
//  · la marca guarda cuántos registros había: si el espejo local trae otra cantidad (el navegador borró IndexedDB, o se agregó algo a mano) se va al servidor, así nunca se
//    muestra vacío o incompleto por confiar en una marca vieja;
//  · si leer lo local falla, se va al servidor;
//  · la marca es por usuario y su clave lleva «sync», por lo que `sesionService` la borra al cerrar sesión.
// ---------------------------------------------------------------------------
import { sesionLocal } from '@/lib/sesionLocal';

interface Marca { ts: number; n: number }

const claveMarca = (clave: string, uid: string) => `degasa_sync_${clave}:${uid}`;

function leerMarca(k: string): Marca | null {
  try {
    const m = JSON.parse(localStorage.getItem(k) ?? 'null') as Marca | null;
    return m && typeof m.ts === 'number' && typeof m.n === 'number' ? m : null;
  } catch { return null; }
}
function guardarMarca(k: string, m: Marca): void {
  try { localStorage.setItem(k, JSON.stringify(m)); } catch { /* sin almacenamiento: solo se pierde la marca */ }
}

export async function leerLocalSiReciente<T>(clave: string, o: { ttlMs: number; local: () => Promise<T>; red: () => Promise<T>; contar: (v: T) => number }): Promise<T> {
  const usuario = await sesionLocal();
  const k = claveMarca(clave, usuario?.id ?? 'anon');
  const marca = leerMarca(k);
  if (marca && Date.now() - marca.ts < o.ttlMs) {
    try {
      const local = await o.local();
      if (o.contar(local) === marca.n) return local;
    } catch { /* el espejo local no se pudo leer: se va al servidor */ }
  }
  const datos = await o.red();
  guardarMarca(k, { ts: Date.now(), n: o.contar(datos) });
  return datos;
}
