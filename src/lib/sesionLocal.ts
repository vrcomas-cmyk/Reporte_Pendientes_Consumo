// ---------------------------------------------------------------------------
// sesionLocal.ts · Usuario de la sesión leído de la sesión LOCAL (sin red).
//
// `supabase.auth.getUser()` es una petición a /auth/v1/user y cada una cuesta ~5 consultas SQL en Auth. Para saber SOLO quién es el usuario (su correo o id, para
// firmar un registro) basta la sesión guardada en el navegador: `getSession()` no sale a la red salvo que haya que renovar el token. La autorización real sigue en el
// servidor (RLS y funciones), que valida el token en cada petición; esto no la sustituye.
// ---------------------------------------------------------------------------
import { supabase } from '@/lib/supabaseClient';

export interface UsuarioLocal { id: string; email: string }

/** Usuario de la sesión guardada, o `null` si no hay sesión. Nunca lanza. */
export async function sesionLocal(): Promise<UsuarioLocal | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const u = data.session?.user;
    return u ? { id: u.id, email: u.email ?? '' } : null;
  } catch {
    return null;
  }
}

/** Correo del usuario de la sesión local, o `porDefecto` si no hay (o no trae correo). */
export async function emailLocal(porDefecto = ''): Promise<string> {
  return (await sesionLocal())?.email || porDefecto;
}

/** Id del usuario de la sesión local; lanza si no hay sesión (mismo mensaje que el código anterior). */
export async function idLocal(): Promise<string> {
  const s = await sesionLocal();
  if (!s) throw new Error('No hay sesión activa');
  return s.id;
}
