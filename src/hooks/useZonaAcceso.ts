import { useMemo } from 'react';
import { usePermissionsStore } from '@/store/permissionsStore';
import { useAnalytics } from '@/modules/analytics/AnalyticsContext';
import { normCode } from '@/core/enrich';

export interface ZonaAcceso {
  /** El rol del usuario solo ve su(s) zona(s) en Seg pedidos, Facturación y Consumo. */
  restringido: boolean;
  /** Zonas del usuario (normalizadas). */
  zonas: string[];
  /** ¿Este «Gpo. Vdor.» (o zona) es de las del usuario? Sin restricción, siempre. */
  permite: (gpoVdor: unknown) => boolean;
}

const SIN_RESTRICCION: ZonaAcceso = { restringido: false, zonas: [], permite: () => true };

/** Zonas del usuario para acomodar la interfaz: las asignadas a mano más las del catálogo de ejecutivos cuyo correo es el suyo (lo mismo que resuelve el
 * servidor). El recorte REAL de los datos lo hace la función `datos`; esto solo evita mostrar renglones de otras zonas que llegan sin cliente ni precio.
 * Si el catálogo aún no carga, un usuario restringido no ve nada (falla cerrado). */
export function useZonaAcceso(): ZonaAcceso {
  const isAdmin = usePermissionsStore((s) => s.perms.isAdmin);
  const datos = usePermissionsStore((s) => s.perms.datos);
  const { enrich } = useAnalytics();
  return useMemo(() => {
    if (isAdmin || !datos.restringirZona) return SIN_RESTRICCION;
    const email = datos.email.toLowerCase();
    const set = new Set<string>(datos.zonasManual.map(normCode).filter(Boolean));
    for (const z of enrich.ejecutivosZona) if (enrich.correosDeZona(z.zona).some((c) => c.toLowerCase() === email)) set.add(z.zona);
    return { restringido: true, zonas: [...set], permite: (gpo: unknown) => set.has(enrich.zonaDeEjecutivo(gpo)) };
  }, [isAdmin, datos, enrich]);
}
