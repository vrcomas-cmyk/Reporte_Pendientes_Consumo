import { ResumenSinPage } from './ResumenSinPage';
import { useFacturacionLibros } from '@/modules/analytics/useFacturacionLibros';

/** Módulo "Inventario · Disponibilidad": EXACTAMENTE el módulo Inventario (`ResumenSinPage`: pivot Material x Centro,
 * filtros, cobertura, lento, paneles de detalle, exportación), pero con el inventario de los libros de Disponibilidad
 * (Libre Utilización − Entrega a cliente), el pendiente de Seg pedidos y el consumo de Fac_Mensual_CAM en vez de la hoja
 * "Resumen Sin Sugerencias" del reporte. Ver `core/resumenDisponibilidad.ts`. La Tendencia y el historial salen de la
 * facturación de los libros de Drive (ver `useFacturacionLibros`). */
export function InvDisponibilidadPage() {
  useFacturacionLibros();
  return <ResumenSinPage modo="disp" />;
}
