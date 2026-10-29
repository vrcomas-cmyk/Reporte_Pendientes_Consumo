import { supabase } from '@/lib/supabaseClient';
import { db } from '@/repositories/db';

/** Marcas de sincronización guardadas en localStorage ("catalog-sync-meta", etc.): si quedaran, el usuario siguiente creería que sus datos ya están al día. */
const ES_MARCA_DE_SYNC = (k: string) => /sync|meta/i.test(k);

/** Cierra la sesión Y borra lo que el navegador guardó de datos (IndexedDB y marcas de sincronización), para que el siguiente usuario de este equipo no vea
 * lo que cargó el anterior ni herede su caché. Las preferencias de pantalla (tema, filtros, columnas) se conservan. Termina recargando la página. */
export async function cerrarSesion(): Promise<void> {
  try { await supabase.auth.signOut(); } catch { /* aunque falle la red, se limpia lo local */ }
  try { db.close(); await db.delete(); } catch { /* sin IndexedDB o ya borrada */ }
  try {
    for (const k of Object.keys(localStorage)) if (ES_MARCA_DE_SYNC(k)) localStorage.removeItem(k);
    sessionStorage.clear();
  } catch { /* almacenamiento bloqueado */ }
  window.location.assign(window.location.origin);
}
