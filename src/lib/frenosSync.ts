// ---------------------------------------------------------------------------
// frenosSync.ts · Cada cuánto, como mínimo, la app revisa por sí sola si cambió algo en Drive / el catálogo (cada revisión es una invocación de la función `datos`).
// Un solo lugar para ajustarlos. La sincronización MANUAL («Sincronizar» en Carga) no tiene freno.
// ---------------------------------------------------------------------------

/** Al abrir un módulo que usa los libros (Seg. de pedidos, Facturación, Comodato, Ofertas…), como máximo cada tanto se vuelve a preguntar a Drive qué cambió. */
export const REVISION_LIBROS_MIN_MS = 30 * 60_000;

/** Mínimo entre dos comprobaciones de cambios del catálogo (`?meta=1`), venga de donde venga (intervalo, volver a la pestaña, abrir la app). */
export const REVISION_CATALOGO_MIN_MS = 15 * 60_000;

/** Cada cuánto, con la pestaña visible, se comprueba si cambió el catálogo. */
export const INTERVALO_CATALOGO_MS = 30 * 60_000;
