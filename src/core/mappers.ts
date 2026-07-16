import type {
  Ejecutivo,
  Material,
  InvConsolidadoRow,
  InvDetalleRow,
  Sugerencia,
  ResumenSinSugerenciaRow,
  ConsumoRow,
  ResumenFacRow,
} from './types';

// Raw xlsx rows come back as Record<string, unknown> with header keys.
// These mappers translate the Spanish column headers (documented in the
// task's fixture description) into the typed domain model. They are pure
// functions: no I/O, easily unit-testable.

type Row = Record<string, unknown>;

const str = (v: unknown): string => (v === undefined || v === null ? '' : String(v).trim());
const num = (v: unknown): number => {
  if (typeof v === 'number') return v;
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const CENTERS = ['1001', '1003', '1004', '1017', '1018', '1022', '1036'];

export function mapEjecutivo(r: Row): Ejecutivo {
  return {
    zona: str(r['Zona']),
    ejecutivo: str(r['Ejecutivo']),
    canal: str(r['Canal']),
    canalVentas: str(r['Canal Ventas']),
    codOfVtas: str(r['Cod Of Vtas']),
    oficinaVentas: str(r['Oficina Ventas']),
    gpoCte: str(r['Gpo Cte']),
    grupoCliente: str(r['Grupo Cliente']),
    region: str(r['Región']),
    gerenciaVentas: str(r['Gerencia de Ventas']),
    gerenteVentas: str(r['Gerente de Ventas']),
    directorVentas: str(r['Director de Ventas']),
    estadoLocalidad: str(r['Estado / Localidad'] ?? r['Estado/Localidad']),
    correoElectronico: str(r['Correo Electrónico']),
    celular: str(r['Celular']),
  };
}

export function mapMaterial(r: Row): Material {
  return {
    material: str(r['Material']),
    textoBreve: str(r['Texto breve de material']),
    sector: str(r['Sector']),
    descrSector: str(r['Descr. Sector']),
    descrGrupoArt: str(r['Descr. Grupo de Art.']),
    grupoArticulos: str(r['Grupo de artículos']),
    um: str(r[' UM'] ?? r['UM']),
    tipoMaterial: str(r['Tipo de material']),
    costo: num(r[' Costo'] ?? r['Costo']),
    cajasPorPallet: num(r['Cajas por Pallet']),
    piezasUmvPorCaja: num(r['Piezas UMV por caja']),
    piezasPorPallet: num(r['Piezas (UM) Por pallet'] ?? r['Piezas UMV por pallet']),
    cajasXCama: num(r['Cajas x cama']),
    camasPorTarima: num(r['Camas por tarima']),
    altura: num(r['Altura (M)'] ?? r['Altura']),
    lista02: num(r[' LISTA 02'] ?? r['LISTA 02']),
    lista06: num(r[' LISTA 06'] ?? r['LISTA 06']),
    condicion: str(r[' Condicion'] ?? r['Condicion']),
  };
}

export function mapInvConsolidado(r: Row): InvConsolidadoRow {
  const invByCenter: Record<string, number> = {};
  const transitoByCenter: Record<string, number> = {};
  for (const c of CENTERS) {
    invByCenter[c] = num(r[`Inv ${c}`]);
    // "InvConsolidado" and "Inventario por condicion" use slightly different
    // transit-column naming; support both.
    transitoByCenter[c] = num(r[`Transito_INV_${c}`] ?? r[`Cant. en Tránsito Inv ${c}`]);
  }
  // "Inventario por condicion" (daily report) has no "Inv Suma"/"Precio Oferta"
  // columns — fall back to summing the per-center inventory.
  const invSumaRaw = r['Inv Suma'];
  const invSuma = invSumaRaw !== undefined && invSumaRaw !== '' ? num(invSumaRaw) : Object.values(invByCenter).reduce((a, b) => a + b, 0);
  return {
    sector: str(r['Sector']),
    grupo: str(r['Grupo']),
    condicion: str(r['Condicion']),
    material: str(r['Material']),
    textoBreve: str(r['Texto breve de material']),
    disponible31_30: num(r['Disponible 1031-1030']),
    disponible31_32: num(r['Disponible 1031-1032']),
    invByCenter,
    transitoByCenter,
    invSuma,
    precioOferta: num(r[' Precio Oferta'] ?? r['Precio Oferta']),
    importeInventario: num(r[' Importe Inventario $'] ?? r['Importe Inventario $']),
  };
}

export function mapInvDetalle(r: Row): InvDetalleRow {
  const fecha = r['FechaCaducidad'];
  return {
    material: str(r['Material']),
    textoBreve: str(r['Texto breve de material']),
    centro: str(r['Centro']),
    almacen: str(r['Almacén']),
    lote: str(r['Lote']),
    fechaCaducidad: fecha ? excelDateToIso(fecha) : null,
    cantidadDisp: num(r['CantidadDisp']),
    precioOferta: num(r['Precio oferta']),
  };
}

/** Excel dates can arrive as serial numbers or strings depending on parse
 * options; normalize both to an ISO yyyy-mm-dd string. */
export function excelDateToIso(v: unknown): string | null {
  if (v === undefined || v === null || v === '') return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') {
    // Excel serial date (1900 date system)
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

export function mapSugerencia(r: Row): Sugerencia {
  const invByCenter: Record<string, number> = {
    '1030': num(r['Inv 1030']),
    '1031': num(r['Inv 1031']),
    '1032': num(r['Inv 1032']),
    '1060': num(r['Inv 1060']),
    '1001': num(r['Inv 1001']),
    '1003': num(r['Inv 1003']),
    '1004': num(r['Inv 1004']),
    '1017': num(r['Inv 1017']),
    '1018': num(r['Inv 1018']),
    '1022': num(r['Inv 1022']),
    '1036': num(r['Inv 1036']),
  };
  return {
    gpoCte: str(r['Gpo. Cte.']),
    fecha: str(r['Fecha']),
    oc: str(r['OC']),
    pedido: str(r['Pedido']),
    gpoVdor: str(r['Gpo.Vdor.']),
    solicitante: str(r['Solicitante']),
    destinatario: str(r['Destinatario']),
    razonSocial: str(r['Razón Social']),
    centroPedido: str(r['Centro pedido']),
    almacen: str(r['Almacén']),
    materialSolicitado: str(r['Material solicitado']),
    materialBase: str(r['Material base']),
    descripcionSolicitada: str(r['Descripción solicitada']),
    cantidadPedido: num(r['Cantidad pedido']),
    cantidadPendiente: num(r['Cantidad pendiente']),
    cantidadOfertar: num(r['Cantidad a Ofertar']),
    precio: num(r['Precio']),
    consumoPromedio: num(r['Consumo promedio']),
    fuente: str(r['Fuente']),
    materialSugerido: str(r['Material sugerido']),
    descripcionSugerida: str(r['Descripción sugerida']),
    centroSugerido: str(r['Centro sugerido']),
    almacenSugerido: str(r['Almacén sugerido']),
    disponible: num(r['Disponible']),
    lote: str(r['Lote']),
    fechaCaducidad: str(r['Fecha de Caducidad']),
    mesesVigenciaLote: num(r['Meses vigencia lote']),
    centroInv: str(r['Centro (Inv)']),
    mesesInventario: num(r['Meses_Inventario']),
    promedioConsumo12M: num(r['Promedio_Consumo_12M']),
    cantTransito: num(r['Cant. en Tránsito']),
    bloqueado: str(r['Bloqueado']),
    invByCenter,
    raw: r,
  };
}

export function mapResumenSinSugerencia(r: Row): ResumenSinSugerenciaRow {
  return {
    centro: str(r['Centro']),
    almacen: str(r['Almacen']),
    pedidos: str(r['Pedidos']),
    material: str(r['Material']),
    descripcion: str(r['Descripcion']),
    cantidadPendiente: num(r['Cantidad_Pendiente']),
    importePendiente: num(r['Importe_Pendiente']),
    promedioConsumo12M: num(r['Promedio_Consumo_12M']),
    mesesInventario: num(r['Meses_Inventario']),
    sumaInventario: num(r['Suma inventario']),
    sumaPendiente: num(r['Suma pendiente']),
    statusRevision: str(r['Status Revisión']),
    fuente: str(r['Fuente']),
    raw: r,
  };
}

export function mapConsumo(r: Row): ConsumoRow {
  return {
    centro: str(r['Centro']),
    grpCliente: str(r['Grp. Cliente']),
    gpoVdor: str(r['Gpo. Vdor.']),
    solicitante: str(r['Solicitante']),
    destinatario: str(r['Destinatario']),
    razonSocial: str(r['Razón Social']),
    material: str(r['Material']),
    textoMaterial: str(r['Texto Material']),
    consumoActual: num(r['Consumo_actual']),
    consumoPromedioMensual: num(r['Consumo_promedio_mensual']),
    um: str(r['UM']),
    tendencia: str(r['Tendencia']),
    ultimoMesFacturacion: str(r['Ultimo mes facturacion']),
    cantidadUltima: num(r['Cantidad ultima']),
    importeUltima: num(r['Importe ultima']),
    precioMin: num(r['precio_min']),
    precioMax: num(r['precio_max']),
    precioProm: num(r['precio_prom']),
    raw: r,
  };
}

export function mapResumenFac(r: Row): ResumenFacRow {
  return {
    solicitante: str(r['Solicitante']),
    razonSocial: str(r['Razón Social']),
    destinatario: str(r['Destinatario']),
    material: str(r['Material']),
    textoMaterial: str(r['Texto de material']),
    mesAno: str(r['Mes y año']),
    cantidadFacturada: num(r['Cantidad facturada']),
    importeFacturado: num(r['Importe facturado']),
    gpoCte: str(r['Gpo. Cte.']),
    gpoVdor: str(r['Gpo. Vdor.']),
    centro: str(r['Centro']),
  };
}
