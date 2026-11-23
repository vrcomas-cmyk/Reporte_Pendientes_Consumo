import { listConnectors, setConnectorValue } from '@/services/permissionsService';
import { invalidateConnectorsCache } from '@/services/connectorsService';
import { llamarEnvios } from '@/services/enviosService';
import {
  CLAVE_CFG_TRANSMISION, parseConfigTransmision, pestanasDeRespuesta, serializarConfigTransmision, validarConfigTransmision,
  type ConfigTransmisionCfg, type PestanaLibro,
} from '@/core/enviosConfig';

/** Configuración de Transmisión guardada (solo la puede leer un administrador: es una fila de `degasa_connectors`). */
export async function cargarConfigTransmision(): Promise<ConfigTransmisionCfg> {
  const filas = await listConnectors();
  return parseConfigTransmision(filas.find((f) => f.key === CLAVE_CFG_TRANSMISION)?.value);
}

/** Guarda la configuración (solo administradores: lo exige la base). Lanza si falta algo o no se pudo guardar. */
export async function guardarConfigTransmision(cfg: ConfigTransmisionCfg, updatedBy: string): Promise<void> {
  const problemas = validarConfigTransmision(cfg);
  if (problemas.length) throw new Error(problemas.join(' '));
  await setConnectorValue(CLAVE_CFG_TRANSMISION, serializarConfigTransmision(cfg), updatedBy, 'Envíos · Transmisión (libros y pestañas)');
  invalidateConnectorsCache();
}

/** Pestañas de un libro de Google Sheets, leídas por el Apps Script (el libro debe estar compartido con la cuenta dueña del script). Solo administradores. */
export async function leerPestanasLibro(url: string): Promise<{ nombre: string; pestanas: PestanaLibro[] }> {
  return pestanasDeRespuesta(await llamarEnvios<unknown>('tx_pestanas', { url: url.trim() }));
}
