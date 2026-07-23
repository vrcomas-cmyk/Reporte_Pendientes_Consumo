import type { ReactNode } from 'react';
import { useAuth } from '@/services/authService';
import { Button } from '@/components/ui/button';

// TEMP: login desactivado para diagnosticar la pantalla negra post-login en
// Vercel — deja pasar directo sin pedir Google. Poner en `false` (o borrar
// este bloque) en cuanto se confirme que el resto de la app carga bien.
const AUTH_DISABLED = true;

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
