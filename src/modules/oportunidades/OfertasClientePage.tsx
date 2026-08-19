import { Navigate } from 'react-router-dom';

/** Ruta directa `/oportunidades/ofertas-cliente` — era el índice de "Reglas
 * de aceptación"; tras la fusión "ficha = regla global" ese trabajo vive en
 * la pestaña Clientes, así que el deep-link redirige ahí. */
export function OfertasClientePage() {
  return <Navigate to="/oportunidades?tab=clientes" replace />;
}