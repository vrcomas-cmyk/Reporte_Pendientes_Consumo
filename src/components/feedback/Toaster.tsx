import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, AlertTriangle, Info, X, XCircle } from 'lucide-react';
import { useToastStore, type Toast, type ToastLevel } from '@/store/toastStore';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Toaster · Single declared once in AppRoot; renders the toast queue from
// toastStore with framer-motion enter/leave. Auto-dismiss handled here
// (rather than in the store) so cancellation is a plain useEffect cleanup.
// ---------------------------------------------------------------------------

const ICONS: Record<ToastLevel, typeof Info> = {
  info: Info,
  success: Check,
  error: XCircle,
  warning: AlertTriangle,
};

const COLORS: Record<ToastLevel, string> = {
  info: 'border-border bg-bg-elevated text-text',
  success: 'border-success/30 bg-success/10 text-success',
  error: 'border-danger/30 bg-danger/10 text-danger',
  warning: 'border-warning/30 bg-warning/10 text-warning',
};

function ToastItem({ t }: { t: Toast }) {
  const dismiss = useToastStore((s) => s.dismiss);
  const Icon = ICONS[t.level];

  useEffect(() => {
    if (!t.duration) return;
    const id = setTimeout(() => dismiss(t.id), t.duration);
    return () => clearTimeout(id);
  }, [t.duration, t.id, dismiss]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.12 } }}
      transition={{ type: 'spring', stiffness: 320, damping: 30 }}
      className={cn(
        'pointer-events-auto flex w-80 items-start gap-2.5 rounded-md border px-3 py-2.5 shadow-lg',
        COLORS[t.level],
      )}
      role="status"
      aria-live={t.level === 'error' ? 'assertive' : 'polite'}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug">{t.title}</p>
        {t.description && (
          <p className="mt-0.5 text-xs text-text-muted leading-snug break-words">{t.description}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => dismiss(t.id)}
        aria-label="Dismiss"
        className="shrink-0 text-text-faint hover:text-text transition-colors"
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </motion.div>
  );
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-2 z-[100] flex flex-col items-center gap-2 px-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <ToastItem key={t.id} t={t} />
        ))}
      </AnimatePresence>
    </div>
  );
}
