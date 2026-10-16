# Detalle en mosaico (vista guardada del detalle de Seg. de pedidos)

Plantilla reutilizable para los detalles de la app. Código: `src/modules/analytics/panels/DetalleMosaico.tsx`.
Primera implementación: `PedidoPanel.tsx` (detalle de pedido de Seg. de pedidos y Pedidos).

## Estructura

```
┌ cabecera: identidad + datos generales + cifras clave ────────────────────┐
├───────────────┬──────────────────────────────────────────────────────────┤
│ 1 · Lista     │ 3 · Historial de demanda y facturación                   │
│   (scroll)    │     (Consumo del material con "Prom. mensual · 12m       │
│ 2 · Inventario│      cerrados", gráfica, comparativo)                    │
│               │ 4 · Lotes, condiciones y materiales ofertables           │
└───────────────┴──────────────────────────────────────────────────────────┘
```

| Módulo | Contenido | Componente |
|---|---|---|
| Cabecera | Datos generales (pedido, destinatario, solicitante, ejecutivo, grupo, OC/fecha, centro) y cifras (importe, pendiente, precio, estado, costo) | `MetaField` + HTML propio |
| 1 | Lista de renglones con cantidad pendiente; clic cambia el material en foco. **Único módulo con scroll interno** | `Tile` + `ListaScroll` |
| 2 | Inventario del material: Principales, Otros centros (con `prom 12m`), Centro 1031 alm. 1030/1032, Solicitar. Casilla "Ocultar inventarios en 0" | `InventarioPrincipalSection` (`SugDetallePanel.tsx`) o `InventarioColumna` (`DetalleLayout.tsx`) |
| 3 | `HistorialConsumo` (consumo del material, precios por condición, gráfica con filtro de periodo, comparativo anual) | `HistorialConsumo` (`DetalleLayout.tsx`) |
| 4 | Tabla única de lotes, condiciones y ofertables con "Considerar centros", casillas y "Copiar datos de oferta" | `LotesOfertablesSection` (`OpcionesOferta.tsx`) |

## Reglas de tamaño
Todo depende del **ancho del panel** (container queries de Tailwind v4: `@container`, `@xl`, `@5xl`), no del de la ventana,
para que funcione en pantalla dividida, tablet y móvil:

- `< 36 rem` (`@xl`): una columna.
- `≥ 36 rem`: módulos 1 y 2 lado a lado (`aside` en 2 columnas, mismo alto).
- `≥ 64 rem` (`@5xl`): mosaico de 12 columnas. Izquierda `col-span-3` (módulos 1 y 2 apilados) y derecha `col-span-9` (3 y 4).
- Alto de la lista del módulo 1: `max-h-[18rem]` (`@5xl:max-h-[22rem]`), ajustable en `ListaScroll`.
- Solo el módulo 1 hace scroll; 2, 3 y 4 muestran todo su contenido.

## Cómo replicarla en otro detalle
```tsx
<DetalleMosaico
  cabecera={<header>…datos generales y cifras…</header>}
  izquierda={<>
    <Tile icon={Package} title="1. …" className="h-full" bodyClassName="flex min-h-0 flex-col">
      <ListaScroll>…renglones…</ListaScroll>
    </Tile>
    <Tile icon={Boxes} title="2. Disponibilidad de inventario" className="h-full" bodyClassName="p-3">
      <InventarioPrincipalSection … />   {/* o <InventarioColumna … /> */}
    </Tile>
  </>}
  derecha={<>
    <Tile icon={BarChart2} title="3. Historial de demanda y facturación" bodyClassName="p-4">
      <HistorialConsumo … promedioMensual={promedio12m} />
    </Tile>
    <Tile icon={Layers} title="4. Lotes, condiciones y materiales ofertables" bodyClassName="p-4">
      <LotesOfertablesSection … />
    </Tile>
  </>}
/>
```
Ya replicado: Facturación (ClienteDetallePanel).
Pendiente por replicar: Material, Consumo de material, Centro (Inv. Disponibilidad), Inv con Condición y Sugerencia
(hoy usan `DetalleLayout`, con columna izquierda de 14 rem y collage auto-ajustable).

## Reglas de negocio que ya trae
- Prom. mensual = 12 meses cerrados ÷ 12 (misma regla que Consumo/Facturación).
- Lotes y ofertables sin existencia (0) no se muestran; "Ocultar inventarios en 0" persiste.
- Costo ocultable por permiso de rol; precios por condición en 0 no aparecen.
