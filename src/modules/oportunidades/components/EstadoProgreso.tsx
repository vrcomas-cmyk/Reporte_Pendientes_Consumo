import { CICLO_OPORTUNIDAD, ESTADOS_OPORTUNIDAD, PROXIMO_PASO, type EstadoOportunidad } from '@/core/types';
import { cn } from '@/lib/utils';
import { EstadoBadge } from './EstadoBadge';

function labelOf(key: EstadoOportunidad) {
  return ESTADOS_OPORTUNIDAD.find((e) => e.key === key)?.label ?? key;
}

/** Progreso visual del ciclo de vida de una Oportunidad — los 5 pasos
 * "rectos" (`CICLO_OPORTUNIDAD`) como stepper, y el texto de qué hacer
 * a continuación siempre visible, para que el usuario nunca se pregunte
 * "¿y ahora qué?". `sin-interesados`/`campana-agresiva` son ramas fuera de
 * esa línea recta, así que se muestran solo como badge + próximo paso. */
export function EstadoProgreso({ estado }: { estado: EstadoOportunidad }) {
  const enCiclo = CICLO_OPORTUNIDAD.includes(estado);
  const idx = CICLO_OPORTUNIDAD.indexOf(estado);

  return (
    <div>
      {enCiclo ? (
        <div className="flex items-center gap-1">
          {CICLO_OPORTUNIDAD.map((e, i) => (
            <div key={e} className="flex flex-1 items-center gap-1">
              <div className="flex flex-col items-center gap-1">
                <span title={labelOf(e)} className={cn('size-2.5 shrink-0 rounded-full', i <= idx ? 'bg-accent' : 'bg-border')} />
              </div>
              {i < CICLO_OPORTUNIDAD.length - 1 && <span className={cn('h-0.5 flex-1', i < idx ? 'bg-accent' : 'bg-border')} />}
            </div>
          ))}
        </div>
      ) : (
        <EstadoBadge estado={estado} />
      )}
      <p className="mt-2 text-xs text-text-muted"><span className="font-medium text-text">Siguiente paso: </span>{PROXIMO_PASO[estado]}</p>
    </div>
  );
}
