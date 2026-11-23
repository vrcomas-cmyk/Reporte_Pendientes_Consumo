# Envíos (Transmisión, DRP y Mercancía sin cargo) — guía de despliegue

Trae al portal las funciones de la app «Envios en transmision». **Fase 1 (esta): Transmisión dentro de Seg. de pedidos.** Fases 2 y 3: DRP y Mercancía sin cargo.

## Cómo está armado
```
Navegador ──(sesión de Supabase)──▶ función `envios` ──(token secreto + tu correo ya validado)──▶ TU Apps Script (el mismo ya publicado) ──▶ Google Sheets
```
- Se usa **el mismo Apps Script y la misma URL** que ya tienes publicados. No se publica otro script. Solo se le **agrega un archivo** con las funciones del portal y se cambia **una línea** de `despacharRuta`.
- Las funciones del portal (`portal_…`) **exigen un token** (`PORTAL_TOKEN`). Las acciones originales de la página siguen exactamente igual.
- El navegador **nunca** conoce la URL del Apps Script ni su token: solo habla con la función `envios`, que valida al usuario (invitado), que la acción esté en una lista cerrada y que **su rol tenga permiso del módulo** (`transmision`).
- Las URLs de los libros de transmisión y del histórico viven en las **propiedades del script**, no en el navegador.

> **Seguridad, lo que sí y lo que no cambia.** El script original se publicó «ejecutar como yo / acceso cualquiera» **sin autenticación**: las acciones viejas (`leerHoja`, `enviarCorreosCentros`, `guardarDirectorio`…) las puede llamar cualquiera que tenga la URL. Esta guía **no cierra** eso: solo hace que lo nuevo del portal sí esté protegido. Cuando migres todo al portal, lo ideal es retirar la página original y dejar solo las acciones `portal_…` (o pedirme el endurecimiento del script).

## Qué significa «en transmisión» (importante)
Las pestañas mensuales de transmisión tienen **Pedido SAP + Delivery** y **no tienen material ni lote**. Por eso:
- Un pedido está «en transmisión» **a nivel de entrega**: se muestra la(s) entrega(s) y la fecha.
- Un material de ese pedido solo se marca cuando el histórico **«Envio en transmision»** (Pedido, Material, Lote) lo asocia a esa entrega. Si no hay histórico, el pedido sigue marcado pero no se afirma nada de sus materiales.
- Pedido, entrega y material se comparan **sin ceros a la izquierda** (`0080012345` = `80012345`), siempre igual (el original lo hacía de dos maneras).

## Pasos de publicación
1. **Apps Script (tu proyecto actual):**
   1. Abre el proyecto donde está `codigo.gs`. *Archivos → +* → Script → nómbralo `portal` y pega `docs/apps-script-envios-portal.gs`.
   2. En `codigo.gs`, dentro de `despacharRuta`, cambia la **última línea del switch** (la rama `default`):
      ```js
      // antes
      default: respuesta = { exito: false, mensaje: 'Acción no válida: ' + p.action };
      // después
      default: respuesta = portalDespachar(p);
      ```
      (`portalDespachar` responde ese mismo mensaje para cualquier acción que no sea del portal.) **No cambies `VERSION`**: la página original sigue pidiendo la 21.
   3. *Configuración del proyecto → Propiedades del script* → crea **una sola** propiedad:
      | Propiedad | Valor |
      |---|---|
      | `PORTAL_TOKEN` | un secreto largo y aleatorio (≥ 24 caracteres). **Guárdalo**: lo necesitas en el paso 3. |

      Los libros de transmisión, sus pestañas y el libro histórico **ya no se configuran aquí**: se administran desde la app (paso 5), así que cambiar de mes o agregar un libro no requiere tocar el script.
   4. **Implementar → Administrar implementaciones →** edita la implementación existente **→ Versión: Nueva versión → Implementar.** (La URL **no cambia**: no hay que tocar `config.js` de la app original.)
2. **Supabase – migración**: aplica `supabase/migrations/0032_modulos_envios.sql` (crea el módulo `transmision` y el conector `envios_apps_url`).
3. **Supabase – secretos y función** (con el CLI, o desde el panel → Edge Functions → Secrets):
   ```
   supabase secrets set ENVIOS_APPS_TOKEN=<el mismo valor de PORTAL_TOKEN>
   supabase secrets set ALLOWED_ORIGINS=https://<dominio-del-portal>
   supabase functions deploy envios
   ```
   La función se despliega **con la verificación de JWT activada** (igual que `datos`): la plataforma rechaza con 401 cualquier llamada sin sesión, y además la función valida al usuario ella misma.
   `ALLOWED_ORIGINS` lleva el/los dominios del portal separados por comas (p. ej. `https://tu-portal.vercel.app`). **`localhost` siempre se permite**, así que para usar el portal en tu equipo no hace falta definirlo; sí hace falta cuando lo abras desde el sitio publicado.

   **Cómo crear el secreto sin copiarlo a ningún chat o documento:** en el editor de Apps Script ejecuta una vez `function tokenNuevo(){ console.log(Utilities.getUuid() + Utilities.getUuid()); }`, copia el valor del registro y pégalo en los dos lugares con el **mismo** valor (propiedad `PORTAL_TOKEN` del script y secret `ENVIOS_APPS_TOKEN` de Supabase). Después borra la función `tokenNuevo`.
4. **Portal – conector**: Administración → Conectores → *Apps Script · Envíos* → pega la URL `/exec` del script (la misma que usa `config.js` de la app original).
5. **Portal – libros y pestañas** (Administración → **Envíos**): agrega la URL de cada libro de transmisión, pulsa **«Leer pestañas»** y elige «Todas las de transmisión» (recomendado: los meses nuevos entran solos) o marca las pestañas concretas. Opcionalmente agrega el **libro histórico** (el de la pestaña `Envio en transmision`) para que se marquen los materiales de cada entrega. Guarda. Cada libro debe estar **compartido con la cuenta dueña del Apps Script**. Solo un administrador puede ver y cambiar esto.
6. **Portal – permisos**: Administración → Roles → concede el módulo **«Transmisión (en Seg. de pedidos)»** solo a los roles que deban verlo. Un rol restringido sin este permiso no ve la columna ni el filtro, y la función rechaza sus llamadas (403). Administradores y usuarios sin rol no tienen restricción.

## Probar
1. Autoriza el script una vez: en el editor de Apps Script ejecuta `_portalTxPestanas` (te pedirá permiso para leer hojas; fallará por no tener URL, es normal). Después, en Administración → Envíos, **«Leer pestañas»** debe mostrar las pestañas de tu libro.
2. En el portal, entra con un usuario con permiso → Seg. de pedidos: aparece la columna **Transmisión**; un pedido que sabes que está en transmisión muestra «Entrega … · fecha».
3. Con un usuario **sin** permiso: no aparece la columna y, si llamas a la función a mano, responde 403.
4. Llama a la función sin sesión → 401. Desde un origen que no esté en `ALLOWED_ORIGINS` el navegador bloquea la respuesta (CORS).
5. La página original sigue funcionando igual (misma URL, mismas acciones).

## Límites conocidos
- El índice se guarda 5 min en la caché del script y en el navegador (se refresca solo y con «Reintentar» si hubo error).
- Una pestaña se reconoce por sus encabezados (`Pedido SAP`, `Delivery`, `Fecha t…`); si cambias esos nombres, hay que actualizar `_portalTxColumnas`.
- Cada petición abre los libros configurados en Administración → Envíos; el límite de Apps Script (~6 min) alcanza de sobra para los meses de transmisión, pero no pongas libros enormes que no sean de transmisión.
- Las fases 2 y 3 agregarán a este mismo archivo `portal.gs` sus acciones (`portal_drp_…`, `portal_sc_…`), con el mismo token.
