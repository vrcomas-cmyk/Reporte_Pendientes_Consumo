import { useState } from 'react';
import { Pencil, Undo2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { canViewModule, isDetailHidden } from '@/core/permissions';
import { claveAjuste, fechaIsoValida } from '@/core/ajusteCaducidad';
import { usePermissionsStore } from '@/store/permissionsStore';
import { useAjustesCaducidadStore } from '@/store/ajustesCaducidadStore';
import { toast } from '@/store/toastStore';
import { formatFechaCaducidad } from '@/lib/utils';

/** ¿Puede el usuario ajustar caducidades? (módulo Inventario y el detalle `editarCaducidad` no oculto; la función `envios` lo vuelve a validar.) */
export function usePuedeEditarCaducidad(): boolean {
  const perms = usePermissionsStore((s) => s.perms);
  return canViewModule(perms, 'inventario') && !isDetailHidden(perms, 'inventario', 'editarCaducidad');
}

/** Lápiz junto a la caducidad de un lote: corrige la fecha por material + lote y la respalda en la hoja Ajustes_Caducidad.
 *  `fecha` es la que se muestra hoy (ya con el ajuste, si lo hay); `fechaSistema` la que trae el sistema. */
export function EditarCaducidad({ material, lote, fecha, fechaSistema }: { material: string; lote: string; fecha: string | null; fechaSistema?: string | null }) {
  const puede = usePuedeEditarCaducidad();
  const ajuste = useAjustesCaducidadStore((s) => s.ajustes[claveAjuste(material, lote)]);
  const [abierto, setAbierto] = useState(false);
  const [valor, setValor] = useState('');
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);

  const sistema = ajuste ? (fechaSistema ?? ajuste.sistema ?? '') : (fecha ?? '');
  if (!puede && !ajuste) return null;

  const abrir = (o: boolean) => {
    setAbierto(o);
    if (o) { setValor(fechaIsoValida(fecha) ?? ''); setNota(ajuste?.nota ?? ''); }
  };
  const valida = fechaIsoValida(valor);
  const cambio = !!valida && valida !== fechaIsoValida(fecha);

  const guardar = async () => {
    if (!valida) return;
    setGuardando(true);
    try {
      await useAjustesCaducidadStore.getState().guardar({ material, lote, fecha: valida, sistema: fechaIsoValida(sistema) ?? '', nota });
      toast.success('Caducidad ajustada', `Lote ${lote}: ${formatFechaCaducidad(valida)}. Respaldado en Google Sheets.`);
      setAbierto(false);
    } catch (e) { toast.fromError(e, 'No se pudo guardar el ajuste'); } finally { setGuardando(false); }
  };
  const restaurar = async () => {
    setGuardando(true);
    try {
      await useAjustesCaducidadStore.getState().restaurar(material, lote);
      toast.success('Caducidad restaurada', `Lote ${lote} vuelve a la fecha del sistema.`);
      setAbierto(false);
    } catch (e) { toast.fromError(e, 'No se pudo restaurar'); } finally { setGuardando(false); }
  };

  const titulo = ajuste
    ? `Ajustada${ajuste.usuario ? ` por ${ajuste.usuario}` : ''}${ajuste.actualizado ? ` el ${ajuste.actualizado}` : ''}. El sistema decía ${formatFechaCaducidad(sistema)}.`
    : 'Ajustar caducidad';

  return (
    <Popover open={abierto} onOpenChange={abrir}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={titulo}
          aria-label={`Ajustar caducidad del lote ${lote}`}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          className={`ml-1 inline-flex size-5 items-center justify-center rounded align-middle hover:bg-bg-inset ${ajuste ? 'text-warning' : 'text-text-faint'}`}
        >
          <Pencil className="size-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
        <p className="text-xs font-medium">Lote {lote} · {material}</p>
        <p className="mt-0.5 text-[11px] text-text-faint">Sistema: {formatFechaCaducidad(sistema || null)}</p>
        <label className="mt-2 block text-[11px] text-text-muted">Caducidad correcta
          <Input type="date" value={valor} onChange={(e) => setValor(e.target.value)} className="mt-1 h-8" />
        </label>
        <label className="mt-2 block text-[11px] text-text-muted">Nota (opcional)
          <Input value={nota} maxLength={200} onChange={(e) => setNota(e.target.value)} className="mt-1 h-8" />
        </label>
        <p className="mt-2 text-[11px] text-text-faint">Se aplica a este material/lote en todos los centros y se guarda en la hoja Ajustes_Caducidad.</p>
        <div className="mt-2 flex items-center justify-between gap-2">
          {ajuste ? <Button size="sm" variant="ghost" disabled={guardando} onClick={restaurar}><Undo2 />Restaurar</Button> : <span />}
          <Button size="sm" disabled={guardando || !cambio} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar'}</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
