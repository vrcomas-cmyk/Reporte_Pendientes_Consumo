import type { Panel } from '@/store/panelStore';
import type { Analytics } from './AnalyticsContext';
import { mesLabel } from '@/core/resumenFac';

/** Texto corto de un panel para las migas de pan (ruta de navegación del detalle). */
export function panelTitulo(p: Panel, a: Analytics): string {
  switch (p.type) {
    case 'sugDetalle': return `Renglón BO ${a.boByKey.get(p.boKey)?.bo.materialBase ?? ''}`.trim();
    case 'pedido': return `Pedido ${p.pedido}`;
    case 'evol': return `${p.kind === 'solic' ? 'Solicitante' : 'Destinatario'} ${p.key}`;
    case 'ejecutivoPedidos': return 'Pedidos del ejecutivo';
    case 'codigoEvol': return `${p.material} · ${p.key}`;
    case 'material': return `Material ${p.material}`;
    case 'consumoMaterial': return `Consumo ${p.material} · ${p.dest}`;
    case 'clientesMes': return `Clientes ${mesLabel(p.mes)}`;
    case 'mesClientesFiltro': return `Clientes ${mesLabel(p.mes)}`;
    case 'sector': return `Sector ${p.sector}`;
    case 'grupo': return `Grupo ${p.grupo}`;
    case 'celda': return `${p.material} · Centro ${p.centro}`;
    case 'invCondCelda': return `${p.material} · Centro ${p.centro}`;
    case 'materialTotales': return `Totales ${p.material}`;
    case 'lote': return `Lote ${p.lote}`;
    case 'clienteDetalle': return `Cliente ${p.dest}`;
    case 'materialHub': return `Material ${p.material}`;
    case 'oportunidad': return `Oportunidad ${p.id}`;
    case 'materialColocacion': return `Colocación ${p.material}`;
    case 'materialSinRegla': return `Sin regla ${p.material}`;
    case 'clienteConocimiento': return `Ficha ${p.razonSocial || p.dest}`;
  }
}
