import type { ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';

// Fallback fail-closed: el login está ACTIVO por defecto. Solo se desactiva
// explícitamente con `VITE_AUTH_DISABLED=true` (uso temporal de diagnóstico,
// por ej. para inspeccionar una pantalla negra post-login en Vercel).
// Retirar el flag de `.env` cuando el login esté confirmado.
const AUTH_DISABLED = import.meta.env.VITE_AUTH_DISABLED === 'true';

/** Blocks the whole app behind Google login + invite list until signed in. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { status, signInWithGoogle } = useAuth();

  if (AUTH_DISABLED) return <>{children}</>;

  if (status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-border border-t-accent" />
      </div>
    );
  }

  if (status === 'signed-in') return <>{children}</>;

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="font-display text-xl font-semibold">Degasa Portal</h1>
      {status === 'not-allowed' && (
        <p className="max-w-sm text-sm text-danger">
          Tu cuenta de Google no está autorizada para este portal. Pide acceso a un administrador.
        </p>
      )}
      <Button onClick={signInWithGoogle}>Entrar con Google</Button>
    </div>
  );
}
