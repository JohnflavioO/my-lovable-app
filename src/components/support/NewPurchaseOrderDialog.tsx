import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Search,
  Trash2,
  Loader2,
  QrCode,
  CreditCard,
  Banknote,
  Send,
  FileText,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Client {
  id: string;
  name: string;
  cpf_cnpj?: string | null;
}


interface Product {
  id: string;
  name: string;
  code?: string | null;
  price?: number | null;
}

interface SaleItem {
  id: string;
  product_id: string;
  product_name: string;
  product_code: string | null;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  editOrderId?: string | null;
}

const PAYMENT_METHODS = [
  { key: 'pix', label: 'PIX', icon: QrCode },
  { key: 'credito', label: 'CARTÃO DE CRÉDITO', icon: CreditCard },
  { key: 'debito', label: 'CARTÃO DE DÉBITO', icon: CreditCard },
  { key: 'dinheiro', label: 'DINHEIRO', icon: Banknote },
  { key: 'transferencia', label: 'TRANSFERÊNCIA', icon: Send },
  { key: 'boleto', label: 'BOLETO', icon: FileText },
];

const FREIGHT_TYPES = ['Correios', 'Motoboy', 'Transportadora', 'Retirada'];

export function NewPurchaseOrderDialog({ open, onOpenChange, onSuccess, editOrderId }: Props) {
  const isEdit = !!editOrderId;
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [clientSearch, setClientSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  const [productSearch, setProductSearch] = useState('');
  const [items, setItems] = useState<SaleItem[]>([]);

  const [payment, setPayment] = useState<string>('pix');
  const [discount, setDiscount] = useState<number>(0);
  const [freightType, setFreightType] = useState<string>('Correios');
  const [freightValue, setFreightValue] = useState<number>(0);
  const [status, setStatus] = useState<string>('pendente');

  useEffect(() => {
    if (!open) return;
    setClientSearch('');
    setSelectedClient(null);
    setProductSearch('');
    setItems([]);
    setPayment('pix');
    setDiscount(0);
    setFreightType('Correios');
    setFreightValue(0);
    setStatus('pendente');

    (async () => {
      const [{ data: cs }, { data: ps }] = await Promise.all([
        supabase.from('technical_clients').select("id,name,cpf_cnpj").order('name'),
        supabase.from('technical_products').select('id,name,code,price').order('name'),
      ]);
      const clientList = (cs || []) as Client[];
      const productList = (ps || []) as Product[];
      setClients(clientList);
      setProducts(productList);

      if (editOrderId) {
        const [{ data: order }, { data: orderItems }] = await Promise.all([
          supabase.from('technical_purchase_orders').select('*').eq('id', editOrderId).maybeSingle(),
          supabase
            .from('technical_purchase_order_items')
            .select('*, technical_products(name, code)')
            .eq('purchase_order_id', editOrderId),
        ]);
        if (order) {
          setStatus(order.status || 'pendente');
          let meta: any = {};
          try { meta = order.notes ? JSON.parse(order.notes) : {}; } catch { meta = {}; }
          setPayment(meta.payment_method || 'pix');
          setDiscount(Number(meta.discount_percent) || 0);
          setFreightType(meta.freight_type || 'Correios');
          setFreightValue(Number(meta.freight_value) || 0);
          if (meta.client_id) {
            const found = clientList.find(c => c.id === meta.client_id);
            if (found) setSelectedClient(found);
            else if (meta.client_name) setSelectedClient({ id: meta.client_id, name: meta.client_name });
          } else if (meta.client_name) {
            setSelectedClient({ id: 'external', name: meta.client_name });
          }
        }
        if (orderItems) {
          setItems(
            orderItems.map((it: any) => ({
              id: it.id,
              product_id: it.product_id,
              product_name: it.technical_products?.name || '—',
              product_code: it.technical_products?.code || null,
              quantity: Number(it.quantity) || 1,
              unit_price: Number(it.unit_price) || 0,
              subtotal: Number(it.total_price) || 0,
            }))
          );
        }
      }
    })();
  }, [open, editOrderId]);

  const filteredClients = useMemo(() => {
    if (!clientSearch.trim() || selectedClient) return [];
    const q = clientSearch.toLowerCase();
    return clients
      .filter(c => c.name.toLowerCase().includes(q) || (c.cpf_cnpj || '').toLowerCase().includes(q))
      .slice(0, 6);
  }, [clientSearch, clients, selectedClient]);

  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return [];
    const q = productSearch.toLowerCase();
    return products.filter(p => p.name.toLowerCase().includes(q) || (p.code || '').toLowerCase().includes(q)).slice(0, 6);
  }, [productSearch, products]);

  const addProduct = (p: Product) => {
    setItems(prev => {
      const existing = prev.find(i => i.product_id === p.id);
      if (existing) {
        return prev.map(i =>
          i.product_id === p.id
            ? { ...i, quantity: i.quantity + 1, subtotal: (i.quantity + 1) * i.unit_price }
            : i
        );
      }
      const price = Number(p.price) || 0;
      return [
        ...prev,
        {
          id: Math.random().toString(36).slice(2),
          product_id: p.id,
          product_name: p.name,
          product_code: p.code || null,
          quantity: 1,
          unit_price: price,
          subtotal: price,
        },
      ];
    });
    setProductSearch('');
  };

  const updateQty = (id: string, qty: number) => {
    setItems(prev =>
      prev.map(i =>
        i.id === id ? { ...i, quantity: qty, subtotal: qty * i.unit_price } : i
      )
    );
  };

  const removeItem = (id: string) => setItems(prev => prev.filter(i => i.id !== id));

  const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
  const discountValue = (subtotal * (Number(discount) || 0)) / 100;
  const total = Math.max(0, subtotal - discountValue + (Number(freightValue) || 0));

  const canSubmit = selectedClient && items.length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!selectedClient) return toast.error('Selecione um cliente');
    if (items.length === 0) return toast.error('Adicione ao menos uma peça');

    try {
      setSubmitting(true);
      const meta = {
        client_id: selectedClient.id,
        client_name: selectedClient.name,
        payment_method: payment,
        discount_percent: Number(discount) || 0,
        discount_value: discountValue,
        freight_type: freightType,
        freight_value: Number(freightValue) || 0,
      };

      let orderId = editOrderId as string | undefined;

      if (isEdit && orderId) {
        const { error: updErr } = await supabase
          .from('technical_purchase_orders')
          .update({
            status,
            total_amount: total,
            notes: JSON.stringify(meta),
          })
          .eq('id', orderId);
        if (updErr) throw updErr;

        const { error: delErr } = await supabase
          .from('technical_purchase_order_items')
          .delete()
          .eq('purchase_order_id', orderId);
        if (delErr) throw delErr;
      } else {
        const { data: order, error } = await supabase
          .from('technical_purchase_orders')
          .insert({
            order_type: 'Venda',
            status: 'pendente',
            purchase_date: new Date().toISOString().split('T')[0],
            total_amount: total,
            notes: JSON.stringify(meta),
          })
          .select()
          .single();
        if (error) throw error;
        orderId = order.id;
      }

      const itemsToInsert = items.map(i => ({
        purchase_order_id: orderId!,
        product_id: i.product_id,
        quantity: i.quantity,
        unit_price: i.unit_price,
        total_price: i.subtotal,
      }));
      const { error: itemsErr } = await supabase
        .from('technical_purchase_order_items')
        .insert(itemsToInsert);
      if (itemsErr) throw itemsErr;

      toast.success(isEdit ? 'Venda atualizada!' : 'Venda registrada com sucesso!');
      onSuccess();
      onOpenChange(false);
    } catch (e: any) {
      toast.error('Erro ao salvar venda: ' + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            {isEdit ? 'Editar Ordem de Compra' : 'Nova Venda de Peças'}
          </DialogTitle>
        </DialogHeader>

        {isEdit && (
          <section className="space-y-2">
            <h3 className="font-semibold">Status da Ordem</h3>
            <div className="flex flex-wrap gap-2">
              {[
                { key: 'pendente', label: 'Pendente' },
                { key: 'pago', label: 'Pago' },
                { key: 'entregue', label: 'Entregue' },
                { key: 'cancelado', label: 'Cancelado' },
              ].map(s => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setStatus(s.key)}
                  className={cn(
                    'px-3 py-1 text-xs border rounded-md transition-colors',
                    status === s.key ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted'
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* 1. Cliente */}
        <section className="space-y-2">
          <h3 className="font-semibold">1. Selecionar Cliente</h3>
          {selectedClient ? (
            <div className="flex items-center justify-between border rounded-md px-3 py-2 bg-muted/40">
              <div>
                <div className="font-medium">{selectedClient.name}</div>
                {selectedClient.cpf_cnpj && (
                  <div className="text-xs text-muted-foreground">{selectedClient.cpf_cnpj}</div>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedClient(null)}>
                Trocar
              </Button>
            </div>
          ) : (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por Nome, CPF ou CNPJ..."
                className="pl-9"
                value={clientSearch}
                onChange={e => setClientSearch(e.target.value)}
              />
              {filteredClients.length > 0 && (
                <div className="absolute z-10 left-0 right-0 mt-1 bg-popover border rounded-md shadow-md max-h-56 overflow-auto">
                  {filteredClients.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-muted text-sm"
                      onClick={() => {
                        setSelectedClient(c);
                        setClientSearch('');
                      }}
                    >
                      <div className="font-medium">{c.name}</div>
                      {c.cpf_cnpj && <div className="text-xs text-muted-foreground">{c.cpf_cnpj}</div>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* 2. Peças */}
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-4">
            <h3 className="font-semibold">2. Adicionar Peças</h3>
            <div className="relative w-64">
              <Input
                placeholder="Buscar peça..."
                value={productSearch}
                onChange={e => setProductSearch(e.target.value)}
              />
              {filteredProducts.length > 0 && (
                <div className="absolute z-10 left-0 right-0 mt-1 bg-popover border rounded-md shadow-md max-h-56 overflow-auto">
                  {filteredProducts.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-muted text-sm flex justify-between"
                      onClick={() => addProduct(p)}
                    >
                      <span>{p.name} <span className="text-xs text-muted-foreground ml-2">({p.code || 'S/C'})</span></span>
                      <span className="text-muted-foreground">
                        R$ {(Number(p.price) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-32">Código</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="w-24">Qtd</TableHead>
                  <TableHead className="w-32">Unitário</TableHead>
                  <TableHead className="w-32">Subtotal</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                      Nenhum item adicionado
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map(i => (
                    <TableRow key={i.id}>
                      <TableCell className="font-mono text-xs">{i.product_code || '—'}</TableCell>
                      <TableCell>{i.product_name}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={1}
                          value={i.quantity}
                          onChange={e => updateQty(i.id, parseInt(e.target.value) || 1)}
                          className="h-8"
                        />
                      </TableCell>
                      <TableCell>R$ {i.unit_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell>R$ {i.subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => removeItem(i.id)} className="text-rose-500">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </section>

        {/* 3. Pagamento */}
        <section className="space-y-2">
          <h3 className="font-semibold">3. Forma de Pagamento</h3>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {PAYMENT_METHODS.map(m => {
              const Icon = m.icon;
              const active = payment === m.key;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setPayment(m.key)}
                  className={cn(
                    'border rounded-lg p-3 flex flex-col items-center justify-center gap-1 text-[10px] font-medium uppercase transition-colors',
                    active
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'hover:bg-muted'
                  )}
                >
                  <Icon className={cn('h-5 w-5', active ? 'text-primary' : 'text-muted-foreground')} />
                  <span className="text-center leading-tight">{m.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* 4 & 5 Desconto / Frete */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <h3 className="font-semibold">4. Desconto</h3>
            <div className="flex items-center gap-3">
              <div className="relative w-32">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={discount}
                  onChange={e => setDiscount(parseFloat(e.target.value) || 0)}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
              </div>
              <span className="text-sm text-muted-foreground">
                Economia: R$ {discountValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold">5. Frete</h3>
            <div className="flex flex-wrap gap-2">
              {FREIGHT_TYPES.map(f => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFreightType(f)}
                  className={cn(
                    'px-3 py-1 text-xs border rounded-md transition-colors',
                    freightType === f ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-muted'
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
              <Input
                type="number"
                min={0}
                value={freightValue}
                onChange={e => setFreightValue(parseFloat(e.target.value) || 0)}
                className="pl-9"
              />
            </div>
          </div>
        </section>

        <div className="border-t pt-4 flex flex-col items-end gap-1">
          <span className="text-sm text-muted-foreground">Valor Total</span>
          <span className="text-2xl font-bold">
            R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </span>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="bg-primary hover:bg-primary/90"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              isEdit ? 'Salvar Alterações' : 'Finalizar Venda'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
