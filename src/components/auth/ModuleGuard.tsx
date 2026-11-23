import { useEffect, useState, type ReactNode } from 'react';
import { usePermissionsStore } from '@/store/permissionsStore';
import { canViewModule } from '@/core/permissions';
import { EmptyState } from '@/components/feedback/EmptyState';
import { cerrarSesionLocal } from '@/lib/sesion';

const AUTH_DISABLED = import.meta.env.VITE_AUTH_DISABLED === 'true';

/** Mientras no se hayan cargado los permisos del usuario no se monta ningún módulo: los permisos arrancan «sin restricción» y, sin esto, un usuario restringido
 * alcanzaría a montar (y pedir los datos de) un módulo que no le toca en los instantes previos a la carga. */
function CargandoPermisos() {
  const reintentar = usePermissionsStore((s) => s.reintentar);
  // Si la verificación tarda más de lo normal (servidor lento, sesión guardada en mal estado) el usuario no se queda esperando sin salida: puede reintentar o cerrar sesión.
  const [lento, setLento] = useState(false);
  useEffect(() => { const t = setTimeout(() => setLento(true), 12_000); return () => clearTimeout(t); }, []);
  return (
    <div className="p-6 text-sm text-text-muted" role="status">
      <p>Verificando tu acceso…</p>
      {lento && (
        <p className="mt-2">
          Está tardando más de lo normal.{' '}
          <button type="button" onClick={() => { void reintentar(); }} className="text-accent hover:underline">Reintentar</button>
          {' · '}
          <button type="button" onClick={() => { void cerrarSesionLocal(); }} className="text-accent hover:underline">Cerrar sesión e ingresar de nuevo</button>
        </p>
      )}
    </div>
  );
}

/** El servidor no respondió y no hay una copia de los permisos de este usuario: NO es «sin acceso», es que no se pudo verificar. No se concede nada (fail-closed),
 * pero se dice la verdad y se reintenta solo cada pocos segundos; el botón fuerza el reintento ya. */
function NoSePudoVerificar({ reintentando }: { reintentando: boolean }) {
  const reintentar = usePermissionsStore((s) => s.reintentar);
  return (
    <EmptyState
      title="No pudimos verificar tus permisos"
      description="El servidor no está respondiendo (no es un problema de tu acceso). Se reintenta solo cada pocos segundos; también puedes reintentar ahora."
      action={{ label: reintentando ? 'Reintentando…' : 'Reintentar', onClick: reintentando ? undefined : () => { void reintentar(); } }}
      secondaryAction={{ label: 'Cerrar sesión e ingresar de nuevo', onClick: () => { void cerrarSesionLocal(); } }}
    />
  );
}

/** Blocks a route by module key, independent of whether it's in the sidebar —
 * without this, someone without a module grant could still reach it by
 * typing the URL directly (the Sidebar filter alone only hides the link). */
export function ModuleGuard({ moduleKey, children }: { moduleKey: string; children: ReactNode }) {
  const perms = usePermissionsStore((s) => s.perms);
  const loaded = usePermissionsStore((s) => s.loaded);
  const estado = usePermissionsStore((s) => s.estado);
  if (!AUTH_DISABLED && !loaded) return <CargandoPermisos />;
  if (!AUTH_DISABLED && (estado === 'error' || estado === 'cargando')) return <NoSePudoVerificar reintentando={estado === 'cargando'} />;
  if (!canViewModule(perms, moduleKey)) {
    return <EmptyState title="No tienes acceso a este módulo" description="Pide a un administrador que te dé acceso desde /admin." />;
  }
  return <>{children}</>;
}

/** Only for the /admin route — admin access is a role flag (`isAdmin`), not a
 * module grant: an admin manages every permission, so it can't be one of the
 * things a permission row itself controls without risking locking every
 * admin out at once. */
export function AdminGuard({ children }: { children: ReactNode }) {
  const perms = usePermissionsStore((s) => s.perms);
  const loaded = usePermissionsStore((s) => s.loaded);
  const estado = usePermissionsStore((s) => s.estado);
  if (!AUTH_DISABLED && !loaded) return <CargandoPermisos />;
  if (!AUTH_DISABLED && (estado === 'error' || estado === 'cargando')) return <NoSePudoVerificar reintentando={estado === 'cargando'} />;
  if (!perms.isAdmin) {
    return <EmptyState title="No tienes acceso a Administración" description="Este módulo es solo para administradores." />;
  }
  return <>{children}</>;
}
