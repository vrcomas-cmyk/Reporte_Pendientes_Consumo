import { create } from 'zustand';
import { UNRESTRICTED_PERMISSIONS, type EffectivePermissions } from '@/core/permissions';
import { loadEffectivePermissions } from '@/services/permissionsService';

interface PermissionsState {
  /** Starts unrestricted (same behavior as before this feature existed) —
   * only narrows once `load()` resolves with a real, non-admin role. */
  perms: EffectivePermissions;
  loaded: boolean;
  load: (email: string) => Promise<void>;
  reset: () => void;
}

export const usePermissionsStore = create<PermissionsState>((set) => ({
  perms: UNRESTRICTED_PERMISSIONS,
  loaded: false,
  load: async (email) => {
    const perms = await loadEffectivePermissions(email);
    set({ perms, loaded: true });
  },
  reset: () => set({ perms: UNRESTRICTED_PERMISSIONS, loaded: false }),
}));
