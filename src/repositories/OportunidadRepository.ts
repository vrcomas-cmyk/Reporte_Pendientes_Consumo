import type { Oportunidad, Interaccion } from '@/core/types';

/** Abstracción sobre "dónde vive el conocimiento comercial" del módulo
 * Oportunidades — mismo patrón swap-without-touching-UI que
 * CatalogRepository/SolicitudRepository. A diferencia de las solicitudes DRP
 * (locales por dispositivo), este conocimiento es DEL EQUIPO: Supabase es la
 * fuente de verdad, Dexie solo cachea para arranque offline. */
export interface OportunidadRepository {
  listOportunidades(): Promise<Oportunidad[]>;
  addOportunidad(o: Oportunidad): Promise<number>;
  updateOportunidad(id: number, patch: Partial<Oportunidad>): Promise<void>;
  listInteracciones(): Promise<Interaccion[]>;
  addInteraccion(i: Interaccion): Promise<number>;
}
