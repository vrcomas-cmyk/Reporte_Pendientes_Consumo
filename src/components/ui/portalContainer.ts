import * as React from 'react';

/** Elemento donde deben montarse los popovers (y demás capas flotantes) que se abren DENTRO de un panel modal (`Sheet`).
 * Un Sheet modal deja `pointer-events: none` en todo lo que queda fuera de su contenido, así que un Popover portado a `body` no recibía los
 * clics (los filtros de columna no se podían activar). Montándolo dentro del contenido del Sheet sí funciona. `null` = fuera de un Sheet (body). */
export const PortalContainerContext = React.createContext<HTMLElement | null>(null);
