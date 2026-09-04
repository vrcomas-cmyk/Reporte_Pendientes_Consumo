import type { ReactNode } from 'react';
import { Warehouse } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

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
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-bg p-8">
      <Card className="flex w-full max-w-xs flex-col items-center gap-4 p-8 text-center">
        <div className="flex size-11 items-center justify-center rounded-lg bg-accent text-accent-fg">
          <Warehouse className="size-5" />
        </div>
        <div>
          <h1 className="font-display text-lg font-semibold text-text">DEGASA Portal</h1>
          <p className="mt-1 text-xs text-text-muted">Inventario y consumo</p>
        </div>
        {status === 'not-allowed' && (
          <p className="text-sm text-danger">
            Tu cuenta de Google no está autorizada para este portal. Pide acceso a un administrador.
          </p>
        )}
        <Button onClick={signInWithGoogle} className="w-full">Entrar con Google</Button>
      </Card>
    </div>
  );
}
