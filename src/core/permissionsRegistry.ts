// ---------------------------------------------------------------------------
// permissionsRegistry.ts · Static catalog of what each module exposes for
// column/detail-level hiding. Module keys must match the route path (minus
// the leading slash; '/' -> 'dashboard') and the `degasa_modules.key` rows
// from the 0002 migration — the admin UI's Roles/Overrides tabs read this to
// know which toggles to render for a given module.
//
// Extending this to a new module/column is a two-step manual process: add an
// entry here (so the admin UI can toggle it), then read `isColumnHidden`/
// `isDetailHidden` at the actual render site in that module's page — see
// SugerenciasPage.tsx's `fuente` column/detail for the reference example.
// ---------------------------------------------------------------------------

export interface RegistryItem { key: string; label: string }

export const MODULE_COLUMNS: Record<string, RegistryItem[]> = {
  sugerencias: [
    { key: 'fuente', label: 'Fuente (fuente alterna de abasto)' },
    { key: 'precio', label: 'Precio' },
  ],
};

export const MODULE_DETAILS: Record<string, RegistryItem[]> = {
  sugerencias: [
    { key: 'fuente', label: 'Detalle de fuente (lote/centro sugerido/disponible)' },
  ],
};
