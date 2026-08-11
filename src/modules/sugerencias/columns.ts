import type { ColDef } from '@/modules/analytics/ui';

/** Definición de columnas de la vista "Agrupado" (BO) de Pedidos — usada por
 * `SugerenciasPage.tsx` (tabla completa) Y por el panel de material
 * (`SugTable` en `analytics/panels/_shared.tsx`), ambos leyendo/escribiendo
 * el mismo `useColumnVisibility('sugerencias_columnas')`, así que el panel
 * siempre muestra exactamente lo que el reporte muestra — nunca una versión
 * recortada aparte. `unificarInv` es un toggle solo de la página completa;
 * el panel siempre pide `unificarInv: false` (4 columnas de inventario, como
 * el reporte original sin ese atajo). */
export function buildSugerenciasColsCommon(opts: { precioOculto: boolean; unificarInv: boolean }): ColDef[] {
  const { precioOculto, unificarInv } = opts;
  return [
    { key: 'pedido', label: 'Pedido/OC' }, { key: 'fecha', label: 'Fecha' }, { key: 'cliente', label: 'Cliente' },
    { key: 'ejecutivo', label: 'Ejecutivo / Grupo cli.' }, { key: 'centro', label: 'Centro/Alm' },
    { key: 'material', label: 'Material' }, { key: 'sector', label: 'Sector/Grupo' },
    { key: 'cantped', label: 'Cant.ped.' }, { key: 'pend', label: 'Pend.' },
    ...(precioOculto ? [] : [{ key: 'precio', label: 'Precio' }]),
    { key: 'consumo', label: 'Consumo' },
    ...(unificarInv
      ? [{ key: 'invtotal', label: 'Inv. total (1030+1031+1032+1060)' }]
      : [{ key: 'inv1030', label: 'Inv 1030' }, { key: 'inv1031', label: 'Inv 1031' }, { key: 'inv1032', label: 'Inv 1032' }, { key: 'inv1060', label: 'Inv 1060' }]),
    { key: 'bloq', label: 'Bloq.' }, { key: 'estado', label: 'Estado' }, { key: 'tendencia', label: 'Tendencia' },
  ];
}

export function buildSugerenciasColsAgrupado(opts: { precioOculto: boolean; unificarInv: boolean; fuenteOculto: boolean }): ColDef[] {
  return [...buildSugerenciasColsCommon(opts), ...(opts.fuenteOculto ? [] : [{ key: 'fuentes', label: 'Fuentes' }])];
}
