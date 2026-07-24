import { useCallback, useState } from 'react';
import { toast } from '@/store/toastStore';

// ---------------------------------------------------------------------------
// useClipboard · Thin wrapper around navigator.clipboard that:
//  - falls back to a hidden textarea + execCommand on insecure origins /
//    older browsers (where navigator.clipboard may be undefined).
//  - fires a toast on success/failure so the user knows the action happened.
//  - returns { copied, copy } so callers can show inline visual feedback too.
// Replaces hand-rolled navigator.clipboard.writeText sprinkled through
// ApiLauncherCard, the (future) copy-cell-to-clipboard flow, etc.
// ---------------------------------------------------------------------------

export function useClipboard(copiedDurationMs = 1800) {
  const [copied, setCopied] = useState(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  const copy = useCallback(
    async (value: string, successMsg = 'Copiado'): Promise<boolean> => {
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(value);
        } else {
          // Legacy fallback for http:// origins / older browsers without the
          // async clipboard API. Still works in all evergreen browsers.
          const ta = document.createElement('textarea');
          ta.value = value;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          const ok = document.execCommand('copy');
          document.body.removeChild(ta);
          if (!ok) throw new Error('execCommand copy failed');
        }
        setCopied(true);
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => setCopied(false), copiedDurationMs);
        if (successMsg) toast.success(successMsg);
        return true;
      } catch {
        toast.error('No se pudo copiar');
        return false;
      }
    },
    [copiedDurationMs],
  );

  return { copied, copy };
}
