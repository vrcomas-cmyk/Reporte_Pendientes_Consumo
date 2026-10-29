# Acceso por roles a los datos

Permite compartir el link de la app con ejecutivos y otros roles, decidiendo **qué datos** (no solo qué pantallas) recibe cada uno. El recorte se hace en el servidor, antes de enviar nada al navegador; por eso también cubre lo que se copia o descarga.

## Cómo funciona

```
Navegador ──(sesión Supabase)──▶ Edge Function `datos` ──(token secreto)──▶ Apps Script ──▶ Google Sheets
                                   │ valida usuario, rol y zonas
                                   └ recorta la respuesta según su política
```

- El navegador **ya no conoce** la URL de los Apps Script. Los Apps Script **rechazan** cualquier llamada sin el token.
- Admin y roles sin configurar: la respuesta pasa tal cual (nada cambia para ellos).
- Código: `supabase/functions/datos/index.ts` (la función) y `supabase/functions/datos/accesoDatos.ts` (las reglas, con pruebas en `src/core/accesoDatos.test.ts`).

## Qué se puede decidir (Administración › Acceso a datos)

| Opción | Efecto en el servidor |
|---|---|
| Ver solo su zona | Pedidos y facturación de otras zonas llegan recortados. En Comodato (libros) recibe solo los renglones de su zona (por la columna Gpo. Vdor. del libro; si el libro no la trae, no recibe nada). |
| Ver precio e importes de otras zonas | Apagado: de los pedidos ajenos solo llegan pedido, fecha, cliente, material, cantidad, pendiente, bloqueos y centro/almacén. De la facturación ajena solo mes, material, centro/almacén, cantidad (sin cliente ni importe). |
| Ver costos | Apagado: toda columna cuyo nombre contenga «costo» o «margen» llega vacía. |
| Condiciones permitidas + caducidad máx. por condición | La lista sale de «Inv con Condición» (Lento mov, Revision Liz, Marcas propias…). Las pestañas de condición no permitidas llegan vacías; la pestaña Revision se filtra renglón por renglón según su Status; en las permitidas solo lotes que vencen en menos de N meses; `InvConsolidado` solo con las condiciones permitidas. |
| Ver regla «1032 con más de 12 meses = Corta caducidad» | Apagado: no llegan los lotes del almacén 1032 con más de 12 meses de vigencia. |
| Zonas por usuario | La zona sale del catálogo de ejecutivos por el correo del usuario; aquí se puede fijar a mano (tiene prioridad). |

Reglas de seguridad: una zona desconocida se trata como ajena; una acción o fuente sin filtro (`incremento_costos_url`, acciones antiguas `manifest`/`chunk`) **no se entrega** a un usuario restringido.

## Despliegue (en este orden — no saltar pasos)

1. **Migración 0026** en el SQL editor de Supabase (agrega columnas opcionales; no restringe a nadie).
2. **Token**: genera uno largo y aleatorio (≥ 32 caracteres).
   - Supabase: `supabase secrets set DATOS_APPS_TOKEN=<token>`
   - Cada Apps Script (pedidos, catálogo, incremento): Configuración del proyecto › Propiedades del script › `API_TOKEN` = `<token>`.
   - El código que lo valida ya está en los tres: `docs/apps-script-pedidos.gs` (`_tokenValido`) y los bloques de código de `apps-script-catalogo.md` y `apps-script-incremento.md` (`tokenValido`, llamada al inicio de `doGet`). **Copia la versión nueva a cada proyecto de Apps Script** (están en la nube; editar estos archivos no los cambia). Después de editar, crear **nueva versión** en Implementar › Administrar implementaciones.
3. **Desplegar la función**: `supabase functions deploy datos --no-verify-jwt` (la función valida la sesión por su cuenta con `auth.getUser`; sin `--no-verify-jwt`, con las llaves nuevas `sb_publishable_…` la puerta de Supabase puede rechazar la llamada antes de llegar a la función y el navegador solo ve un error de red).
4. **Probar** con un usuario no admin (ver abajo). Mientras `VITE_DATOS_PROXY` no esté en `on`, la app sigue llamando directo y todo funciona como antes.
5. **Activar el proxy**: en el build de producción, `VITE_DATOS_PROXY=on`, y **quitar** del build las `VITE_*_URL` de los Apps Script (si no, quedan visibles en el JavaScript publicado). Publicar.
6. **Migración 0028** (protege el costo de las propuestas de precio) junto con la publicación de la app: después de aplicarla, `costo_al_enviar` ya no se puede leer con `select` directo, solo por la función `degasa_precio_propuestas()` y únicamente quien tiene permiso de ver costos.
7. **Migración 0027** (solo admins leen las URLs de `degasa_connectors`). Aplicarla al final: antes de que la app nueva esté publicada rompería la carga de datos de los usuarios no admin.
8. Crear el rol «Ejecutivo» (Administración › Roles y permisos), darle los módulos permitidos y configurar su fila en «Acceso a datos». Invitar a los ejecutivos con ese rol.

> Si ya circuló la URL de algún Apps Script (está en `.env.example` y en el historial de git), el token es lo que la inutiliza. Para mayor seguridad, además, crea un deployment nuevo del Apps Script y actualiza el conector.

## Cómo comprobar que no se filtra nada

Con un usuario de prueba (rol restringido), en DevTools › Network:
- Las respuestas de `.../functions/v1/datos/pedidos_sheets_url?action=hoja&libro=pedidos…`: en renglones de otra zona, `Precio`, `Precio1`, `$ Pendiente` vacíos.
- `…action=fac_chunk…`: en renglones ajenos, `Razon Social`, `Solicitante`, `Destinatario`, `Importe`, `Precio Min/Max` vacíos.
- Llamar a la URL del Apps Script sin token → `No autorizado`.
- `select * from degasa_connectors` desde la consola con su sesión → sin filas (tras 0027).
- Exportar a Excel desde Seg pedidos / Facturación / Inventario: no aparece nada que no esté en pantalla.

## Límites conocidos (pendientes)

- Las **propuestas de precio** (precio propuesto/autorizado, estado, quién las pidió) siguen siendo legibles por todo invitado: así se calculan los precios ofertables. Solo el costo está protegido (0028). Las tablas de política de márgenes (`degasa_precio_politica`, `_markdown`, `_condicion`, `_margen_min`) también son legibles por todo invitado.
- El `VITE_DRP_TOKEN` del webhook DRP va en el JavaScript del navegador.
- Los módulos de Análisis Directivo, Dashboard y similares leen la misma facturación: los renglones de otras zonas llegan sin cliente ni importe, pero **no** se ocultan en esas pantallas (solo en Seg pedidos y Consumo/Facturación). Si un rol restringido no debe ver esos módulos, quitarle el módulo en «Roles y permisos».
- Un usuario sin rol asignado sigue viendo todo (comportamiento previo de la app). Asignar rol a todo invitado.
- Cachés del navegador (IndexedDB) de sesiones anteriores en la misma computadora conservan lo que ese navegador ya había descargado.
