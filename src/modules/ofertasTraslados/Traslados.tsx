import { useEffect, useState } from 'react';
import { Copy, Mail, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useClipboard } from '@/hooks/useClipboard';
import { toast } from '@/store/toastStore';
import { supabase } from '@/lib/supabaseClient';
import { formatNumber } from '@/lib/utils';
import { usePedidosStore } from '@/store/pedidosStore';
import { useTrasladosStore } from '@/store/trasladosStore';
import { textoCorreoTraslado, textoSeguimiento } from '@/core/seguimientoTraslado';
import { listaDeCorreos, loadDestinatariosTraslado, saveDestinatariosTraslado } from '@/services/trasladoDestinatariosService';
import type { EstatusTraslado, Traslado } from '@/core/types';

const CLASE: Record<EstatusTraslado, string> = {
  preparado: 'border-border text-text-muted',
  solicitado: 'border-accent/40 bg-accent-soft text-accent',
  'en-curso': 'border-info/40 bg-info/10 text-info',
  recibido: 'border-success/40 bg-success/10 text-success',
  revision: 'border-warning/40 bg-warning/10 text-warning',
  cancelado: 'border-border text-text-faint',
};
const ETIQUETA_CORTA: Record<EstatusTraslado, string> = { preparado: 'Preparado', solicitado: 'Solicitado', 'en-curso': 'En curso', recibido: 'Recibido', revision: 'Pendiente de revisión', cancelado: 'Cancelado' };

/** Pestaña «Traslados»: estado comercial/logístico de cada traslado (distinto del `sync` técnico de las Solicitudes DRP con el Sheet). */
export function Traslados() {
  const traslados = useTrasladosStore((s) => s.traslados);
  const aplicar = useTrasladosStore((s) => s.aplicarDisponibilidad);
  const fijar = useTrasladosStore((s) => s.fijarEstatus);
  const leidoEn = usePedidosStore((s) => s.fuentes.disponibilidad?.leidoEn);
  const [correo, setCorreo] = useState<Traslado | null>(null);

  const revisar = async () => {
    if (!leidoEn) { toast.warning('Sin Disponibilidad cargada', 'Sincroniza Inventario · Disponibilidad primero.'); return; }
    const n = await aplicar();
    toast.info(n ? `${n} traslado(s) actualizados` : 'Sin cambios', `Inventario · Disponibilidad del ${new Date(leidoEn).toLocaleString('es-MX')}.`);
  };

  if (!traslados.length) return <EmptyState title="Aún no hay traslados" description="Desde «Seguimiento de ofertas», en una oferta aceptada pulsa «Traslado»." />;

  return (
    <div className="flex flex-col gap-3 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-text-muted">
          El seguimiento sale de Inventario · Disponibilidad{leidoEn ? ` (descargado ${new Date(leidoEn).toLocaleString('es-MX')})` : ' (no cargado)'}: tránsito hacia el destino = En curso; aumento de la existencia libre = Recibido. No se rastrea el lote.
        </p>
        <Button size="sm" variant="outline" onClick={() => void revisar()}><RefreshCw className="size-4" /> Revisar con Disponibilidad</Button>
      </div>
      <Table wrapperClassName="max-h-[70vh] rounded-lg border border-border">
        <TableHeader>
          <TableRow>
            <TableHead>Pedido / Cliente</TableHead><TableHead>Ejecutivo / Zona</TableHead><TableHead>Material · Condición</TableHead><TableHead className="text-right">Cant.</TableHead>
            <TableHead>Origen → Destino</TableHead><TableHead>Estatus del traslado</TableHead><TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {traslados.map((t) => (
            <TableRow key={t.id} className="align-top">
              <TableCell><span className="font-medium tabular-nums">{t.pedido || '—'}</span><div className="max-w-56 truncate text-xs text-text-muted" title={t.razonSocial}>{t.destinatario} · {t.razonSocial}</div></TableCell>
              <TableCell>{t.ejecutivo || '—'}<div className="text-xs text-text-faint">{t.zona}</div></TableCell>
              <TableCell><span className="tabular-nums">{t.material}</span><div className="max-w-52 truncate text-xs text-text-faint" title={t.descripcion}>{t.condicion}{t.lote ? ` · ${t.lote}` : ''}</div></TableCell>
              <TableCell className="text-right tabular-nums">{formatNumber(t.cantidad)}</TableCell>
              <TableCell className="tabular-nums">{t.centroOrigen}/{t.almacenOrigen} → {t.centroDestino}/{t.almacenDestino}</TableCell>
              <TableCell>
                <span className={`inline-block rounded-full border px-2 py-0.5 text-xs ${CLASE[t.estatus]}`}>{ETIQUETA_CORTA[t.estatus]}</span>
                {(t.estatus === 'en-curso' || t.estatus === 'recibido') && <div className="mt-0.5 text-[11px] text-text-faint">{textoSeguimiento(t).replace(`${ETIQUETA_CORTA[t.estatus]} · `, '')}</div>}
                {t.estatus === 'solicitado' && t.solicitadoEn && <div className="mt-0.5 text-[11px] text-text-faint">Solicitado {new Date(t.solicitadoEn).toLocaleDateString('es-MX')}{t.baseLeidoEn ? '' : ' · sin línea base'}</div>}
                {t.estatus === 'revision' && t.notaRevision && <div className="mt-0.5 max-w-64 text-[11px] text-warning">{t.notaRevision}</div>}
                {t.estatus === 'revision' && t.id != null && (
                  <div className="mt-1 flex gap-1">
                    <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => void fijar(t.id!, 'recibido')}>Confirmar recibido</Button>
                    <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => void fijar(t.id!, 'solicitado')}>Sigue solicitado</Button>
                  </div>
                )}
              </TableCell>
              <TableCell className="text-right">
                {t.estatus !== 'recibido' && t.estatus !== 'cancelado' && (
                  <span className="inline-flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => setCorreo(t)}><Mail className="size-4" /> {t.estatus === 'preparado' ? 'Preparar correo' : 'Ver correo'}</Button>
                    {t.estatus === 'preparado' && t.id != null && <Button size="sm" variant="ghost" onClick={() => void fijar(t.id!, 'cancelado')}>Cancelar</Button>}
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <CorreoDialog traslado={correo} onClose={() => setCorreo(null)} />
    </div>
  );
}

/** Texto y destinatarios del correo para copiar. Copiar NO marca nada: solo «Ya lo envié» (confirmación del usuario) pasa a Solicitado. */
function CorreoDialog({ traslado, onClose }: { traslado: Traslado | null; onClose: () => void }) {
  const { copy } = useClipboard();
  const marcar = useTrasladosStore((s) => s.marcarSolicitado);
  const actualizar = useTrasladosStore((s) => s.actualizarCampos);
  const [destinatarios, setDestinatarios] = useState('');
  const [asunto, setAsunto] = useState('');
  const [cuerpo, setCuerpo] = useState('');
  const [confirmado, setConfirmado] = useState(false);
  const [clave, setClave] = useState<number | null>(null);
  const [listos, setListos] = useState(false);

  useEffect(() => {
    if (!traslado) return;
    let vivo = true;
    setListos(false);
    void loadDestinatariosTraslado().then((def) => {
      if (!vivo) return;
      setDestinatarios((traslado.destinatariosCorreo.length ? traslado.destinatariosCorreo : def).join(', '));
      setListos(true);
    }).catch(() => { if (vivo) { setDestinatarios(traslado.destinatariosCorreo.join(', ')); setListos(true); } });
    return () => { vivo = false; };
  }, [traslado]);

  if (traslado && clave !== (traslado.id ?? null)) {
    setClave(traslado.id ?? null);
    const t = textoCorreoTraslado(traslado);
    setAsunto(t.asunto);
    setCuerpo(t.cuerpo);
    setConfirmado(false);
  }

  const para = listaDeCorreos(destinatarios);
  const yaSolicitado = !!traslado && traslado.estatus !== 'preparado';
  const guardarPredeterminados = async () => {
    try {
      const email = (await supabase.auth.getUser()).data.user?.email ?? 'admin';
      await saveDestinatariosTraslado(para, email);
      toast.success('Destinatarios guardados como predeterminados');
    } catch (e) {
      toast.error('No se pudo guardar (solo un administrador puede)', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Dialog open={!!traslado} onOpenChange={(v) => { if (!v) { setClave(null); onClose(); } }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Correo de solicitud de traslado</DialogTitle>
          <DialogDescription>La app no envía correos: copia el texto, envíalo desde tu correo y después confírmalo abajo.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <label className="block">Para (separa con coma)
            <Input value={destinatarios} onChange={(e) => setDestinatarios(e.target.value)} placeholder={listos ? 'correo@empresa.com, otro@empresa.com' : 'Cargando…'} />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={!para.length} onClick={() => void copy(para.join('; '), 'Destinatarios copiados')}><Copy className="size-4" /> Copiar destinatarios</Button>
            <Button size="sm" variant="ghost" disabled={!para.length} onClick={() => void guardarPredeterminados()}>Guardar como predeterminados</Button>
          </div>
          <label className="block">Asunto
            <Input value={asunto} onChange={(e) => setAsunto(e.target.value)} />
          </label>
          <label className="block">Cuerpo
            <textarea value={cuerpo} onChange={(e) => setCuerpo(e.target.value)} rows={12} className="mt-1 w-full rounded-md border border-border bg-bg-elevated p-2 font-mono text-xs" />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void copy(asunto, 'Asunto copiado')}><Copy className="size-4" /> Copiar asunto</Button>
            <Button size="sm" onClick={() => void copy(cuerpo, 'Texto copiado')}><Copy className="size-4" /> Copiar texto</Button>
          </div>
          <p className="text-xs text-text-faint">Copiar el texto no significa que el correo se envió: el traslado sigue «{yaSolicitado ? 'Solicitado' : 'Preparado'}» hasta que lo confirmes.</p>
          {!yaSolicitado && (
            <div className="rounded-md border border-border p-3">
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-0.5" checked={confirmado} onChange={(e) => setConfirmado(e.target.checked)} />
                <span>Ya envié este correo por mi cuenta.</span>
              </label>
              <Button className="mt-2" size="sm" disabled={!confirmado || !traslado?.id} onClick={async () => {
                if (!traslado?.id) return;
                await actualizar(traslado.id, { destinatariosCorreo: para, comentarios: traslado.comentarios });
                await marcar(traslado.id);
                setClave(null);
                onClose();
              }}>Marcar como Solicitado</Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
