import { Input } from '@/components/ui/input';
import { useMemo, useState } from 'react';
import { Send, Trash2, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { formatCurrency } from '@/lib/utils';
import { norm, numLoose } from '@/lib/text';
import { toast } from '@/store/toastStore';
import { BANDERA_CC, BANDERA_PNC, combinacionDe, precioValido } from '@/core/politicaPrecios';
import { etiquetaCombinacion } from '@/core/enrich';
import type { MaterialPrecio } from '@/core/calculadoraPrecios';
import { diaIso, registrarVigentes, type NuevaPropuesta } from '@/services/preciosService';

interface Renglon { material: string; precio: number | null }

interface Props {
  materiales: ReadonlyMap<string, MaterialPrecio>;
  /** Status de Revision disponibles como condición. */
  estados: readonly string[];
  email: string;
  costoVisible: boolean;
  onEnviado: () => Promise<void> | void;
}

/** Cada renglón pegado: «material  precio» separado por tab, espacio, coma o punto y coma (lo que sale de copiar dos columnas de Excel). */
export function leerPegado(texto: string): { material: string; precio: number | null }[] {
  const out: { material: string; precio: number | null }[] = [];
  for (const linea of texto.split(/\r?\n/)) {
    const t = linea.trim();
    if (!t) continue;
    const [mat, ...resto] = t.split(/[\t;]+|\s{1,}/).filter(Boolean);
    const precioTxt = resto.join('').replace(/[$\s]/g, '');
    const precio = precioTxt ? numLoose(precioTxt) : 0;
    out.push({ material: mat, precio: precio > 0 ? precio : null });
  }
  return out;
}

/** Código sin espacios, sin «.0» final ni ceros a la izquierda (Excel los cambia al pegar). */
const canon = (m: string) => m.trim().replace(/\.0+$/, '').replace(/^0+(?=\d)/, '');

/** Captura simple: condiciones → materiales (buscados o pegados con su precio) → enviar a autorización. */
export function CapturaPrecios({ materiales, estados, email, costoVisible, onEnviado }: Props) {
  const [banderas, setBanderas] = useState<Set<string>>(new Set());
  const [combos, setCombos] = useState<string[]>([]);
  const [busca, setBusca] = useState('');
  const [pegado, setPegado] = useState('');
  const [filas, setFilas] = useState<Renglon[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [desde, setDesde] = useState(() => diaIso(new Date()));
  const [hasta, setHasta] = useState('');

  const comboActual = combinacionDe([...banderas]);

  const alternar = (b: string) => setBanderas((s) => { const n = new Set(s); if (n.has(b)) n.delete(b); else n.add(b); return n; });
  function agregarCombo() {
    if (!comboActual) return;
    setCombos((c) => (c.includes(comboActual) ? c : [...c, comboActual]));
    setBanderas(new Set());
  }

  const encontrados = useMemo(() => {
    const q = norm(busca).toLowerCase();
    if (q.length < 2) return [];
    const tokens = q.split(' ').filter(Boolean);
    const out: MaterialPrecio[] = [];
    for (const [k, m] of materiales) {
      const hay = `${k} ${m.texto}`.toLowerCase();
      if (tokens.every((t) => hay.includes(t))) out.push(m);
      if (out.length >= 8) break;
    }
    return out;
  }, [busca, materiales]);

  function poner(items: { material: string; precio: number | null }[]) {
    setFilas((actual) => {
      const por = new Map(actual.map((f) => [norm(f.material), f]));
      for (const i of items) {
        const k = norm(i.material);
        const prev = por.get(k);
        por.set(k, { material: prev?.material ?? i.material, precio: i.precio ?? prev?.precio ?? null });
      }
      return [...por.values()];
    });
  }

  function aplicarPegado() {
    const items = leerPegado(pegado);
    if (!items.length) { toast.warning('Nada que pegar', 'Pega dos columnas: material y precio.'); return; }
    poner(items);
    setPegado('');
  }

  const porCodigo = useMemo(() => new Map([...materiales.values()].map((m) => [canon(m.material), m])), [materiales]);
  const detalle = filas.map((f) => {
    const m = materiales.get(norm(f.material)) ?? porCodigo.get(canon(f.material));
    const costo = m?.costo ?? 0;
    const problema = !m ? 'No está en el catálogo' : f.precio == null ? 'Falta el precio' : !precioValido(f.precio, costo) ? (costo > 0 ? 'No supera el costo' : 'Sin costo en el catálogo') : '';
    return { f, m, costo, problema };
  });
  const listas = detalle.filter((d) => !d.problema);
  const sinCondicion = combos.length === 0;
  // Lo que falta para poder registrar, a la vista (el botón no se queda mudo).
  const faltantes = [
    ...(sinCondicion ? ['agregar al menos una condición (paso 1: marca casillas y pulsa «Agregar condición»)'] : []),
    ...(!filas.length ? ['agregar materiales'] : !listas.length ? ['corregir los renglones con problema'] : []),
    ...(!hasta ? ['poner la fecha «Hasta» de la vigencia'] : []),
  ];

  async function enviar() {
    if (sinCondicion) { toast.warning('Elige al menos una condición', 'Marca las condiciones y pulsa «Agregar condición».'); return; }
    const items: NuevaPropuesta[] = listas.flatMap((d) => combos.map((c) => ({
      material: d.m!.material, concepto: 'oferta' as const, condicion: c, costo: d.costo, base: 0, precioCalculado: d.f.precio!, precioPropuesto: d.f.precio!,
    })));
    if (!items.length) { toast.warning('No hay precios válidos para enviar'); return; }
    if (!hasta) { toast.warning('Indica la vigencia', 'Pon la fecha hasta la que rigen estos precios; después vuelve el precio anterior.'); return; }
    setOcupado(true);
    try {
      const n = await registrarVigentes(items, email, desde, hasta);
      toast.success('Precios vigentes registrados', `${n} precio(s) rigen del ${desde || 'hoy'} al ${hasta}. Después vuelve el precio anterior.`);
      setFilas((actual) => actual.filter((f) => !listas.some((d) => d.f === f)));
      await onEnviado();
    } catch (e) {
      toast.error('No se pudo registrar', e instanceof Error ? e.message : String(e));
    } finally { setOcupado(false); }
  }

  return (
    <div className="space-y-3">
      <Card className="space-y-2 p-3">
        <h3 className="text-sm font-semibold">1. Condiciones a las que aplica</h3>
        <p className="text-xs text-text-faint">Marca las que forman UNA condición (p. ej. «CC + Lento mov») y pulsa «Agregar condición». Puedes agregar varias; cada precio se manda para cada una.</p>
        <div className="flex flex-wrap items-center gap-3">
          {[BANDERA_CC, BANDERA_PNC, ...estados].map((b) => (
            <label key={b} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={banderas.has(b)} onChange={() => alternar(b)} />{b === BANDERA_CC ? 'Corta caducidad' : b}</label>
          ))}
          <Button size="sm" variant="outline" disabled={!comboActual} onClick={agregarCombo}>Agregar condición</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {combos.map((c) => (
            <span key={c} className="inline-flex items-center gap-1 rounded border border-accent/40 bg-accent-soft px-2 py-0.5 text-xs text-accent">
              {etiquetaCombinacion(c)}
              <button type="button" aria-label={`Quitar ${c}`} onClick={() => setCombos((x) => x.filter((y) => y !== c))}><X className="size-3" /></button>
            </span>
          ))}
          {sinCondicion && <span className="text-xs text-text-faint">Ninguna condición agregada.</span>}
        </div>
      </Card>

      <Card className="space-y-3 p-3">
        <h3 className="text-sm font-semibold">2. Materiales y precios</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-xs text-text-faint" htmlFor="cap-busca">Buscar un material (código o descripción) y agregarlo</label>
            <Input id="cap-busca" type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Ej. 100234 o guante"
              className="mt-1" />
            {encontrados.length > 0 && (
              <ul className="mt-1 divide-y divide-border rounded border border-border text-sm">
                {encontrados.map((m) => (
                  <li key={m.material}>
                    <button type="button" className="flex w-full items-baseline gap-2 px-2 py-1 text-left hover:bg-bg-elevated" onClick={() => { poner([{ material: m.material, precio: null }]); setBusca(''); }}>
                      <span className="font-mono text-xs">{m.material}</span><span className="truncate text-xs text-text-faint">{m.texto}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <label className="text-xs text-text-faint" htmlFor="cap-pega">Pegar material y precio (dos columnas de Excel)</label>
            <textarea id="cap-pega" value={pegado} onChange={(e) => setPegado(e.target.value)} rows={4} placeholder={'100234\t45.50\n100871\t120'}
              className="mt-1 w-full rounded border border-border bg-bg px-2 py-1 font-mono text-xs" />
            <Button size="sm" variant="outline" disabled={!pegado.trim()} onClick={aplicarPegado}>Agregar a la lista</Button>
          </div>
        </div>

        {!filas.length ? <p className="py-4 text-center text-sm text-text-muted">Busca materiales o pega la lista para empezar.</p> : (
          <Table wrapperClassName="max-h-[50vh] rounded-lg border border-border">
            <TableHeader><TableRow>
              <TableHead>Material</TableHead>{costoVisible && <TableHead className="text-right">Costo</TableHead>}
              <TableHead className="text-right">Precio</TableHead><TableHead className="text-right">Margen</TableHead><TableHead>Revisión</TableHead><TableHead className="w-8" />
            </TableRow></TableHeader>
            <TableBody>
              {detalle.map(({ f, m, costo, problema }) => (
                <TableRow key={f.material}>
                  <TableCell><div className="font-mono text-xs">{m?.material ?? f.material}</div><div className="max-w-64 truncate text-[11px] text-text-faint">{m?.texto ?? ''}</div></TableCell>
                  {costoVisible && <TableCell className="text-right tabular-nums">{costo ? formatCurrency(costo) : '—'}</TableCell>}
                  <TableCell className="text-right">
                    <input type="number" min="0" step="0.01" aria-label={`Precio de ${f.material}`} value={f.precio ?? ''}
                      onChange={(e) => { const v = e.target.value === '' ? null : Number(e.target.value); setFilas((x) => x.map((r) => (r === f ? { ...r, precio: v } : r))); }}
                      className="w-24 rounded border border-border bg-bg px-1 py-0.5 text-right tabular-nums" />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{f.precio && costo ? `${Math.round(((f.precio - costo) / f.precio) * 1000) / 10}%` : '—'}</TableCell>
                  <TableCell className={`text-xs ${problema ? 'text-danger' : 'text-success'}`}>{problema || 'Listo'}</TableCell>
                  <TableCell><button type="button" aria-label={`Quitar ${f.material}`} onClick={() => setFilas((x) => x.filter((r) => r !== f))}><Trash2 className="size-3.5 text-text-faint" /></button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card className="flex flex-wrap items-end gap-4 p-3">
        <h3 className="w-full text-sm font-semibold">3. Vigencia</h3>
        <label className="text-xs text-text-faint">Desde<Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="mt-1 w-auto" /></label>
        <label className="text-xs text-text-faint">Hasta (obligatoria)<Input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} className="mt-1 w-auto" /></label>
        <span className="text-xs text-text-faint">No requieren autorización. Al pasar la fecha final vuelve a regir el precio anterior.</span>
      </Card>

      <div className="flex items-center gap-3">
        <Button disabled={ocupado} onClick={() => (faltantes.length ? toast.warning('Falta para registrar', faltantes.join('; ')) : void enviar())}><Send className="mr-1 size-4" />Registrar precios vigentes ({listas.length} × {combos.length || 0})</Button>
        {faltantes.length > 0 && <span className="text-xs text-warning">Falta: {faltantes.join('; ')}.</span>}
        {detalle.length > listas.length && <span className="text-xs text-danger">{detalle.length - listas.length} renglón(es) con problema no se enviarán.</span>}
      </div>
    </div>
  );
}
