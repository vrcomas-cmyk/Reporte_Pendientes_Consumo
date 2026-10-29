import type { ReactNode } from 'react';
import { usePermissionsStore } from '@/store/permissionsStore';
import { canViewModule } from '@/core/permissions';
import { EmptyState } from '@/components/feedback/EmptyState';

const AUTH_DISABLED = import.meta.env.VITE_AUTH_DISABLED === 'true';

/** Mientras no se hayan cargado los permisos del usuario no se monta ningún módulo: los permisos arrancan «sin restricción» y, sin esto, un usuario restringido
 * alcanzaría a montar (y pedir los datos de) un módulo que no le toca en los instantes previos a la carga. */
function CargandoPermisos() {
  return <p className="p-6 text-sm text-text-muted" role="status">Verificando tu acceso…</p>;
}

/** Blocks a route by module key, independent of whether it's in the sidebar —
 * without this, someone without a module grant could still reach it by
 * typing the URL directly (the Sidebar filter alone only hides the link). */
export function ModuleGuard({ moduleKey, children }: { moduleKey: string; children: ReactNode }) {
  const perms = usePermissionsStore((s) => s.perms);
  const loaded = usePermissionsStore((s) => s.loaded);
  if (!AUTH_DISABLED && !loaded) return <CargandoPermisos />;
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
  if (!AUTH_DISABLED && !loaded) return <CargandoPermisos />;
  if (!perms.isAdmin) {
    return <EmptyState title="No tienes acceso a Administración" description="Este módulo es solo para administradores." />;
  }
  return <>{children}</>;
}
