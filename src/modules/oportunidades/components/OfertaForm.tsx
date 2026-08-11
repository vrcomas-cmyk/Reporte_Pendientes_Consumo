import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useConocimientoStore } from '@/store/conocimientoStore';
import { MOTIVOS_RECHAZO, type CondicionEspecial, type Oferta, type ResultadoOferta } from '@/core/types';

const CONDICIONES: { key: CondicionEspecial; label: string }[] = [
  { key: 'normal', label: 'Normal' },
  { key: 'corta-caducidad', label: 'Corta caducidad' },
  { key: 'lento-movimiento', label: 'Lento movimiento' },
  { key: 'calidad', label: 'Calidad' },
  { key: 'danado', label: 'Dañado' },
];

/** Formulario de registro de ofertas (req. 4): fecha, material, cantidad,
 * condición, caducidad, precio ofertado. El resultado (aceptó/rechazó/
 * pendiente) se marca después, sobre la oferta ya creada. */
export function OfertaForm({ dest, razonSocial, prefillMaterial, prefillOportunidadId, precioLista }: {
  dest: string; razonSocial: string; prefillMaterial?: string; prefillOportunidadId?: number; precioLista?: number;
}) {
  const addOferta = useConocimientoStore((s) => s.addOferta);
  const [material, setMaterial] = useState(prefillMaterial ?? '');
  const [lote, setLote] = useState('');
  const [condicion, setCondicion] = useState<CondicionEspecial>('normal');
  const [fechaCaducidad, setFechaCaducidad] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [precio, setPrecio] = useState('');
  const [comentario, setComentario] = useState('');
  const [saving, setSaving] = useState(false);

  async function registrar() {
    if (!material.trim() || !cantidad || !precio) return;
    setSaving(true);
    const oferta: Oferta = {
      oportunidadId: prefillOportunidadId, dest, razonSocial, material: material.trim(), lote: lote || undefined,
      condicion, fechaCaducidad: fechaCaducidad || null, cantidadOfertada: Number(cantidad), precioOfertado: Number(precio),
      precioLista, fechaOferta: new Date().toISOString(), resultado: 'pendiente' as ResultadoOferta, comentario, creadoPor: '',
    };
    await addOferta(oferta);
    setMaterial(prefillMaterial ?? ''); setLote(''); setCantidad(''); setPrecio(''); setComentario('');
    setSaving(false);
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-bg-elevated p-3">
      <p className="text-xs font-semibold text-text-muted">Nueva oferta</p>
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Material" value={material} onChange={(e) => setMaterial(e.target.value)} disabled={!!prefillMaterial} />
        <Input placeholder="Lote (opcional)" value={lote} onChange={(e) => setLote(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Select value={condicion} onChange={(e) => setCondicion(e.target.value as CondicionEspecial)}>
          {CONDICIONES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </Select>
        <Input type="date" value={fechaCaducidad} onChange={(e) => setFechaCaducidad(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input type="number" min={0} placeholder="Cantidad ofertada" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
        <Input type="number" min={0} step="0.01" placeholder="Precio ofertado" value={precio} onChange={(e) => setPrecio(e.target.value)} />
      </div>
      <Input placeholder="Comentario (opcional)" value={comentario} onChange={(e) => setComentario(e.target.value)} />
      <Button size="sm" onClick={registrar} disabled={saving || !material.trim() || !cantidad || !precio} className="self-start">
        {saving ? 'Registrando…' : 'Registrar oferta'}
      </Button>
    </div>
  );
}

/** Fila de una oferta ya registrada, con acciones para marcar el resultado —
 * separado de OfertaForm porque una alimenta creación y la otra actualización. */
export function OfertaRow({ oferta }: { oferta: Oferta }) {
  const registrarResultado = useConocimientoStore((s) => s.registrarResultado);
  const [motivo, setMotivo] = useState(oferta.motivoRechazo ?? MOTIVOS_RECHAZO[0].key);

  const RESULTADO_LABEL: Record<ResultadoOferta, string> = { aceptada: 'Aceptó', rechazada: 'Rechazó', parcial: 'Aceptó parcial', pendiente: 'Pendiente' };
  const RESULTADO_CLS: Record<ResultadoOferta, string> = { aceptada: 'text-success', rechazada: 'text-danger', parcial: 'text-warning', pendiente: 'text-text-faint' };

  return (
    <div className="rounded-lg border border-border bg-bg-elevated p-2.5 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <span className="font-mono text-xs text-accent">{oferta.material}</span>
          <span className="ml-2 text-text-faint text-xs">{new Date(oferta.fechaOferta).toLocaleDateString('es-MX')}</span>
        </div>
        <span className={RESULTADO_CLS[oferta.resultado]}>{RESULTADO_LABEL[oferta.resultado]}</span>
      </div>
      <p className="mt-1 text-text-muted">{oferta.cantidadOfertada} unid. a ${oferta.precioOfertado}{oferta.comentario ? ` · ${oferta.comentario}` : ''}</p>
      {oferta.resultado === 'pendiente' && oferta.id != null && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => registrarResultado(oferta.id!, { resultado: 'aceptada' })}>Aceptó</Button>
          <Button size="sm" variant="outline" onClick={() => registrarResultado(oferta.id!, { resultado: 'parcial' })}>Parcial</Button>
          <Select value={motivo} onChange={(e) => setMotivo(e.target.value as typeof motivo)} className="h-8 w-40 text-xs">
            {MOTIVOS_RECHAZO.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </Select>
          <Button size="sm" variant="outline" onClick={() => registrarResultado(oferta.id!, { resultado: 'rechazada', motivoRechazo: motivo })}>Rechazó</Button>
        </div>
      )}
      {oferta.resultado === 'rechazada' && oferta.motivoRechazo && (
        <p className="mt-1 text-xs text-danger">Motivo: {MOTIVOS_RECHAZO.find((m) => m.key === oferta.motivoRechazo)?.label ?? oferta.motivoRechazo}</p>
      )}
    </div>
  );
}
