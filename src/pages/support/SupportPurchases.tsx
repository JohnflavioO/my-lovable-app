import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ShoppingCart, Search, Plus, Trash2, Printer, Pencil } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { NewPurchaseOrderDialog } from '@/components/support/NewPurchaseOrderDialog';
import { generatePurchaseOrderPdf } from '@/lib/generatePurchaseOrderPdf';

interface OrderItem {
  id: string;
  product_id: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  technical_products?: { name: string; code?: string | null } | null;
}

interface PurchaseOrder {
  id: string;
  status: string;
  total_amount: number;
  created_at: string;
  notes: string | null;
  order_type: string | null;
  technical_suppliers: { name: string } | null;
}

interface ParsedMeta {
  client_id?: string;
  client_name?: string;
  payment_method?: string;
  discount_percent?: number;
  discount_value?: number;
  freight_type?: string;
  freight_value?: number;
}

const STATUS_OPTIONS = [
  { key: 'pendente', label: 'Pendente', cls: 'bg-emerald-500 text-white' },
  { key: 'pago', label: 'Pago', cls: 'bg-slate-200 text-slate-700' },
  { key: 'entregue', label: 'Entregue', cls: 'bg-slate-200 text-slate-700' },
  { key: 'cancelado', label: 'Cancelado', cls: 'bg-slate-200 text-slate-700' },
];

const parseMeta = (notes: string | null): ParsedMeta => {
  if (!notes) return {};
  try { return JSON.parse(notes); } catch { return {}; }
};

const formatBRL = (n: number) =>
  `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ocNumber = (createdAt: string, index: number) => {
  const year = new Date(createdAt).getFullYear();
  // Começar a partir da OC2026-061 (índice 1 no sistema = 61 no visual)
  const visualIndex = index + 60;
  return `OC-${year}-${String(visualIndex).padStart(4, '0')}`;
};

export default function SupportPurchases() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editOrderId, setEditOrderId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailItems, setDetailItems] = useState<OrderItem[]>([]);
  const [detailClient, setDetailClient] = useState<any>(null);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('technical_purchase_orders')
        .select('*, technical_suppliers(name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setOrders((data || []) as any);
    } catch (e) {
      toast.error('Erro ao carregar ordens');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchOrders(); }, []);

  // Compute OC number map: oldest = 0001
  const ocMap = useMemo(() => {
    const sorted = [...orders].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
    const map: Record<string, string> = {};
    sorted.forEach((o, i) => { map[o.id] = ocNumber(o.created_at, i + 1); });
    return map;
  }, [orders]);

  const filtered = orders.filter(o => {
    if (statusFilter !== 'all' && o.status !== statusFilter) return false;
    const meta = parseMeta(o.notes);
    const q = searchTerm.toLowerCase();
    if (!q) return true;
    return (
      (meta.client_name || '').toLowerCase().includes(q) ||
      (o.technical_suppliers?.name || '').toLowerCase().includes(q) ||
      (ocMap[o.id] || '').toLowerCase().includes(q)
    );
  });


  const openDetails = async (id: string) => {
    setDetailId(id);
    setDetailItems([]);
    setDetailClient(null);
    const order = orders.find(o => o.id === id);
    const meta = parseMeta(order?.notes || null);

    const { data: items } = await supabase
      .from('technical_purchase_order_items')
      .select('*, technical_products(name, code)')
      .eq('purchase_order_id', id);
    setDetailItems((items || []) as any);

    if (meta.client_id) {
      const { data: client } = await supabase
        .from('technical_clients')
        .select('name,cpf_cnpj,email,phone,address,city,state,zip_code')
        .eq('id', meta.client_id)
        .maybeSingle();
      setDetailClient(client);
    } else if (meta.client_name) {
      setDetailClient({ name: meta.client_name });
    }
  };

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase
      .from('technical_purchase_orders')
      .update({ status })
      .eq('id', id);
    if (error) return toast.error('Erro ao atualizar status');
    toast.success('Status atualizado');
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
  };

  const deleteOrder = async (id: string) => {
    if (!confirm('Excluir esta ordem?')) return;
    const { error } = await supabase.from('technical_purchase_orders').delete().eq('id', id);
    if (error) return toast.error('Erro ao excluir');
    toast.success('Excluída');
    setOrders(prev => prev.filter(o => o.id !== id));
    if (detailId === id) setDetailId(null);
  };

  const detailOrder = orders.find(o => o.id === detailId);
  const detailMeta = parseMeta(detailOrder?.notes || null);

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ordens de Compra</h1>
          <p className="text-sm text-muted-foreground">Gestão de vendas de peças</p>
        </div>
        <Button size="sm" className="gap-2" onClick={() => { setEditOrderId(null); setDialogOpen(true); }}>
          <Plus className="h-4 w-4" /> Nova Venda
        </Button>
      </div>

      <NewPurchaseOrderDialog
        open={dialogOpen}
        onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditOrderId(null); }}
        onSuccess={fetchOrders}
        editOrderId={editOrderId}
      />

      <div className="flex gap-3 bg-card p-4 rounded-xl border">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nº OC ou nome do cliente..."
            className="pl-9"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 h-10"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {STATUS_OPTIONS.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>

      </div>

      <div className="bg-card rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b text-left">
              <tr>
                <th className="px-6 py-4 font-semibold">Nº OC</th>
                <th className="px-6 py-4 font-semibold">Cliente</th>
                <th className="px-6 py-4 font-semibold">Data</th>
                <th className="px-6 py-4 font-semibold">Total</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                Array(5).fill(0).map((_, i) => (
                  <tr key={i} className="animate-pulse"><td colSpan={6} className="h-16 bg-muted/20" /></tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <ShoppingCart className="h-10 w-10 text-muted-foreground/30" />
                      <p className="text-muted-foreground">Nenhuma ordem encontrada.</p>
                    </div>
                  </td>
                </tr>
              ) : filtered.map(o => {
                const meta = parseMeta(o.notes);
                const clientName = meta.client_name || o.technical_suppliers?.name || '—';
                const status = STATUS_OPTIONS.find(s => s.key === o.status) || STATUS_OPTIONS[0];
                return (
                  <tr key={o.id} className="hover:bg-muted/30">
                    <td className="px-6 py-4 font-mono text-xs text-primary">{ocMap[o.id]}</td>
                    <td className="px-6 py-4 font-medium">{clientName}</td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {new Date(o.created_at).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-6 py-4 font-bold">{formatBRL(Number(o.total_amount))}</td>
                    <td className="px-6 py-4">
                      <Badge className={cn('font-medium', status.cls)}>{status.label}</Badge>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end items-center gap-3">
                        <button
                          onClick={() => openDetails(o.id)}
                          className="text-primary hover:underline text-sm font-medium"
                        >
                          Detalhes
                        </button>
                        <button
                          onClick={() => { setEditOrderId(o.id); setDialogOpen(true); }}
                          className="text-blue-500 hover:text-blue-600"
                          aria-label="Editar"
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => deleteOrder(o.id)}
                          className="text-rose-500 hover:text-rose-600"
                          aria-label="Excluir"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Details Dialog */}
      <Dialog open={!!detailId} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          {detailOrder && (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl font-bold">
                  Ordem de Compra #{ocMap[detailOrder.id]}
                </DialogTitle>
                <p className="text-xs text-muted-foreground">
                  {new Date(detailOrder.created_at).toLocaleString('pt-BR')}
                </p>
              </DialogHeader>

              {/* Status pills */}
              <div className="flex flex-wrap gap-2">
                {STATUS_OPTIONS.map(s => {
                  const active = detailOrder.status === s.key;
                  return (
                    <button
                      key={s.key}
                      onClick={() => updateStatus(detailOrder.id, s.key)}
                      className={cn(
                        'px-4 py-1.5 rounded-full text-xs font-medium border transition-colors',
                        active
                          ? 'bg-emerald-500 text-white border-emerald-500'
                          : 'bg-background text-foreground hover:bg-muted'
                      )}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Cliente */}
                <div>
                  <div className="text-xs font-semibold text-muted-foreground tracking-wide mb-2">
                    DADOS DO CLIENTE
                  </div>
                  <div className="border rounded-lg p-3 text-sm space-y-0.5">
                    <div className="font-semibold">{detailClient?.name || detailMeta.client_name || '—'}</div>
                    {detailClient?.cpf_cnpj && <div className="text-xs">{detailClient.cpf_cnpj}</div>}
                    {detailClient?.email && <div className="text-xs">{detailClient.email}</div>}
                    {detailClient?.phone && <div className="text-xs">{detailClient.phone}</div>}
                    {(detailClient?.address || detailClient?.city) && (
                      <div className="text-xs text-muted-foreground pt-1">
                        {[detailClient.address, detailClient.city, detailClient.state, detailClient.zip_code].filter(Boolean).join(', ')}
                      </div>
                    )}
                  </div>
                </div>

                {/* Pagamento */}
                <div>
                  <div className="text-xs font-semibold text-muted-foreground tracking-wide mb-2">
                    PAGAMENTO E TOTAL
                  </div>
                  <div className="border border-emerald-200 bg-emerald-50/60 rounded-lg p-3 text-sm space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Forma de Pagamento:</span>
                      <span className="font-bold uppercase">{detailMeta.payment_method || '—'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Status:</span>
                      <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
                        {(STATUS_OPTIONS.find(s => s.key === detailOrder.status)?.label || 'Pendente').toUpperCase()}
                      </Badge>
                    </div>
                    <div className="border-t pt-2 flex justify-between text-xs">
                      <span className="text-muted-foreground uppercase">Subtotal</span>
                      <span className="text-emerald-600 font-semibold">
                        {formatBRL(detailItems.reduce((s, i) => s + Number(i.total_price), 0))}
                      </span>
                    </div>
                    {!!detailMeta.discount_value && (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground uppercase">Desconto ({detailMeta.discount_percent}%)</span>
                        <span>- {formatBRL(detailMeta.discount_value)}</span>
                      </div>
                    )}
                    {!!detailMeta.freight_value && (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground uppercase">Frete ({detailMeta.freight_type})</span>
                        <span>{formatBRL(detailMeta.freight_value)}</span>
                      </div>
                    )}
                    <div className="border-t pt-2">
                      <div className="text-xs text-muted-foreground uppercase">Valor Total</div>
                      <div className="text-2xl font-bold text-emerald-600">{formatBRL(Number(detailOrder.total_amount))}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Items */}
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-semibold">Código</th>
                      <th className="px-3 py-2 font-semibold">Item</th>
                      <th className="px-3 py-2 font-semibold w-16 text-center">Qtd</th>
                      <th className="px-3 py-2 font-semibold w-32 text-right">Subtotal</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {detailItems.map(it => (
                      <tr key={it.id}>
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{it.technical_products?.code || '—'}</td>
                        <td className="px-3 py-2">{it.technical_products?.name || '—'}</td>
                        <td className="px-3 py-2 text-center">{it.quantity}</td>
                        <td className="px-3 py-2 text-right font-medium">{formatBRL(Number(it.total_price))}</td>
                        <td className="px-3 py-2 text-right">
                          <Trash2 className="h-4 w-4 text-rose-400 inline" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button onClick={() => generatePurchaseOrderPdf({ ...detailOrder, ...detailMeta, oc_number: ocMap[detailOrder.id] }, detailItems, detailClient)} className="gap-2">
                  <Printer className="h-4 w-4" /> Gerar PDF
                </Button>
                <Button variant="outline" onClick={() => setDetailId(null)}>Fechar</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
