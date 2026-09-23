import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Copy, ExternalLink, Trash2, Plus, ArrowRightCircle, History, FileText, FileSignature, MessageCircle } from 'lucide-react';
import { STATUS_OPTIONS } from './SupportOrders';
import { useAuth } from '@/hooks/useAuth';
import { generateTechnicalQuotePdf, generateEquipmentReceiptPdf } from '@/lib/generateTechnicalPdf';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ClientHistory360 from '@/components/clients/ClientHistory360';

export default function SupportOrderDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [os, setOs] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [parts, setParts] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [qty, setQty] = useState(1);
  const [unitPrice, setUnitPrice] = useState(0);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [transferring, setTransferring] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [crmClientId, setCrmClientId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!os?.client_id) return;
      const { data: tc } = await supabase.from('technical_clients' as any).select('crm_client_id').eq('id', os.client_id).maybeSingle();
      setCrmClientId((tc as any)?.crm_client_id || null);
    })();
  }, [os?.client_id]);

  const transferToCommercial = async () => {
    if (!crmClientId) return toast.error('Cliente ainda não vinculado ao CRM');
    if (os.handoff_quote_id) return toast.error('OS já transferida para o Comercial');
    setTransferring(true);
    try {
      const { data: client } = await supabase.from('clients').select('id,salesperson_id,company_name,name,company_id').eq('id', crmClientId).maybeSingle();
      if (!client) throw new Error('Cliente CRM não encontrado');
      const owner = client.salesperson_id || user?.id;
      const clientName = client.company_name || client.name || os.client_name;

      const { data: newQuote, error: qErr } = await supabase.from('quotes').insert({
        client_id: client.id,
        client_name: clientName,
        created_by: owner,
        status: 'draft',
        notes: `Origem: Suporte Técnico — OS ${os.os_number}. Defeito: ${os.reported_defect || '-'}`,
        source: 'suporte',
      } as any).select('id').maybeSingle();
      if (qErr) throw qErr;

      await supabase.from('smart_opportunities').insert({
        cliente_id: client.id,
        vendedor_id: client.salesperson_id,
        quote_id: newQuote?.id,
        produto_base: null,
        produto_sugerido: null,
        company_id: client.company_id,
        tipo_oportunidade: 'Suporte→Comercial',
        motivo: `OS ${os.os_number} — ${os.equipment || ''} — ${os.reported_defect || 'oportunidade identificada pelo suporte'}`,
        prioridade: 'média',
        status: 'Nova',
      } as any);

      if (client.salesperson_id) {
        await supabase.from('notifications').insert({
          user_id: client.salesperson_id,
          title: `Nova oportunidade — OS ${os.os_number}`,
          message: `O suporte transferiu o cliente ${clientName} para o comercial. Um orçamento em rascunho foi criado.`,
          type: 'quote_status',
          related_quote_id: newQuote?.id,
        } as any);
      }

      await supabase.from('technical_orders' as any).update({ handoff_quote_id: newQuote?.id }).eq('id', id);
      toast.success(client.salesperson_id ? 'Transferido para o vendedor da carteira' : 'Oportunidade criada — aguardando distribuição');
      load();
    } catch (e: any) {
      toast.error(e.message || 'Falha ao transferir');
    } finally {
      setTransferring(false);
    }
  };

  const load = async () => {
    const { data } = await supabase.from('technical_orders' as any).select('*').eq('id', id).maybeSingle();
    setOs(data);
    const { data: h } = await supabase.from('technical_status_history' as any).select('*').eq('order_id', id).order('created_at', { ascending: false });
    setHistory((h || []) as any[]);
    const { data: p } = await supabase.from('technical_order_parts' as any).select('*').eq('order_id', id).order('created_at');
    setParts((p || []) as any[]);
  };
  useEffect(() => { if (id) load(); }, [id]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('technical_products' as any)
        .select('id,name,code,price,quantity,brand,category,manufacturer,compatibility,notes')
        .order('name');
      setProducts((data || []) as any[]);
    })();
  }, []);

  const update = async (patch: any) => {
    const total = Number(patch.parts_value ?? os.parts_value) + Number(patch.labor_value ?? os.labor_value) + Number(patch.shipping_value ?? os.shipping_value) + Number(patch.services_value ?? os.services_value ?? 0);
    const { error } = await supabase.from('technical_orders' as any).update({ ...patch, total_value: total }).eq('id', id);
    if (error) return toast.error(error.message);
    toast.success('Atualizado');
    load();
  };

  const addPart = async () => {
    if (!selectedProduct) return toast.error('Selecione uma peça');
    if (qty < 1) return toast.error('Quantidade inválida');
    const { error } = await supabase.from('technical_order_parts' as any).insert({
      order_id: id,
      product_id: selectedProduct.id,
      product_name: selectedProduct.name,
      quantity: qty,
      unit_price: unitPrice,
      total_price: qty * unitPrice,
      created_by: user?.id,
    });
    if (error) return toast.error(error.message);
    toast.success('Peça adicionada (estoque baixado)');
    setSelectedProduct(null); setProductSearch(''); setQty(1); setUnitPrice(0);
    load();
  };

  const removePart = async (partId: string) => {
    if (!confirm('Remover peça? O estoque será estornado.')) return;
    const { error } = await supabase.from('technical_order_parts' as any).delete().eq('id', partId);
    if (error) return toast.error(error.message);
    toast.success('Peça removida');
    load();
  };

  const filteredProducts = productSearch.trim()
    ? (() => {
        const q = productSearch.toLowerCase().trim();
        return products
          .filter((p: any) =>
            [p.code, p.name, p.brand, p.category, p.manufacturer, p.compatibility, p.notes]
              .some((f) => String(f || '').toLowerCase().includes(q))
          )
          .slice(0, 8);
      })()
    : [];

  const canExportQuote = ['pronto', 'aguardando_aprovacao'].includes(os?.status);

  const exportQuotePdf = async () => {
    try {
      const prodMap = new Map(products.map((p: any) => [p.id, p]));
      const enrichedParts = parts.map((p: any) => ({
        ...p,
        product_code: (prodMap.get(p.product_id) as any)?.code || '',
      }));
      await generateTechnicalQuotePdf(os, enrichedParts);
      toast.success('Orçamento gerado');
    } catch (e: any) { toast.error(e.message || 'Falha ao gerar PDF'); }
  };

  const exportReceiptPdf = async () => {
    try {
      await generateEquipmentReceiptPdf(os);
      toast.success('Termo de entrada gerado');
    } catch (e: any) { toast.error(e.message || 'Falha ao gerar PDF'); }
  };

  const sendWhatsApp = () => {
    const phone = String(os?.client_phone || os?.phone || '').replace(/\D/g, '');
    const text = encodeURIComponent(
      `Olá ${os.client_name || ''}, acompanhe sua Ordem de Serviço ${os.os_number} pelo link: ${window.location.origin}/rastreamento/os/${os.public_token}`
    );
    const base = phone ? `https://wa.me/${phone}` : 'https://wa.me/';
    window.open(`${base}?text=${text}`, '_blank');
  };

  if (!os) return <p>Carregando...</p>;

  const trackingUrl = `${window.location.origin}/rastreamento/os/${os.public_token}`;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{os.os_number}</h1>
          <p className="text-sm text-muted-foreground">{os.client_name} · {os.equipment}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Badge variant="secondary">{STATUS_OPTIONS.find(s => s.key === os.status)?.label}</Badge>
          {crmClientId && (
            <Button size="sm" variant="outline" onClick={() => setHistoryOpen(true)}>
              <History className="h-3 w-3 mr-1" />Histórico 360
            </Button>
          )}
          <Button size="sm" variant="default" disabled={transferring || !crmClientId || !!os.handoff_quote_id} onClick={transferToCommercial}>
            <ArrowRightCircle className="h-3 w-3 mr-1" />{os.handoff_quote_id ? 'Já transferida' : 'Transferir para Comercial'}
          </Button>
          <Button size="sm" variant="outline" onClick={exportReceiptPdf}>
            <FileSignature className="h-3 w-3 mr-1" />Termo de Entrada
          </Button>
          <Button size="sm" variant="outline" disabled={!canExportQuote} onClick={exportQuotePdf} title={canExportQuote ? '' : 'Disponível quando a OS estiver Pronta ou aguardando aprovação'}>
            <FileText className="h-3 w-3 mr-1" />Orçamento PDF
          </Button>
          <Button size="sm" variant="outline" onClick={sendWhatsApp}>
            <MessageCircle className="h-3 w-3 mr-1" />WhatsApp
          </Button>
          <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(trackingUrl); toast.success('Link copiado'); }}>
            <Copy className="h-3 w-3 mr-1" />Link rastreio
          </Button>
          <a href={trackingUrl} target="_blank" rel="noreferrer">
            <Button size="sm" variant="outline"><ExternalLink className="h-3 w-3 mr-1" />Abrir</Button>
          </a>
        </div>
      </div>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Histórico 360 do Cliente</DialogTitle></DialogHeader>
          {crmClientId && <ClientHistory360 clientId={crmClientId} />}
        </DialogContent>
      </Dialog>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Equipamento</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div><Label>Equipamento</Label><Input defaultValue={os.equipment} onBlur={e => update({ equipment: e.target.value })} /></div>
            <div><Label>Marca</Label><Input defaultValue={os.brand} onBlur={e => update({ brand: e.target.value })} /></div>
            <div><Label>Modelo</Label><Input defaultValue={os.model} onBlur={e => update({ model: e.target.value })} /></div>
            <div><Label>Serial</Label><Input defaultValue={os.serial} onBlur={e => update({ serial: e.target.value })} /></div>
            <div><Label>Defeito Relatado</Label><Textarea defaultValue={os.reported_defect} onBlur={e => update({ reported_defect: e.target.value })} /></div>
            <div><Label>Diagnóstico Técnico</Label><Textarea defaultValue={os.technical_diagnosis} onBlur={e => update({ technical_diagnosis: e.target.value })} /></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Status & Valores</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Status</Label>
              <Select value={os.status} onValueChange={v => update({ status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUS_OPTIONS.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Mão de obra</Label><Input type="number" step="0.01" defaultValue={os.labor_value} onBlur={e => update({ labor_value: Number(e.target.value) })} /></div>
              <div><Label>Frete</Label><Input type="number" step="0.01" defaultValue={os.shipping_value} onBlur={e => update({ shipping_value: Number(e.target.value) })} /></div>
              <div><Label>Serviços</Label><Input type="number" step="0.01" defaultValue={os.services_value || 0} onBlur={e => update({ services_value: Number(e.target.value) })} /></div>
              <div><Label>Peças (auto)</Label><Input type="number" value={Number(os.parts_value || 0).toFixed(2)} readOnly /></div>
            </div>
            <div className="text-right text-lg font-bold">Total: R$ {Number(os.total_value || 0).toFixed(2)}</div>
            <div><Label>Garantia</Label><Input defaultValue={os.warranty} onBlur={e => update({ warranty: e.target.value })} /></div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Peças Utilizadas (baixa automática no estoque)</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
            <div className="md:col-span-5 relative">
              <Label className="text-xs">Buscar peça</Label>
              {selectedProduct ? (
                <div className="flex items-center justify-between border rounded-md px-3 py-2 bg-muted/40">
                  <div className="text-sm">
                    <div className="font-medium">
                      {selectedProduct.code && <span className="text-muted-foreground mr-1">[{selectedProduct.code}]</span>}
                      {selectedProduct.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {[selectedProduct.brand, selectedProduct.category].filter(Boolean).join(' · ')}
                      {(selectedProduct.brand || selectedProduct.category) && ' · '}
                      Estoque: {selectedProduct.quantity}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => { setSelectedProduct(null); setUnitPrice(0); }}>Trocar</Button>
                </div>
              ) : (
                <>
                  <Input placeholder="Buscar por código, nome, marca ou categoria..." value={productSearch} onChange={e => setProductSearch(e.target.value)} />
                  {filteredProducts.length > 0 && (
                    <div className="absolute z-20 left-0 right-0 mt-1 bg-popover border rounded-md shadow-md max-h-64 overflow-auto">
                      {filteredProducts.map((p: any) => (
                        <button key={p.id} type="button"
                          className="w-full text-left px-3 py-2 hover:bg-muted text-sm border-b last:border-b-0"
                          onClick={() => { setSelectedProduct(p); setProductSearch(''); setUnitPrice(Number(p.price) || 0); }}>
                          <div className="flex justify-between gap-2">
                            <span className="font-medium truncate">
                              {p.code && <span className="text-muted-foreground mr-1">[{p.code}]</span>}
                              {p.name}
                            </span>
                            <span className="text-muted-foreground whitespace-nowrap">Estq: {p.quantity}</span>
                          </div>
                          {(p.brand || p.category) && (
                            <div className="text-xs text-muted-foreground truncate">
                              {[p.brand, p.category].filter(Boolean).join(' · ')}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="md:col-span-2"><Label className="text-xs">Qtd</Label><Input type="number" min={1} value={qty} onChange={e => setQty(Number(e.target.value) || 1)} /></div>
            <div className="md:col-span-3"><Label className="text-xs">Preço unit. (R$)</Label><Input type="number" step="0.01" value={unitPrice} onChange={e => setUnitPrice(Number(e.target.value) || 0)} /></div>
            <div className="md:col-span-2"><Button onClick={addPart} className="w-full"><Plus className="h-4 w-4 mr-1" />Adicionar</Button></div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Peça</TableHead>
                <TableHead className="w-20 text-center">Qtd</TableHead>
                <TableHead className="w-32 text-right">Unitário</TableHead>
                <TableHead className="w-32 text-right">Subtotal</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {parts.map(p => (
                <TableRow key={p.id}>
                  <TableCell>{p.product_name}</TableCell>
                  <TableCell className="text-center">{p.quantity}</TableCell>
                  <TableCell className="text-right">R$ {Number(p.unit_price).toFixed(2)}</TableCell>
                  <TableCell className="text-right font-medium">R$ {Number(p.total_price).toFixed(2)}</TableCell>
                  <TableCell><Button variant="ghost" size="icon" onClick={() => removePart(p.id)}><Trash2 className="h-4 w-4 text-rose-500" /></Button></TableCell>
                </TableRow>
              ))}
              {parts.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-4">Nenhuma peça utilizada</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Histórico</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {history.map(h => (
              <div key={h.id} className="flex items-center gap-3 text-sm border-l-2 border-primary pl-3 py-1">
                <Badge variant="outline">{STATUS_OPTIONS.find(s => s.key === h.new_status)?.label || h.new_status}</Badge>
                <span className="text-muted-foreground">{new Date(h.created_at).toLocaleString('pt-BR')}</span>
                {h.performed_by_name && <span>por {h.performed_by_name}</span>}
              </div>
            ))}
            {history.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma alteração registrada</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
