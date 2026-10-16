/** Etapa de pruebas "solo libros nuevos": todos los datos salen de los libros de Google Sheets (Seg pedidos, Disponibilidad, Inv_Condicion y la
 * carpeta de Facturación). Con `true`:
 *  · se retiran los módulos que leían el reporte anterior (Panel, Pedidos, Resultados, Consumo, Inv Condición, Inventario / Resumen sin sugerencias e Historial);
 *  · NO se carga ni se restaura el "Reporte diario · Google Sheets" (ni al abrir, ni automático, ni desde Carga).
 * Para volver a lo anterior basta ponerlo en `false` (el código de esos módulos y del reporte sigue en el proyecto). */
export const SOLO_LIBROS = true;

/** Rutas de los módulos que dependían del reporte diario (Panel, Resultados e Historial incluidos: sin reporte no tienen datos). */
export const RUTAS_RETIRADAS: readonly string[] = ['/sugerencias', '/consumo', '/resumen-sin', '/inventario', '/', '/resultados', '/historial'];

export const rutaRetirada = (to: string): boolean => SOLO_LIBROS && RUTAS_RETIRADAS.includes(to.split('?')[0] ?? to);
