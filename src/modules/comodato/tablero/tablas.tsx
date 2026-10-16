import { TableCell, TableRow } from '@/components/ui/table';
import { F, num, tipoEq, type Fila } from '@/core/comodatoTablero';
import { RoiCell, Tabla, TipoTag, fmt, fmtN, t } from './piezas';

/** Rentabilidad por canister / equipo; clic en un equipo abre su ficha. */
export function EquipoTable({ rows, onEquipo }: { rows: Fila[]; onEquipo: (desc: string, cod: string) => void }) {
  const m = new Map<string, { tipo: ReturnType<typeof tipoEq>; cod: string; pzs: number; inv: number; bol: number; fac: number; mar: number; cli: Set<string> }>();
  for (const d of rows) {
    const k = t(d, F.desc) || '—';
    const v = m.get(k) ?? { tipo: tipoEq(d), cod: t(d, F.mat), pzs: 0, inv: 0, bol: 0, fac: 0, mar: 0, cli: new Set<string>() };
    v.pzs += num(d[F.cant]); v.inv += num(d[F.inv]); v.bol += num(d[F.bolsas]); v.fac += num(d[F.fact]); v.mar += num(d[F.margen]); v.cli.add(t(d, F.cliente));
    m.set(k, v);
  }
  const filas = [...m.entries()].sort((a, b) => b[1].mar - a[1].mar).map(([k, v]) => (
    <TableRow key={k} className="cursor-pointer" onClick={() => onEquipo(k, v.cod)}>
      <TableCell><b>{k}</b> <TipoTag tipo={v.tipo} /></TableCell>
      <TableCell className="text-right tabular-nums">{v.cli.size}</TableCell>
      <TableCell className="text-right tabular-nums">{fmtN(v.pzs)}</TableCell>
      <TableCell className="text-right tabular-nums">{fmt(v.inv)}</TableCell>
      <TableCell className="text-right tabular-nums">{fmtN(v.bol)}</TableCell>
      <TableCell className="text-right tabular-nums">{fmt(v.fac)}</TableCell>
      <TableCell className="text-right tabular-nums">{fmt(v.mar)}</TableCell>
      <TableCell className="text-right"><RoiCell v={v.inv ? v.mar / v.inv : 0} /></TableCell>
      <TableCell className="text-right tabular-nums">{v.fac ? Math.round((v.mar / v.fac) * 100) : 0}%</TableCell>
    </TableRow>
  ));
  return (
    <Tabla
      titulo="🧪 Rentabilidad por canister / equipo (clic = clientes y bolsas)"
      cols={[{ t: 'Equipo' }, { t: 'Clientes con este equipo', num: true }, { t: 'Piezas en comodato', num: true }, { t: 'Inversión en comodato', num: true }, { t: 'Bolsas facturadas', num: true }, { t: 'Facturación acumulada', num: true }, { t: 'Margen acumulado', num: true }, { t: 'ROI (veces)', num: true }, { t: '% de margen sobre venta', num: true }]}
      filas={filas}
      cuenta={`${m.size} equipos`}
    />
  );
}

/** Ranking por bolsa (consumible): qué bolsa se vende más. */
export function BolsaTable({ bolsas }: { bolsas: Fila[] }) {
  const s = [...bolsas].sort((a, b) => num(b.importe_vendido) - num(a.importe_vendido));
  const filas = s.length
    ? s.map((d, i) => (
      <TableRow key={i}>
        <TableCell><b>{t(d, 'descripcion_consumible') || t(d, 'codigo_consumible')}</b></TableCell>
        <TableCell className="text-right tabular-nums">{num(d.num_clientes)}</TableCell>
        <TableCell className="text-right tabular-nums">{fmtN(d.bolsas_facturadas)}</TableCell>
        <TableCell className="text-right tabular-nums">{fmt(d.importe_vendido)}</TableCell>
        <TableCell className="text-right tabular-nums">{fmt(d.margen_total)}</TableCell>
        <TableCell className="text-right tabular-nums">{num(d.pct_margen)}%</TableCell>
        <TableCell className="text-right tabular-nums">{fmt(d.precio_prom_bolsa)}</TableCell>
      </TableRow>
    ))
    : [<TableRow key="vacio"><TableCell colSpan={7} className="text-text-muted">Sin facturación de bolsas.</TableCell></TableRow>];
  return (
    <Tabla
      titulo={<>💧 Facturación por bolsa (consumible) — qué bolsa se vende más <span className="ml-2 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning" title="El ranking viene ya sumado del SQL por bolsa; no se puede recalcular por cliente o equipo.">Excepción: total del libro, no sigue los filtros</span></>}
      cols={[{ t: 'Bolsa' }, { t: 'Clientes que la compran', num: true }, { t: 'Bolsas facturadas', num: true }, { t: 'Importe vendido', num: true }, { t: 'Margen total', num: true }, { t: '% de margen', num: true }, { t: 'Precio promedio por bolsa', num: true }]}
      filas={filas}
      cuenta={`${s.length} bolsas`}
    />
  );
}
