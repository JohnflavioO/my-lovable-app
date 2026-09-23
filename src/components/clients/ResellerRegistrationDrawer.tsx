import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  Loader2, MessageCircle, Mail, StickyNote, ArrowRightLeft, Tag, Clock, AlertTriangle, Store,
} from 'lucide-react';
import {
  RESELLER_ACTION_LABELS, RESELLER_STATUS_LABELS, RESELLER_STATUS_OPTIONS,
  type ResellerRegSummary,
} from '@/hooks/useResellerRegistrations';
import { useAuth } from '@/hooks/useAuth';

const db = supabase as any;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  registrations: ResellerRegSummary[];
  clientName?: string;
  clientSource?: string | null;
  onChanged?: () => void;
}

const fmtDateTime = (v?: string | null) =>
  v ? new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm break-words">{value && String(value).trim() ? value : '—'}</p>
    </div>
  );
}

export default function ResellerRegistrationDrawer({
  open, onOpenChange, registrations, clientName, clientSource, onChanged,
}: Props) {
  const { isAdmin, isGestor } = useAuth();
  const canTransfer = isAdmin || isGestor;

  const sorted = useMemo(
    () => [...registrations].sort((a, b) =>
      new Date(b.submitted_at || 0).getTime() - new Date(a.submitted_at || 0).getTime()),
    [registrations],
  );

  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const [statusOpen, setStatusOpen] = useState(false);
  const [statusValue, setStatusValue] = useState('novo');
  const [statusNotes, setStatusNotes] = useState('');

  const [transferOpen, setTransferOpen] = useState(false);
  const [transferUser, setTransferUser] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [transferClient, setTransferClient] = useState(false);
  const [assignables, setAssignables] = useState<{ user_id: string; full_name: string }[]>([]);

  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');

  useEffect(() => {
    if (open && sorted.length) setActiveId(prev => prev && sorted.some(r => r.id === prev) ? prev : sorted[0].id);
    if (!open) { setDetail(null); setHistory([]); }
  }, [open, sorted]);

  const loadDetail = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const [{ data: reg, error: e1 }, { data: hist, error: e2 }] = await Promise.all([
        db.from('reseller_registrations').select('*').eq('id', id).maybeSingle(),
        db.from('reseller_registration_history').select('*').eq('registration_id', id).order('created_at', { ascending: false }),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      setDetail(reg);
      setHistory(hist || []);
      setStatusValue(reg?.registration_status || 'novo');
      // Visualização manual: só registra quando o usuário abre efetivamente o cadastro
      await db.rpc('log_reseller_registration_view', { p_registration_id: id });
      onChanged?.();
    } catch (err: any) {
      console.error('[reseller] detail error', err);
      toast.error(err?.message || 'Não foi possível carregar o cadastro');
    } finally {
      setLoading(false);
    }
  }, [onChanged]);

  useEffect(() => {
    if (open && activeId) loadDetail(activeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeId]);

  const openTransfer = async () => {
    setTransferOpen(true);
    setTransferClient(false);
    setTransferReason('');
    setTransferUser('');
    try {
      const { data, error } = await db.rpc('list_reseller_assignable_users');
      if (error) throw error;
      setAssignables(data || []);
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível carregar os consultores');
    }
  };

  const submitStatus = async () => {
    if (!activeId) return;
    if (statusValue === 'reprovado' && !statusNotes.trim()) {
      toast.error('Informe a justificativa para reprovar o cadastro.');
      return;
    }
    setBusy(true);
    try {
      const { error } = await db.rpc('set_reseller_registration_status', {
        p_registration_id: activeId, p_status: statusValue, p_notes: statusNotes.trim() || null,
      });
      if (error) throw error;
      toast.success('Status atualizado');
      setStatusOpen(false); setStatusNotes('');
      await loadDetail(activeId);
      onChanged?.();
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível alterar o status');
    } finally { setBusy(false); }
  };

  const submitTransfer = async () => {
    if (!activeId || !transferUser) { toast.error('Selecione o novo responsável.'); return; }
    setBusy(true);
    try {
      const { error } = await db.rpc('transfer_reseller_registration_portfolio', {
        p_registration_id: activeId,
        p_new_assigned_user_id: transferUser,
        p_reason: transferReason.trim() || null,
        p_transfer_client: transferClient,
      });
      if (error) throw error;
      toast.success('Responsável transferido');
      setTransferOpen(false);
      await loadDetail(activeId);
      onChanged?.();
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível transferir o cadastro');
    } finally { setBusy(false); }
  };

  const submitNote = async () => {
    if (!activeId || !noteText.trim()) return;
    setBusy(true);
    try {
      const { error } = await db.from('reseller_registration_history').insert({
        registration_id: activeId, action: 'note', notes: noteText.trim(),
      });
      if (error) throw error;
      toast.success('Observação registrada');
      setNoteOpen(false); setNoteText('');
      await loadDetail(activeId);
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível registrar a observação');
    } finally { setBusy(false); }
  };

  const isLandingClient = (clientSource || '') === 'landing_revenda_mci';
  const active = sorted.find(r => r.id === activeId);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Store className="h-5 w-5 text-orange-500" />
              Cadastro de Revenda
            </SheetTitle>
            <p className="text-sm text-muted-foreground text-left">{clientName || detail?.company_name}</p>
          </SheetHeader>

          {sorted.length > 1 && (
            <div className="mt-4 space-y-1">
              <Label className="text-xs">Solicitações ({sorted.length})</Label>
              <Select value={activeId || ''} onValueChange={setActiveId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {sorted.map((r, i) => (
                    <SelectItem key={r.id} value={r.id}>
                      {i === 0 ? 'Mais recente • ' : ''}{fmtDateTime(r.submitted_at)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando cadastro...
            </div>
          ) : !detail ? (
            <div className="py-16 text-center text-sm text-muted-foreground">Nenhum cadastro encontrado.</div>
          ) : (
            <>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge variant="outline" className="border-orange-500/40 text-orange-600">Landing Revenda</Badge>
                <Badge variant="secondary">{RESELLER_STATUS_LABELS[detail.registration_status] || detail.registration_status}</Badge>
                {detail.is_duplicate && (
                  <Badge variant="outline" className="border-amber-500/50 text-amber-600 gap-1">
                    <AlertTriangle className="h-3 w-3" /> Possível duplicidade
                  </Badge>
                )}
                <Badge variant="outline" className="gap-1">
                  <Clock className="h-3 w-3" /> {fmtDateTime(detail.submitted_at || detail.created_at)}
                </Badge>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="gap-1.5" disabled={!detail.phone}
                  onClick={() => window.open(`https://wa.me/55${String(detail.phone || '').replace(/\D/g, '')}`, '_blank')}>
                  <MessageCircle className="h-4 w-4 text-emerald-600" /> WhatsApp
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5" disabled={!detail.email}
                  onClick={() => window.open(`mailto:${detail.email}`, '_blank')}>
                  <Mail className="h-4 w-4" /> E-mail
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setNoteOpen(true)}>
                  <StickyNote className="h-4 w-4" /> Observação
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setStatusOpen(true)}>
                  <Tag className="h-4 w-4" /> Alterar status
                </Button>
                {canTransfer && (
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={openTransfer}>
                    <ArrowRightLeft className="h-4 w-4" /> Transferir responsável
                  </Button>
                )}
              </div>

              <Tabs defaultValue="dados" className="mt-5">
                <TabsList className="w-full">
                  <TabsTrigger value="dados" className="flex-1">Dados</TabsTrigger>
                  <TabsTrigger value="historico" className="flex-1">Histórico</TabsTrigger>
                </TabsList>

                <TabsContent value="dados" className="space-y-5 mt-4">
                  <section className="space-y-3">
                    <h4 className="text-sm font-semibold">Empresa</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Razão social" value={detail.company_name} />
                      <Field label="Nome fantasia" value={detail.trade_name} />
                      <Field label="CNPJ" value={detail.cnpj} />
                      <Field label="Inscrição estadual" value={detail.state_registration} />
                      <Field label="Site" value={detail.website} />
                      <Field label="Tempo de atuação" value={detail.years_in_market} />
                    </div>
                  </section>
                  <Separator />
                  <section className="space-y-3">
                    <h4 className="text-sm font-semibold">Responsável</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Nome" value={detail.responsible_name} />
                      <Field label="E-mail" value={detail.email} />
                      <Field label="Telefone / WhatsApp" value={detail.phone} />
                    </div>
                  </section>
                  <Separator />
                  <section className="space-y-3">
                    <h4 className="text-sm font-semibold">Endereço</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="CEP" value={detail.cep} />
                      <Field label="Logradouro" value={detail.street} />
                      <Field label="Número" value={detail.address_number} />
                      <Field label="Complemento" value={detail.complement} />
                      <Field label="Bairro" value={detail.neighborhood} />
                      <Field label="Cidade" value={detail.city} />
                      <Field label="UF" value={detail.state} />
                    </div>
                  </section>
                  <Separator />
                  <section className="space-y-3">
                    <h4 className="text-sm font-semibold">Perfil comercial</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Como conheceu a MCI" value={detail.how_did_you_know} />
                      <Field label="Consultor escolhido no formulário" value={detail.consultant_selected_label} />
                      <Field label="Responsável atribuído" value={active?.assigned_user_name || 'Pendente de distribuição'} />
                      <Field label="Motivo da atribuição" value={detail.assignment_reason} />
                    </div>
                    <Field label="Equipamentos de interesse"
                      value={Array.isArray(detail.interests) ? detail.interests.join(', ') : detail.interests} />
                    <Field label="Mensagem" value={detail.message} />
                  </section>
                  <Separator />
                  <section className="space-y-3">
                    <h4 className="text-sm font-semibold">Origem</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Recebido em" value={fmtDateTime(detail.submitted_at || detail.created_at)} />
                      <Field label="Endereço do formulário" value={detail.form_url} />
                      <Field label="Campanha (utm_campaign)" value={detail.utm_campaign} />
                      <Field label="Origem (utm_source)" value={detail.utm_source} />
                      <Field label="Mídia (utm_medium)" value={detail.utm_medium} />
                      <Field label="Duplicidade" value={detail.is_duplicate ? (detail.duplicate_reason || 'Sim') : 'Não'} />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Código de suporte: {detail.external_registration_id || '—'}
                    </p>
                  </section>
                  <Separator />
                  <section className="space-y-3">
                    <h4 className="text-sm font-semibold">Consentimentos</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Política de privacidade" value={detail.privacy_consent ? 'Aceita' : 'Não aceita'} />
                      <Field label="Contato comercial" value={detail.commercial_contact_consent ? 'Autorizado' : 'Não autorizado'} />
                      <Field label="Data do consentimento" value={fmtDateTime(detail.submitted_at || detail.created_at)} />
                    </div>
                  </section>
                </TabsContent>

                <TabsContent value="historico" className="mt-4">
                  {history.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">Nenhum evento registrado.</p>
                  ) : (
                    <ol className="relative border-l pl-4 space-y-4">
                      {history.map(h => (
                        <li key={h.id} className="space-y-1">
                          <span className="absolute -left-[5px] mt-1.5 h-2 w-2 rounded-full bg-primary" />
                          <p className="text-sm font-medium">
                            {h.action === 'note' ? 'Observação registrada' : (RESELLER_ACTION_LABELS[h.action] || h.action)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {fmtDateTime(h.created_at)}
                            {h.performed_by_name ? ` • ${h.performed_by_name}` : ''}
                          </p>
                          {(h.previous_status || h.new_status) && (
                            <p className="text-xs text-muted-foreground">
                              {(RESELLER_STATUS_LABELS[h.previous_status] || h.previous_status || 'Sem status')} →{' '}
                              {RESELLER_STATUS_LABELS[h.new_status] || h.new_status}
                            </p>
                          )}
                          {h.notes && <p className="text-xs">{h.notes}</p>}
                        </li>
                      ))}
                    </ol>
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Alterar status */}
      <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Alterar status do cadastro</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={statusValue} onValueChange={setStatusValue}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RESELLER_STATUS_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Justificativa {statusValue === 'reprovado' ? '(obrigatória)' : '(opcional)'}</Label>
              <Textarea value={statusNotes} onChange={e => setStatusNotes(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusOpen(false)}>Cancelar</Button>
            <Button onClick={submitStatus} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transferir */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Transferir responsável</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Novo responsável</Label>
              <Select value={transferUser} onValueChange={setTransferUser}>
                <SelectTrigger><SelectValue placeholder="Selecione o consultor" /></SelectTrigger>
                <SelectContent>
                  {assignables.map(a => (
                    <SelectItem key={a.user_id} value={a.user_id}>{a.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Motivo</Label>
              <Textarea value={transferReason} onChange={e => setTransferReason(e.target.value)} rows={3} />
            </div>
            {isLandingClient ? (
              <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
                <Checkbox checked={transferClient} onCheckedChange={v => setTransferClient(!!v)} />
                <span>
                  Transferir também a carteira do cliente criado pela landing.
                  <span className="block text-xs text-muted-foreground">
                    Sem esta opção, apenas o acompanhamento da solicitação muda de responsável.
                  </span>
                </span>
              </label>
            ) : (
              <p className="text-xs text-muted-foreground rounded-md border p-3">
                Este cliente já existia no CRM: a carteira dele permanece inalterada. Apenas o acompanhamento
                desta solicitação de revenda será transferido.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)}>Cancelar</Button>
            <Button onClick={submitTransfer} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Confirmar transferência
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Observação */}
      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adicionar observação</DialogTitle></DialogHeader>
          <Textarea value={noteText} onChange={e => setNoteText(e.target.value)} rows={4} placeholder="Escreva a observação..." />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteOpen(false)}>Cancelar</Button>
            <Button onClick={submitNote} disabled={busy || !noteText.trim()}>
              {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
