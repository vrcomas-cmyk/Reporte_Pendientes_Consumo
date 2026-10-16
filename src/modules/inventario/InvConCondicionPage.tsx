import { InventarioPage } from './InventarioPage';
import { useFacturacionLibros } from '@/modules/analytics/useFacturacionLibros';

/** Módulo "Inv con Condición": EXACTAMENTE el módulo Inv Condición (`InventarioPage`: filas por material × condición,
 * columnas por centro, lotes por vencer, paneles de detalle, exportación), pero armado desde el libro Inv_Condicion de
 * Google Sheets (Corta caducidad por lote, Revision con sus Status, Sustituto y PNC) y Disponibilidad en vez del reporte
 * diario. Ver `core/invCondicionLibros.ts`. El historial de facturación de sus detalles sale de los libros de Drive
 * (ver `useFacturacionLibros`). */
export function InvConCondicionPage() {
  useFacturacionLibros();
  return <InventarioPage modo="libros" />;
}
