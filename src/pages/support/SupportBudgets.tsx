import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Printer, Save, Send, Trash2, Search, Loader2, Sparkles, FileText, FileDown,
  QrCode, CreditCard, Banknote, ArrowRightLeft, Landmark, Paperclip,
} from 'lucide-react';
import { generateTechnicalQuotePdf } from '@/lib/generateTechnicalPdf';

const db = supabase as any;

const PAYMENT_METHODS = [
  { key: 'pix', label: 'PIX', icon: QrCode, color: 'text-emerald-600' },
  { key: 'credito', label: 'Cartão de Crédito', icon: CreditCard, color: 'text-blue-600' },
  { key: 'debito', label: 'Cartão de Débito', icon: CreditCard, color: 'text-indigo-600' },
  { key: 'dinheiro', label: 'Dinheiro', icon: Banknote, color: 'text-emerald-700' },
  { key: 'transferencia', label: 'Transferência', icon: ArrowRightLeft, color: 'text-orange-600' },
  { key: 'boleto', label: 'Boleto', icon: Landmark, color: 'text-slate-700' },
];

const SHIPPING_METHODS = ['Correios', 'Transportadora', 'Retirada no local', 'Motoboy'];

const PENDING_STATUSES = [
  'aguardando_aprovacao', 'em_orcamento', 'em_diagnostico', 'diagnostico',
  'aguardando_diagnostico', 'orcamento_pendente',
];

const SERVICE_TYPES = [
  'Manutenção corretiva',
  'Manutenção preventiva',
  'Diagnóstico técnico',
  'Atualização de firmware',
  'Instalação / configuração',
  'Garantia',
];

interface Order {
  id: string;
  os_number: string;
  client_id: string | null;
  client_name: string;
  equipment: string | null;
  brand: string | null;
  model: string | null;
  serial?: string | null;
  status: string;
  reported_defect: string | null;
  technical_diagnosis: string | null;
  technician_notes: string | null;
  repair_description?: string | null;
  accessories?: any;
  service_type?: string | null;
  labor_value: number;
  shipping_value: number;
  parts_value: number;
  total_value: number;
  payment_method: string | null;
  payment_proof_url: string | null;
  shipping_method: string | null;
  discount_percent: number | null;
  discount_scope?: string | null;
  budget_valid_days?: number | null;
  budget_version?: number | null;
  budget_sent_at?: string | null;
}

interface Part {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  code?: string | null;
}

const fmtBRL = (n: number) =>
  `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function SupportBudgets() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [selected, setSelected] = useState<Order | null>(null);
  const [parts, setParts] = useState<Part[]>([]);
  const [saving, setSaving] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [clientData, setClientData] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchOrders = async () => {
    setLoading(true);
    const { data } = await db
      .from('technical_orders')
      .select('id, os_number, client_id, client_name, equipment, brand, model, status, reported_defect')
      .not('status', 'in', '(entregue,concluido,cancelado,retirado,Concluído,Entregue)')
      .order('created_at', { ascending: false })
      .limit(100);
    setOrders((data || []) as Order[]);
    setLoading(false);
  };

  useEffect(() => { fetchOrders(); }, []);

  const loadOrder = async (id: string) => {
    const { data: ord } = await db.from('technical_orders').select('*').eq('id', id).maybeSingle();
    setSelected(ord as Order);
    if (ord?.client_id) {
      const { data: cli } = await db
        .from('technical_clients')
        .select('name, cpf_cnpj, email, phone, whatsapp, address, city, state, zip_code')
        .eq('id', ord.client_id)
        .maybeSingle();
      setClientData(cli || null);
    } else {
      setClientData(null);
    }
    const { data: prts } = await db
      .from('technical_order_parts')
      .select('*, technical_products(code)')
      .eq('order_id', id)
      .order('created_at', { ascending: true });
    setParts(((prts || []) as any[]).map((p) => ({
      ...p,
      code: p.technical_products?.code || null,
    })) as Part[]);
  };

  useEffect(() => {
    if (selectedId) {
      loadOrder(selectedId);
      setSearchParams({ edit: 'true' });
    } else { 
      setSelected(null); 
      setParts([]); 
      setSearchParams({});
    }
  }, [selectedId]);

  // Product search
  useEffect(() => {
    if (!productSearch.trim() || productSearch.trim().length < 2) {
      setProductResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      const term = `%${productSearch.trim()}%`;
      const { data } = await db
        .from('technical_products')
        .select('id, code, name, price, unit_price, quantity')
        .or(`name.ilike.${term},code.ilike.${term}`)
        .limit(8);
      setProductResults(data || []);
      setSearching(false);
    }, 250);
    return () => clearTimeout(t);
  }, [productSearch]);

  const partsTotal = useMemo(
    () => parts.reduce((s, p) => s + Number(p.total_price || 0), 0),
    [parts]
  );

  const discountValue = useMemo(() => {
    if (!selected) return 0;
    const pct = Number(selected.discount_percent || 0);
    const base =
      selected.discount_scope === 'total'
        ? partsTotal + Number(selected.labor_value || 0) + Number(selected.shipping_value || 0)
        : partsTotal;
    return (base * pct) / 100;
  }, [partsTotal, selected]);

  const grandTotal = useMemo(() => {
    if (!selected) return 0;
    return Math.max(
      0,
      partsTotal + Number(selected.labor_value || 0) + Number(selected.shipping_value || 0) - discountValue
    );
  }, [partsTotal, discountValue, selected]);

  const addPart = async (product: any) => {
    if (!selectedId) return;
    const unit = Number(product.price || product.unit_price || 0);
    const { error } = await db.from('technical_order_parts').insert({
      order_id: selectedId,
      product_id: product.id,
      product_name: product.name,
      quantity: 1,
      unit_price: unit,
      total_price: unit,
    });
    if (error) return toast.error(error.message);
    setProductSearch('');
    setProductResults([]);
    loadOrder(selectedId);
  };

  const updatePart = async (id: string, patch: Partial<Part>) => {
    const cur = parts.find((p) => p.id === id);
    if (!cur) return;
    const next = { ...cur, ...patch };
    next.total_price = Number(next.quantity || 0) * Number(next.unit_price || 0);
    setParts((prev) => prev.map((p) => (p.id === id ? next : p)));
    await db.from('technical_order_parts').update({
      quantity: next.quantity,
      unit_price: next.unit_price,
      total_price: next.total_price,
    }).eq('id', id);
  };

  const removePart = async (id: string) => {
    await db.from('technical_order_parts').delete().eq('id', id);
    loadOrder(selectedId!);
  };

  const clearDuplicates = async () => {
    if (!selectedId) return;
    const seen = new Map<string, string>();
    const toDelete: string[] = [];
    for (const p of parts) {
      const key = `${p.product_id || p.product_name}__${p.unit_price}`;
      if (seen.has(key)) toDelete.push(p.id);
      else seen.set(key, p.id);
    }
    if (!toDelete.length) return toast.info('Nenhuma duplicata encontrada');
    await db.from('technical_order_parts').delete().in('id', toDelete);
    toast.success(`${toDelete.length} duplicata(s) removida(s)`);
    loadOrder(selectedId);
  };

  const snapshotVersion = async (order: Order, version: number) => {
    await db.from('technical_budget_versions').insert({
      order_id: order.id,
      version,
      parts_value: partsTotal,
      labor_value: Number(order.labor_value || 0),
      shipping_value: Number(order.shipping_value || 0),
      discount_percent: Number(order.discount_percent || 0),
      discount_scope: order.discount_scope || 'parts',
      total_value: grandTotal,
      parts_snapshot: parts.map((p) => ({
        code: p.code, product_name: p.product_name, quantity: p.quantity,
        unit_price: p.unit_price, total_price: p.total_price,
      })),
      snapshot: {
        service_type: order.service_type,
        reported_defect: order.reported_defect,
        technical_diagnosis: order.technical_diagnosis,
        repair_description: order.repair_description,
        accessories: order.accessories,
        payment_method: order.payment_method,
        shipping_method: order.shipping_method,
        budget_valid_days: order.budget_valid_days,
      },
    });
  };

  const saveOrder = async (extra: Partial<Order> = {}) => {
    if (!selected) return;
    setSaving(true);
    // Se o orçamento já foi enviado ao cliente, qualquer alteração gera nova versão
    const alreadySent = !!selected.budget_sent_at;
    const nextVersion = Number(selected.budget_version || 1) + (alreadySent ? 1 : 0);
    const payload = {
      service_type: selected.service_type,
      reported_defect: selected.reported_defect,
      accessories: selected.accessories,
      technical_diagnosis: selected.technical_diagnosis,
      technician_notes: selected.technician_notes,
      repair_description: selected.repair_description,
      labor_value: Number(selected.labor_value || 0),
      shipping_value: Number(selected.shipping_value || 0),
      parts_value: partsTotal,
      total_value: grandTotal,
      shipping_method: selected.shipping_method,
      payment_method: selected.payment_method,
      payment_proof_url: selected.payment_proof_url,
      discount_percent: Number(selected.discount_percent || 0),
      discount_scope: selected.discount_scope || 'parts',
      budget_valid_days: Number(selected.budget_valid_days || 10),
      budget_version: nextVersion,
      ...extra,
    };
    const { error } = await db.from('technical_orders').update(payload).eq('id', selected.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    await snapshotVersion({ ...selected, ...payload } as Order, nextVersion);
    toast.success(alreadySent ? `Orçamento salvo como versão ${nextVersion}` : 'Orçamento salvo');
    fetchOrders();
    loadOrder(selected.id);
  };

  const sendForApproval = () =>
    saveOrder({ status: 'aguardando_aprovacao', budget_sent_at: new Date().toISOString() } as any);

  const uploadProof = async (file: File) => {
    if (!selected) return;
    setUploading(true);
    const path = `${selected.id}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from('budget-proofs').upload(path, file, {
      upsert: true, contentType: file.type,
    });
    if (error) { setUploading(false); return toast.error(error.message); }
    const { data: signed } = await supabase.storage.from('budget-proofs').createSignedUrl(path, 60 * 60 * 24 * 365);
    setSelected((s) => (s ? { ...s, payment_proof_url: signed?.signedUrl || path } : s));
    await db.from('technical_orders').update({ payment_proof_url: signed?.signedUrl || path }).eq('id', selected.id);
    setUploading(false);
    toast.success('Comprovante enviado');
  };

  const printPdf = async () => {
    if (!selected) return;
    const blob = (await generateTechnicalQuotePdf(selected, parts, {
      client: clientData,
      returnBlob: true,
    })) as Blob;
    const url = URL.createObjectURL(blob);
    const frame = document.createElement('iframe');
    frame.style.position = 'fixed';
    frame.style.right = '0';
    frame.style.bottom = '0';
    frame.style.width = '0';
    frame.style.height = '0';
    frame.style.border = '0';
    frame.src = url;
    frame.onload = () => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } catch {
        window.open(url, '_blank');
      }
      setTimeout(() => {
        URL.revokeObjectURL(url);
        frame.remove();
      }, 60000);
    };
    document.body.appendChild(frame);
  };

  const exportPdf = async () => {
    if (!selected) return;
    await generateTechnicalQuotePdf(selected, parts, { client: clientData });
  };


  const filteredOrders = orders;

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Left: pending list */}
      <aside className="w-80 shrink-0 border rounded-lg bg-card flex flex-col">
        <div className="p-4 border-b">
          <h2 className="text-sm font-semibold tracking-tight">Pendentes de Orçamento</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{filteredOrders.length} ordem(ns)</p>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground">
              Nenhuma ordem pendente.
            </div>
          ) : (
            filteredOrders.map((o) => {
              const active = o.id === selectedId;
              return (
                <button
                  key={o.id}
                  onClick={() => setSelectedId(o.id)}
                  className={`w-full text-left p-3 rounded-md border transition-all ${
                    active
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'border-border hover:border-primary/40 hover:bg-muted/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[10px] font-mono text-muted-foreground">{o.os_number}</span>
                    <span className="text-[9px] font-semibold text-amber-600 uppercase tracking-wide">
                      Aguardando aprovação
                    </span>
                  </div>
                  <p className="text-sm font-semibold truncate">
                    {o.equipment || o.model || '—'}
                  </p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {o.reported_defect || 'Sem defeito informado'}
                  </p>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Right: editor */}
      <section className="flex-1 min-w-0 overflow-y-auto">
        {!selected ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground">
            <FileText className="h-12 w-12 mb-3 opacity-40" />
            <p className="text-sm">Selecione uma ordem pendente à esquerda para editar o orçamento.</p>
          </div>
        ) : (
          <div className="space-y-6 pb-10 max-w-5xl">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 pb-4 border-b">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">
                  Orçamento #{selected.os_number}
                  <span className="ml-2 align-middle text-[11px] font-semibold uppercase tracking-wide text-muted-foreground border rounded px-2 py-0.5">
                    versão {Number(selected.budget_version || 1)}
                  </span>
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  <span className="font-medium text-foreground">Cliente:</span> {selected.client_name || '—'}
                  {selected.model && (
                    <>
                      {' • '}
                      <span className="font-medium text-foreground">Modelo:</span> {selected.model}
                    </>
                  )}
                </p>
                {selected.budget_sent_at && (
                  <p className="text-xs text-amber-600 mt-1">
                    Orçamento já enviado ao cliente — alterações salvas geram uma nova versão.
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={printPdf} className="gap-2">
                  <Printer className="h-4 w-4" /> Imprimir
                </Button>
                <Button variant="outline" size="sm" onClick={exportPdf} className="gap-2">
                  <FileDown className="h-4 w-4" /> Exportar PDF
                </Button>

                <Button variant="outline" size="sm" onClick={clearDuplicates} className="gap-2">
                  <Sparkles className="h-4 w-4" /> Limpar Duplicatas
                </Button>
                <Button variant="outline" size="sm" onClick={() => saveOrder()} disabled={saving} className="gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Salvar
                </Button>
                <Button size="sm" onClick={sendForApproval} className="gap-2">
                  <Send className="h-4 w-4" /> Enviar p/ Aprovação
                </Button>
              </div>
            </div>

            {/* Identificação do serviço */}
            <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs">Tipo de Serviço</Label>
                <Select
                  value={selected.service_type || ''}
                  onValueChange={(v) => setSelected({ ...selected, service_type: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {SERVICE_TYPES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Nº de Série</Label>
                <Input value={selected.serial || ''} readOnly className="bg-muted/40" />
              </div>
              <div>
                <Label className="text-xs">Validade do Orçamento (dias)</Label>
                <Input
                  type="number"
                  min={1}
                  value={selected.budget_valid_days ?? 10}
                  onChange={(e) => setSelected({ ...selected, budget_valid_days: Number(e.target.value) })}
                />
              </div>
            </section>

            {/* Defeito relatado */}
            <section>
              <h3 className="text-sm font-semibold mb-2">Defeito Relatado pelo Cliente</h3>
              <Textarea
                rows={3}
                placeholder="Defeito informado pelo cliente..."
                value={selected.reported_defect || ''}
                onChange={(e) => setSelected({ ...selected, reported_defect: e.target.value })}
              />
            </section>

            {/* Acessórios */}
            <section>
              <h3 className="text-sm font-semibold mb-2">Acessórios Recebidos</h3>
              <Input
                placeholder="Ex.: bateria, carregador, case, cabo"
                value={
                  Array.isArray(selected.accessories)
                    ? selected.accessories.join(', ')
                    : (selected.accessories || '')
                }
                onChange={(e) =>
                  setSelected({
                    ...selected,
                    accessories: e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
              />
            </section>

            {/* Relatório Técnico */}
            <section>
              <h3 className="text-sm font-semibold mb-2">Relatório Técnico</h3>
              <Textarea
                rows={5}
                placeholder="Descreva a análise técnica realizada..."
                value={selected.technical_diagnosis || ''}
                onChange={(e) => setSelected({ ...selected, technical_diagnosis: e.target.value })}
              />
            </section>


            {/* Peças e Componentes */}
            <section>
              <div className="flex items-center justify-between mb-2 gap-3">
                <h3 className="text-sm font-semibold">Peças e Componentes</h3>
                <div className="relative w-full max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome ou código..."
                    className="pl-9"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                  />
                  {(productResults.length > 0 || searching) && (
                    <div className="absolute z-20 right-0 mt-1 w-full bg-popover border rounded-md shadow-md max-h-64 overflow-auto">
                      {searching && <div className="p-3 text-xs text-muted-foreground">Buscando…</div>}
                      {productResults.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted border-b last:border-b-0"
                          onClick={() => addPart(p)}
                        >
                          <div className="flex justify-between gap-2">
                            <span className="truncate font-medium">{p.name}</span>
                            <span className="text-xs text-muted-foreground shrink-0">{fmtBRL(p.price || p.unit_price || 0)}</span>
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {p.code || 'sem código'} · Estoque: {p.quantity ?? 0}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="text-left px-3 py-2 w-24">Código</th>
                      <th className="text-left px-3 py-2">Item</th>
                      <th className="text-center px-3 py-2 w-20">Qtd</th>
                      <th className="text-right px-3 py-2 w-32">Unitário</th>
                      <th className="text-right px-3 py-2 w-32">Total</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {parts.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                          Nenhuma peça adicionada. Use a busca acima.
                        </td>
                      </tr>
                    ) : (
                      parts.map((p) => (
                        <tr key={p.id} className="border-t">
                          <td className="px-3 py-2 text-xs font-mono text-muted-foreground">{p.code || '—'}</td>
                          <td className="px-3 py-2">{p.product_name}</td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              min={1}
                              value={p.quantity}
                              onChange={(e) => updatePart(p.id, { quantity: Number(e.target.value) })}
                              className="h-8 text-center"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              step="0.01"
                              value={p.unit_price}
                              onChange={(e) => updatePart(p.id, { unit_price: Number(e.target.value) })}
                              className="h-8 text-right"
                            />
                          </td>
                          <td className="px-3 py-2 text-right font-medium">{fmtBRL(p.total_price)}</td>
                          <td className="px-3 py-2">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => removePart(p.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Envio + Frete + Mão de Obra */}
            <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs">Método de Envio (aparece no PDF)</Label>
                <Input
                  value={selected.shipping_method || ''}
                  placeholder="Ex.: Correios - Sedex"
                  list="shipping-methods"
                  onChange={(e) => setSelected({ ...selected, shipping_method: e.target.value })}
                />
                <datalist id="shipping-methods">
                  {SHIPPING_METHODS.map((m) => (<option key={m} value={m} />))}
                </datalist>
              </div>

              <div>
                <Label className="text-xs">Frete (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={selected.shipping_value || 0}
                  onChange={(e) => setSelected({ ...selected, shipping_value: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label className="text-xs">Mão de Obra (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={selected.labor_value || 0}
                  onChange={(e) => setSelected({ ...selected, labor_value: Number(e.target.value) })}
                />
              </div>
            </section>


            {/* Descrição do Reparo */}
            <section>
              <h3 className="text-sm font-semibold mb-2">Descrição do Reparo</h3>
              <Textarea
                rows={4}
                placeholder="Reparo a ser executado / executado no equipamento..."
                value={selected.repair_description || ''}
                onChange={(e) => setSelected({ ...selected, repair_description: e.target.value })}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Esta descrição aparecerá no orçamento impresso.
              </p>
            </section>

            {/* Desconto */}
            <section className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-xl">
              <div>
                <Label className="text-xs">Aplicar desconto sobre</Label>
                <Select
                  value={selected.discount_scope || 'parts'}
                  onValueChange={(v) => setSelected({ ...selected, discount_scope: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="parts">Somente peças</SelectItem>
                    <SelectItem value="total">Total do orçamento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Desconto (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  className="text-right text-destructive font-medium"
                  value={selected.discount_percent || 0}
                  onChange={(e) => setSelected({ ...selected, discount_percent: Number(e.target.value) })}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Base: {selected.discount_scope === 'total' ? 'peças + mão de obra + frete' : 'valor das peças'}
                </p>
              </div>
            </section>


            {/* Formas de Pagamento */}
            <section>
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">
                Formas de Pagamento
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {PAYMENT_METHODS.map((m) => {
                  const Icon = m.icon;
                  const active = selected.payment_method === m.key;
                  return (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() =>
                        setSelected({
                          ...selected,
                          payment_method: active ? null : m.key,
                        })
                      }
                      className={`flex flex-col items-center justify-center gap-2 border rounded-lg p-4 transition-all ${
                        active
                          ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                          : 'border-border hover:border-primary/40 hover:bg-muted/40'
                      }`}
                    >
                      <Icon className={`h-6 w-6 ${m.color}`} />
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-center">
                        {m.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Comprovante */}
            <section className="border rounded-lg bg-muted/30 p-4">
              <h4 className="text-sm font-semibold mb-3">Comprovante de Pagamento</h4>
              <div className="flex items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*,application/pdf"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadProof(f);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                  Escolher Arquivo
                </Button>
                {selected.payment_proof_url ? (
                  <a
                    href={selected.payment_proof_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-primary underline truncate max-w-md"
                  >
                    Ver comprovante enviado
                  </a>
                ) : (
                  <span className="text-sm text-muted-foreground">Nenhum arquivo enviado</span>
                )}
              </div>
            </section>

            {/* Totals */}
            <section className="border rounded-lg p-4 bg-card">
              <div className="space-y-1 text-sm max-w-md ml-auto">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal peças</span>
                  <span>{fmtBRL(partsTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Mão de obra</span>
                  <span>{fmtBRL(selected.labor_value)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Frete</span>
                  <span>{fmtBRL(selected.shipping_value)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Desconto ({Number(selected.discount_percent || 0)}% ·{' '}
                    {selected.discount_scope === 'total' ? 'total' : 'peças'})
                  </span>
                  <span className="text-destructive">- {fmtBRL(discountValue)}</span>
                </div>
                <div className="flex justify-between pt-2 mt-2 border-t text-base font-bold">
                  <span>Total Geral</span>
                  <span className="text-primary">{fmtBRL(grandTotal)}</span>
                </div>
              </div>
            </section>
          </div>
        )}
      </section>
    </div>
  );
}
