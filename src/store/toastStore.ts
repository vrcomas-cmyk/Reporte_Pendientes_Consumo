import { create } from 'zustand';

// ---------------------------------------------------------------------------
// toastStore · Global toast queue. Tiny on purpose — no toast library needed.
// Any component/page can `toast.success('…')` / `toast.error('…')` /
// `toast.info('…')` from anywhere in the tree, and the <Toaster /> renderer
// declared once at the AppRoot drains the queue with enter/leave animation.
//
// Replaces `window.alert` (exportXlsx, Settings validation, etc.) and the
// scattered inline `<p className="text-danger">{err}</p>` blocks scattered
// through pages; gives a single accessible place for transient feedback.
// ---------------------------------------------------------------------------

export type ToastLevel = 'info' | 'success' | 'error' | 'warning';

export interface Toast {
  id: number;
  level: ToastLevel;
  title: string;
  description?: string;
  /** Auto-dismiss after this many ms (default 4s for info/success, 6s for
   *  error/warning). 0 = sticky (must be dismissed manually). */
  duration?: number;
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id'>) => number;
  dismiss: (id: number) => void;
  clear: () => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

function push(level: ToastLevel, title: string, description?: string, duration?: number) {
  const defaultDuration = level === 'error' || level === 'warning' ? 6000 : 4000;
  return useToastStore.getState().push({ level, title, description, duration: duration ?? defaultDuration });
}

/** Imperative entry point used by useClipboard, the future copy-cell flow,
 *  exportXlsx, AppShell error handlers, etc. `toast.success('Filas copiadas')`. */
export const toast = {
  info: (title: string, description?: string, duration?: number) => push('info', title, description, duration),
  success: (title: string, description?: string, duration?: number) => push('success', title, description, duration),
  warning: (title: string, description?: string, duration?: number) => push('warning', title, description, duration),
  error: (title: string, description?: string, duration?: number) => push('error', title, description, duration),
  /** Push a toast derived from an unknown rejection — handy in .catch chains. */
  fromError: (err: unknown, fallbackTitle = 'Algo salió mal') =>
    push('error', fallbackTitle, err instanceof Error ? err.message : String(err)),
  dismiss: (id: number) => useToastStore.getState().dismiss(id),
  clear: () => useToastStore.getState().clear(),
};
