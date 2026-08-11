# SequenceDiagrams.md — Flujos de interacción clave

> Parte de la serie de documentación técnica. Cada diagrama responde "¿qué pasa exactamente cuando hago clic aquí?" para una acción concreta.

## 1. Arranque de la app (bootstrap)

```mermaid
sequenceDiagram
    participant M as main.tsx
    participant App
    participant Shell as AppShell
    participant Auth as AuthGate/useAuth
    participant Dexie
    participant Sup as Supabase

    M->>App: render
    App->>App: useEffect: hydrate solicitudStore, conocimientoStore, scoringWeightsStore
    App->>Auth: <AuthGate>
    Auth->>Sup: getSession() + degasa_allowed_users check
    Sup-->>Auth: signed-in / not-allowed
    Auth->>Shell: (si signed-in) render children
    Shell->>Shell: useEffect bootstrap (secuencial, Promise.all)
    Shell->>Dexie: getCachedCatalog()
    Shell->>Dexie: getLatestAnalysis()
    Shell->>Sup: reportRepository.getSettings()
    Dexie-->>Shell: catalog, analysis
    Sup-->>Shell: settings
    Shell->>Shell: setCatalog + setActiveAnalysis + setSettings + setBootstrapped(true)
    alt catálogo vacío (primer arranque)
        Shell->>Shell: syncCatalogFromAppScript() en background
    end
    Shell->>Shell: startReportSheetsWatch() — setTimeout(check, 0)
    Shell->>Shell: checkForReportSheetsUpdate({onPartialResult: applyResult})
    Note over Shell: ver DataFlow.md §3 para el detalle de la sync
```

## 2. Clic en un material (abre el panel `material`)

```mermaid
sequenceDiagram
    participant U as Usuario
    participant Chip
    participant PS as usePanelStore
    participant PH as PanelHost
    participant MP as MaterialPanel

    U->>Chip: clic en <Chip>{material}</Chip>
    Chip->>PS: push({type:'material', material}) o open(...)
    PS->>PS: stack = [...stack, panel]  (nueva referencia)
    PS-->>PH: notifica (suscrito a stack)
    PH->>PH: panel = stack[stack.length-1]
    PH->>MP: <PanelBody panel={panel} a={a} push={push} />
    MP->>MP: lotesF = lotes.filter(...) — POR MATERIAL, sin memo en este panel legacy
    MP->>MP: sug = sugFor(bo, material); cons = consFor(consumo, material)
    MP-->>U: Sheet abre desde la derecha, tabs Sugerencias/Consumo
    U->>MP: clic en tab "Consumo"
    MP->>MP: <ConsumoTable list={cons} a={a} push={push} />
    Note over MP: SugTable/ConsumoTable ahora leen useColumnVisibility('sugerencias_columnas'/'consumo_columnas')<br/>— mismas columnas que la página completa (cambio de esta sesión)
```

## 3. Cambiar de pestaña dentro de un panel con tabs (materialHub / clienteConocimiento)

```mermaid
sequenceDiagram
    participant U as Usuario
    participant Tabs as Radix Tabs
    participant PS as usePanelStore
    participant MHP as MaterialHubPanel

    U->>Tabs: clic en tab "Compatibilidad"
    Tabs->>Tabs: estado interno (uncontrolled) cambia a 'compatibilidad'
    Tabs->>MHP: onValueChange('compatibilidad')
    MHP->>PS: replaceTop({...panel, tab:'compatibilidad'})
    Note over PS: replaceTop() — NO push(). Antes de la corrección de esta sesión,<br/>usaba push() y apilaba una entrada por cada clic de tab,<br/>rompiendo "Atrás" y contribuyendo a un bug de render en cascada
    PS->>PS: stack = [...stack.slice(0,-1), nuevoPanel]
    PS-->>MHP: re-render con panel.tab='compatibilidad' (misma instancia de componente)
```

## 4. Crear una Oportunidad desde una candidata sugerida

```mermaid
sequenceDiagram
    participant U as Usuario
    participant OP as OportunidadesPage
    participant Core as core/oportunidad.ts
    participant CS as conocimientoStore
    participant Repo as oportunidadRepository
    participant Sup as Supabase
    participant Dexie

    Note over OP,Core: Al montar/cambiar datos:
    OP->>Core: buildOportunidadesCandidatas(a.lotes, a.invCondicion, shortExpiryDays, existingKeys)
    Core-->>OP: OportunidadCandidata[] (calculado, NO persistido)
    OP-->>U: chips de candidatas ("4001234 · 48d · [+Crear]")

    U->>OP: clic "Crear" en una candidata
    OP->>CS: addOportunidad(oportunidad)
    CS->>CS: set optimista: oportunidades = [nueva, ...prev]  (UI actualiza YA)
    CS->>Repo: addOportunidad(o)
    Repo->>Sup: insert degasa_oportunidades
    Sup-->>Repo: {local_id}
    Repo->>Dexie: db.oportunidades.put({...o, id})  (espejo)
    Repo-->>CS: id
    CS->>CS: set: reemplaza la oportunidad optimista con la que trae id real
    alt falla el insert en Supabase
        CS->>CS: revierte al estado previo (prev)
        CS->>CS: toast.fromError(err)
    end
```

## 5. Cambiar el estado de una Oportunidad (drag&drop o Select) — y el registro automático de conocimiento

```mermaid
sequenceDiagram
    participant U as Usuario
    participant Card as OportunidadCard / Tray
    participant CS as conocimientoStore
    participant Repo as oportunidadRepository

    U->>Card: suelta la tarjeta en la columna "Colocada total"
    Card->>CS: setEstado(id, 'colocada-total')
    CS->>CS: esCierre = true → cerradaEn = now
    CS->>CS: set optimista (oportunidades actualizada)
    CS->>Repo: updateOportunidad(id, {estado, actualizadaEn, cerradaEn})
    Repo->>Repo: Supabase update + espejo Dexie
    CS->>CS: addInteraccion({tipo:'cambio-estado', resumen:'Estado cambiado a "colocada-total"'})
    Note over CS: Esta línea es la que hace que el conocimiento se capture<br/>SIN depender de que el usuario lo escriba — cada cambio de estado<br/>u oferta empuja su propia Interaccion automáticamente
```

## 6. Generar una Solicitud DRP desde Pedidos

```mermaid
sequenceDiagram
    participant U as Usuario
    participant SP as SugerenciasPage
    participant Dlg as SolicitarDialog
    participant Svc as solicitudService
    participant SS as solicitudStore
    participant Dexie
    participant AS as Apps Script (DRP)

    U->>SP: clic derecho en fila → "Solicitar"
    SP->>Svc: buildFromSugerencia(bo, k, fuente, enrich)
    Svc-->>SP: SolicitudDraft (con loteOptions si hay varias fuentes)
    SP->>Dlg: solicitar.abrir(draft, loteOptions)
    Dlg-->>U: modal — elegir lote, ajustar cantidad/comentarios
    U->>Dlg: confirmar
    Dlg->>Svc: crear(form)
    Svc->>Svc: sync: 'pendiente' (DRP_AUTO_SEND = false)
    Note over Svc,AS: enviarSolicitudDRP() EXISTE pero no se invoca —<br/>el flujo real hoy termina aquí, no llega a Apps Script
    Svc->>Dexie: db.solicitudes.put(solicitud)
    Svc-->>SS: addSolicitud(solicitud)
    SS-->>SP: sourceKeys actualizado → badge "ya solicitado"
    Note over U: El usuario exporta a Excel desde Solicitudes DRP<br/>y pega manualmente en el Sheet "DRP"
```

## 7. Registrar una oferta y su resultado (scoring en acción)

```mermaid
sequenceDiagram
    participant U as Usuario
    participant MHP as MaterialHubPanel (tab Compatibilidad)
    participant Score as core/scoring.ts
    participant CCP as ClienteConocimientoPanel (tab Ofertas)
    participant CS as conocimientoStore

    Note over MHP,Score: Al abrir la pestaña Compatibilidad:
    MHP->>Score: rankClientes(material, {consumo, rf, bo, abc, condicion,<br/>diasVigencia, precioOferta, precioLista, clientesByDest, ofertas, pesos})
    loop por cada cliente candidato
        Score->>Score: scoreCliente() — 10 criterios, cada uno fracción×peso
    end
    Score-->>MHP: ScoreResult[] ordenado, con bloqueantes separados
    MHP-->>U: lista "Aceptados" + "Descartados (razón visible)"

    U->>MHP: clic "Ofertar" en un cliente
    MHP->>CCP: push({type:'clienteConocimiento', tab:'ofertas', prefillMaterial})
    U->>CCP: completa cantidad/precio, "Registrar oferta"
    CCP->>CS: addOferta(oferta)
    CS->>CS: Supabase insert + Dexie espejo + addInteraccion(tipo:'oferta')
    CS->>CS: clientesByDest se RECALCULA completo (deriveMetrics: tasaAceptacion, tiempoRespuestaProm)

    Note over U: Días después — el usuario marca el resultado:
    U->>CCP: clic "Rechazó" + motivo
    CCP->>CS: registrarResultado(id, {resultado:'rechazada', motivoRechazo})
    CS->>CS: addInteraccion(...) — timeline se actualiza solo
    Note over Score: La PRÓXIMA vez que se abra Compatibilidad para este material,<br/>el criterio "rechazo-reciente" verá esta oferta y penalizará -15<br/>si es &lt;30 días — el ranking cambia SIN tocar código
```

## 8. Error boundary y recuperación

```mermaid
sequenceDiagram
    participant Comp as Cualquier componente
    participant EB as ErrorBoundary (global, App.tsx)
    participant U as Usuario

    Comp->>Comp: throw (render error, ej. acceso a propiedad de undefined)
    Comp-->>EB: React propaga el error al boundary más cercano
    EB->>EB: getDerivedStateFromError → state.error = err
    EB->>EB: componentDidCatch → console.error(err, componentStack)
    EB-->>U: "Ocurrió un error al mostrar esta vista" + botón Reintentar
    Note over EB: Hay UN SOLO ErrorBoundary global (sin resetKey) en App.tsx.<br/>AppShell también envuelve el &lt;Outlet/&gt; en su PROPIO ErrorBoundary<br/>con resetKey={location.pathname} — ese sí se auto-limpia al navegar.
    U->>EB: clic "Reintentar"
    EB->>EB: setState({error:null})
    EB-->>Comp: vuelve a intentar el render
```
