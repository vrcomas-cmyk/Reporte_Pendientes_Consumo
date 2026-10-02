import { useCallback, useMemo, useState } from 'react';
import { useAnalytics } from '@/modules/analytics/AnalyticsContext';
import { useGruposExcluidosStore } from '@/store/gruposExcluidosStore';
import { nombresExcluidos, gruposPorDefecto, etiquetaGrupos } from '@/lib/gruposCliente';

/** Nombres de grupo de cliente excluidos por defecto (los códigos configurados
 * en Administración → Filtros, resueltos contra el catálogo). */
export function useGruposExcluidos(): string[] {
  const codigos = useGruposExcluidosStore((s) => s.codigos);
  const { enrich } = useAnalytics();
  return useMemo(() => nombresExcluidos(codigos, (c) => enrich.grupoCliente(c)), [codigos, enrich]);
}

/** Estado del filtro de Grupo cliente con "todos menos los excluidos por
 * Administración" (por defecto 18 = GOBIERNO) como valor inicial CADA VEZ que
 * se entra al módulo: el estado vive en memoria (no se persiste), así que cada
 * visita parte de ese valor y solo cambia si la persona abre el filtro y elige
 * otra cosa (p. ej. incluir Gobierno). Mientras no se toque, el valor se deriva
 * de `opciones` — sin efecto ni render extra cuando los datos llegan después.
 *
 * Devuelve `[seleccion, setSeleccion, reiniciar, resumen]`; `reiniciar` vuelve
 * al valor por defecto ("Limpiar filtros") y `resumen` es el texto del botón
 * ("todos menos GOBIERNO"). Un arreglo vacío elegido a mano significa "sin
 * filtro" (todos), como en `MultiSelect`. */
export function useGruposPorDefecto(opciones: string[]): [string[], (v: string[]) => void, () => void, string] {
  const excluidos = useGruposExcluidos();
  const [elegida, setElegida] = useState<string[] | null>(null);
  const porDefecto = useMemo(() => gruposPorDefecto(opciones, excluidos), [opciones, excluidos]);
  const reiniciar = useCallback(() => setElegida(null), []);
  const seleccion = elegida ?? porDefecto;
  return [seleccion, setElegida, reiniciar, etiquetaGrupos(seleccion, opciones, excluidos)];
}
