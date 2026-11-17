/** ≥100 % verde, 70–99 % ámbar, <70 % rojo. El número siempre va escrito: el color solo refuerza. */
export const claseCumpl = (c: number | null): string => (c == null ? 'text-text-faint' : c >= 1 ? 'text-success' : c >= 0.7 ? 'text-warning' : 'text-danger');
