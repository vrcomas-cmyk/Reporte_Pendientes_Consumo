import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useAnalytics } from '@/modules/analytics/AnalyticsContext';
import { useTrasladosStore } from '@/store/trasladosStore';
import { almacenDestinoPedido } from '@/core/ofertasEjecutivo';
import type { Oferta } from '@/core/types';

/** Prepara un traslado desde una oferta aceptada. Solo lo guarda como «Preparado»: no envía nada ni lo marca solicitado. */
export function PrepararTrasladoDialog({ oferta, onClose }: { oferta: Oferta | null; onClose: (creado: boolean) => void }) {
  const a = useAnalytics();
  const preparar = useTrasladosStore((s) => s.preparar);
  const [campos, setCampos] = useState({ cantidad: '', centroOrigen: '', almacenOrigen: '', centroDestino: '', almacenDestino: '', comentarios: '' });
  const [clave, setClave] = useState<number | null>(null);
  const [guardando, setGuardando] = useState(false);

  if (oferta && clave !== (oferta.id ?? null)) {
    setClave(oferta.id ?? null);
    setCampos({
      cantidad: String(oferta.cantidadAceptada ?? oferta.cantidadOfertada ?? ''),
      centroOrigen: oferta.centroOrigen ?? '',
      almacenOrigen: oferta.almacenOrigen ?? '',
      centroDestino: oferta.centroPedido ?? '',
      // Corta caducidad → 1032; sin almacén en el pedido → 1030; otras condiciones → el almacén del pedido.
      almacenDestino: almacenDestinoPedido(oferta.almacenPedido ?? '', oferta.condicionTexto ?? ''),
      comentarios: '',
    });
  }
  const set = (k: keyof typeof campos) => (e: React.ChangeEvent<HTMLInputElement>) => setCampos((c) => ({ ...c, [k]: e.target.value }));
  const n = Number(campos.cantidad);
  const valido = !!oferta && n > 0 && campos.centroDestino.trim() !== '' && campos.almacenDestino.trim() !== '' && campos.centroOrigen.trim() !== '';

  const guardar = async () => {
    if (!oferta || !valido) return;
    setGuardando(true);
    const id = await preparar({
      ...(oferta.id != null ? { ofertaId: oferta.id } : {}),
      pedido: oferta.pedido ?? '', destinatario: oferta.dest, razonSocial: oferta.razonSocial, ejecutivo: oferta.ejecutivo ?? '', zona: oferta.zona ?? '',
      material: oferta.material, descripcion: a.enrich.matTexto(oferta.material) || '', cantidad: n, um: a.enrich.matUm(oferta.material) ?? '',
      centroOrigen: campos.centroOrigen.trim(), almacenOrigen: campos.almacenOrigen.trim(), centroDestino: campos.centroDestino.trim(), almacenDestino: campos.almacenDestino.trim(),
      condicion: oferta.condicionTexto ?? '', lote: oferta.loteAceptado || oferta.lote || '', comentarios: campos.comentarios.trim(), destinatariosCorreo: [],
    });
    setGuardando(false);
    setClave(null);
    onClose(id != null);
  };

  return (
    <Dialog open={!!oferta} onOpenChange={(v) => { if (!v) { setClave(null); onClose(false); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Preparar traslado</DialogTitle>
          <DialogDescription>{oferta ? `Pedido ${oferta.pedido} · ${oferta.material} · ${oferta.razonSocial}` : ''}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <label>Cantidad<Input type="number" min={0} value={campos.cantidad} onChange={set('cantidad')} /></label>
          <span />
          <label>Centro origen<Input value={campos.centroOrigen} onChange={set('centroOrigen')} /></label>
          <label>Almacén origen<Input value={campos.almacenOrigen} onChange={set('almacenOrigen')} /></label>
          <label>Centro destino<Input value={campos.centroDestino} onChange={set('centroDestino')} /></label>
          <label>Almacén destino<Input value={campos.almacenDestino} onChange={set('almacenDestino')} /></label>
          <label className="col-span-2">Comentarios<Input value={campos.comentarios} onChange={set('comentarios')} /></label>
        </div>
        <p className="text-xs text-text-faint">Se guarda como «Preparado». Después preparas el correo, lo envías tú y lo marcas Solicitado.</p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => { setClave(null); onClose(false); }}>Cancelar</Button>
          <Button disabled={!valido || guardando} onClick={() => void guardar()}>Guardar traslado</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
