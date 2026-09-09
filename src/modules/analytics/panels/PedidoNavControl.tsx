import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { matchesQuery } from '../helpers';

/** Navegación entre pedidos del detalle (`PedidoPanel`): flechas ◀/▶ de a
 * uno, un contador editable para saltar directo a la posición N, y un
 * desplegable buscable (por número o cliente) para saltar a cualquier
 * pedido de `lista` sin contarlos uno por uno. Navegación por teclado
 * (↓/↑/Enter/Escape) en el buscador sigue el mismo patrón que
 * `ui/SuggestInput.tsx`, adaptado para mostrar la lista completa al abrir
 * en vez de solo tras escribir. */
export function PedidoNavControl({ lista, idx, irA, etiqueta }: {
  lista: string[];
  idx: number;
  irA: (i: number) => void;
  etiqueta: (pedido: string) => string;
}) {
  const [texto, setTexto] = useState(String(idx + 1));
  useEffect(() => { setTexto(String(idx + 1)); }, [idx]);

  const commit = () => {
    const n = Number(texto);
    if (Number.isFinite(n) && n >= 1 && n <= lista.length) irA(n - 1);
    else setTexto(String(idx + 1));
  };

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(idx >= 0 ? idx : 0);
  const listRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  const opciones = useMemo(
    () => lista.map((p, i) => ({ pedido: p, i, label: etiqueta(p) })),
    [lista, etiqueta],
  );
  const filtradas = useMemo(
    () => (q ? opciones.filter((o) => matchesQuery(q, `${o.pedido} ${o.label}`)) : opciones),
    [q, opciones],
  );

  const abrir = () => {
    setOpen(true);
    setQ('');
    setHi(idx >= 0 ? idx : 0);
    setTimeout(() => activeRef.current?.scrollIntoView({ block: 'nearest' }), 0);
  };
  const elegir = (i: number) => { irA(i); setOpen(false); };

  return (
    <div className="flex shrink-0 items-center gap-1">
      <button type="button" title="Pedido anterior" disabled={idx <= 0} onClick={() => irA(idx - 1)} className="rounded-md border border-border p-1 disabled:opacity-30">
        <ChevronLeft className="size-3.5" />
      </button>
      <input
        value={texto}
        onChange={(e) => setTexto(e.target.value.replace(/[^0-9]/g, ''))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          else if (e.key === 'Escape') { e.preventDefault(); setTexto(String(idx + 1)); (e.target as HTMLInputElement).blur(); }
        }}
        title="Ir al pedido N de la lista"
        className="h-6 w-9 rounded-md border border-border bg-bg-elevated px-1 text-center text-[11px] tabular-nums outline-none focus:border-accent"
      />
      <span className="text-[11px] text-text-faint tabular-nums">/{lista.length}</span>
      <button type="button" title="Pedido siguiente" disabled={idx < 0 || idx >= lista.length - 1} onClick={() => irA(idx + 1)} className="rounded-md border border-border p-1 disabled:opacity-30">
        <ChevronRight className="size-3.5" />
      </button>
      <div className="relative">
        <button
          type="button"
          title="Buscar pedido"
          onClick={() => (open ? setOpen(false) : abrir())}
          className="rounded-md border border-border p-1 hover:border-accent"
        >
          <ChevronDown className="size-3.5" />
        </button>
        {open && (
          <div className="absolute right-0 z-30 mt-1 w-72 rounded-md border border-border bg-bg-elevated shadow-lg">
            <input
              autoFocus
              value={q}
              onChange={(e) => { setQ(e.target.value); setHi(0); }}
              onBlur={() => setTimeout(() => setOpen(false), 120)}
              onKeyDown={(e) => {
                if (!filtradas.length) return;
                if (e.key === 'ArrowDown') { e.preventDefault(); setHi((i) => Math.min(i + 1, filtradas.length - 1)); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((i) => Math.max(i - 1, 0)); }
                else if (e.key === 'Enter') { e.preventDefault(); elegir(filtradas[hi].i); }
                else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
              }}
              placeholder="Buscar pedido…"
              autoComplete="off"
              className="w-full border-b border-border bg-transparent px-2 py-1.5 text-xs outline-none"
            />
            <div ref={listRef} className="max-h-64 overflow-y-auto">
              {filtradas.length === 0 && <p className="px-2 py-2 text-xs text-text-faint">Sin resultados.</p>}
              {filtradas.map((o, fi) => (
                <button
                  key={o.pedido}
                  ref={o.i === idx ? activeRef : undefined}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => elegir(o.i)}
                  className={`block w-full truncate px-2 py-1.5 text-left text-xs hover:bg-bg-inset ${fi === hi ? 'bg-bg-inset' : ''} ${o.i === idx ? 'text-accent' : ''}`}
                >
                  <span className="tabular-nums text-text-faint">{o.i + 1}.</span> {o.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
