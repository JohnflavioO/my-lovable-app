import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, MessageCircle, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { ActionMenu } from '@/components/ActionMenu';
import OrderDetailsModal from '@/components/support/OrderDetailsModal';

export const STATUS_OPTIONS = [
  { key: 'recebido', label: 'Recebido' },
  { key: 'diagnostico', label: 'Diagnóstico' },
  { key: 'aguardando_aprovacao', label: 'Aguardando Aprovação' },
  { key: 'aguardando_peca', label: 'Aguardando Peça' },
  { key: 'em_reparo', label: 'Em Reparo' },
  { key: 'pronto', label: 'Pronto' },
  { key: 'entregue', label: 'Entregue' },
  { key: 'cancelado', label: 'Cancelado' },
];

export default function SupportOrders() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const filterStatus = params.get('status') || '';
  const [orders, setOrders] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [clients, setClients] = useState<any[]>([]);
  const [open, setOpen] = useState(params.get('new') === 'true');
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const DEFAULT_ACCESSORIES = ['Fonte', 'Cabo AC', 'Refletor', 'Case', 'Control Box', 'Head Cable'];
  const [clientSearch, setClientSearch] = useState('');
  const [accessoryInput, setAccessoryInput] = useState('');
  const [form, setForm] = useState<any>({
    client_id: '', client_name: '', equipment: '', brand: '', model: '', serial: '',
    reported_defect: '', physical_condition: '', accessories: [] as string[],
    status: 'recebido', os_type: 'Orçamento',
    entry_date: new Date().toISOString().split('T')[0]
  });

  const load = async () => {
    let q = supabase.from('technical_orders' as any).select('*, technical_clients(phone, whatsapp)').order('created_at', { ascending: false });
    if (filterStatus) q = q.eq('status', filterStatus);
    const { data } = await q;
    setOrders((data || []) as any[]);
  };

  useEffect(() => { load(); }, [filterStatus]);
  useEffect(() => { (async () => {
    const { data } = await supabase.from('technical_clients' as any).select('id,name,cpf_cnpj').order('name');
    setClients((data || []) as any[]);
  })(); }, []);

  const filteredOrders = orders.filter(o => {
    const search = searchTerm.toLowerCase();
    return (
      (o.os_number || '').toLowerCase().includes(search) ||
      (o.client_name || '').toLowerCase().includes(search) ||
      (o.equipment || '').toLowerCase().includes(search) ||
      (o.brand || '').toLowerCase().includes(search) ||
      (o.model || '').toLowerCase().includes(search)
    );
  });

  const filteredClients = clientSearch.trim()
    ? clients.filter((c: any) =>
        c.name?.toLowerCase().includes(clientSearch.toLowerCase()) ||
        (c.cpf_cnpj || '').toLowerCase().includes(clientSearch.toLowerCase())
      ).slice(0, 6)
    : [];

  const selectedClient = clients.find((c: any) => c.id === form.client_id);

  const toggleAccessory = (a: string) => {
    setForm((f: any) => ({
      ...f,
      accessories: f.accessories.includes(a)
        ? f.accessories.filter((x: string) => x !== a)
        : [...f.accessories, a],
    }));
  };

  const addCustomAccessory = () => {
    const v = accessoryInput.trim();
    if (!v) return;
    if (!form.accessories.includes(v)) {
      setForm((f: any) => ({ ...f, accessories: [...f.accessories, v] }));
    }
    setAccessoryInput('');
  };

  const save = async () => {
    if (!form.client_id) return toast.error('Selecione o cliente');
    const cli = clients.find(c => c.id === form.client_id);
    const { error } = await supabase.from('technical_orders' as any).insert({
      ...form,
      client_name: cli?.name || '',
      created_by: user?.id,
      technician_id: user?.id,
      technician_name: profile?.full_name,
    });
    if (error) return toast.error(error.message);
    toast.success('OS criada');
    setOpen(false);
    setClientSearch('');
    setForm({
      client_id: '', client_name: '', equipment: '', brand: '', model: '', serial: '',
      reported_defect: '', physical_condition: '', accessories: [],
      status: 'recebido', os_type: 'Orçamento',
      entry_date: new Date().toISOString().split('T')[0]
    });
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Ordens de Serviço</h1>
          <p className="text-sm text-muted-foreground">{filterStatus ? `Filtro: ${filterStatus}` : 'Todas as OS'}</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => {
          setOpen(v);
          if (v) navigate({ search: '?new=true' });
          else navigate({ search: '' });
        }}>
          <DialogTrigger asChild><Button className="bg-[#00966d] hover:bg-[#007a58]"><Plus className="h-4 w-4 mr-2" />Nova OS</Button></DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="text-lg font-bold">Nova Ordem de Serviço</DialogTitle></DialogHeader>

            <div className="space-y-5 pt-2">
              {/* Cliente */}
              <section>
                <h3 className="text-sm font-semibold mb-2">☐ Cliente</h3>
                <div className="border-t pt-3 space-y-2">
                  <Label className="text-xs">Selecionar Cliente</Label>
                  {selectedClient ? (
                    <div className="flex items-center justify-between border rounded-md px-3 py-2 bg-muted/40">
                      <div>
                        <div className="font-medium text-sm">{selectedClient.name}</div>
                        {selectedClient.cpf_cnpj && <div className="text-xs text-muted-foreground">{selectedClient.cpf_cnpj}</div>}
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setForm({ ...form, client_id: '' })}>Trocar</Button>
                    </div>
                  ) : (
                    <div className="relative">
                      <Input
                        placeholder="🔍 Buscar por Nome, CPF ou CNPJ..."
                        value={clientSearch}
                        onChange={e => setClientSearch(e.target.value)}
                      />
                      {filteredClients.length > 0 && (
                        <div className="absolute z-20 left-0 right-0 mt-1 bg-popover border rounded-md shadow-md max-h-56 overflow-auto">
                          {filteredClients.map((c: any) => (
                            <button
                              key={c.id}
                              type="button"
                              className="w-full text-left px-3 py-2 hover:bg-muted text-sm"
                              onClick={() => { setForm({ ...form, client_id: c.id }); setClientSearch(''); }}
                            >
                              <div className="font-medium">{c.name}</div>
                              {c.cpf_cnpj && <div className="text-xs text-muted-foreground">{c.cpf_cnpj}</div>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </section>

              {/* Tipo de Serviço */}
              <section>
                <h3 className="text-sm font-semibold mb-2">☐ Tipo de Serviço</h3>
                <div className="border-t pt-3 grid grid-cols-2 gap-3">
                  {[
                    { key: 'Orçamento', label: 'Orçamento / Pago', desc: 'Serviço com custo para o cliente' },
                    { key: 'Garantia', label: 'Garantia', desc: 'Serviço coberto pela garantia' },
                  ].map(opt => {
                    const active = form.os_type === opt.key;
                    return (
                      <button
                        type="button"
                        key={opt.key}
                        onClick={() => setForm({ ...form, os_type: opt.key })}
                        className={`text-left border-2 rounded-lg p-3 transition-colors ${active ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/30'}`}
                      >
                        <div className="font-semibold text-sm">{opt.label}</div>
                        <div className="text-xs text-muted-foreground">{opt.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Equipamento */}
              <section>
                <h3 className="text-sm font-semibold mb-2">☐ Equipamento</h3>
                <div className="border-t pt-3 grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Marca</Label>
                    <Input placeholder="Aputure / Astera..." value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Modelo</Label>
                    <Input placeholder="Ex: LS 600d Pro" value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Nº Série</Label>
                    <Input value={form.serial} onChange={e => setForm({ ...form, serial: e.target.value })} />
                  </div>

                  <div className="col-span-2">
                    <Label className="text-xs">Estado Físico / Condições</Label>
                    <Input
                      placeholder="Riscos, amassados, sujeira..."
                      value={form.physical_condition}
                      onChange={e => setForm({ ...form, physical_condition: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Defeito Reclamado</Label>
                    <Textarea
                      value={form.reported_defect}
                      onChange={e => setForm({ ...form, reported_defect: e.target.value })}
                    />
                  </div>
                </div>
              </section>

              {/* Checklist de Acessórios */}
              <section>
                <h3 className="text-sm font-semibold mb-2">Checklist de Acessórios</h3>
                <div className="border-t pt-3 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {Array.from(new Set([...DEFAULT_ACCESSORIES, ...form.accessories])).map(a => {
                      const active = form.accessories.includes(a);
                      return (
                        <button
                          type="button"
                          key={a}
                          onClick={() => toggleAccessory(a)}
                          className={`px-3 py-1 text-xs rounded-full border transition-colors ${active ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'}`}
                        >
                          {a}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Outro acessório..."
                      value={accessoryInput}
                      onChange={e => setAccessoryInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomAccessory(); } }}
                    />
                    <Button type="button" variant="outline" onClick={addCustomAccessory}>Adicionar</Button>
                  </div>
                </div>
              </section>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={save} className="bg-[#00966d] hover:bg-[#007a58]">Gerar Ordem de Serviço</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>


      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-base">{filteredOrders.length} OS</CardTitle>
          <div className="w-full max-w-sm">
            <Input
              placeholder="Buscar por OS, Cliente, Equipamento..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>OS</TableHead><TableHead>Cliente</TableHead><TableHead>Equipamento</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOrders.map(o => (
                <TableRow key={o.id} className="hover:bg-muted/50 transition-colors">
                  <TableCell><Link to={`/suporte/os/${o.id}`} className="font-medium text-primary hover:underline">{o.os_number}</Link></TableCell>
                  <TableCell>{o.client_name}</TableCell>
                  <TableCell>{o.equipment}</TableCell>
                  <TableCell><Badge variant="secondary" className="font-normal">{STATUS_OPTIONS.find(s => s.key === o.status)?.label || o.status}</Badge></TableCell>
                  <TableCell className="text-right font-medium">R$ {Number(o.total_value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell className="text-right">
                    <ActionMenu 
                      className="justify-end"
                      actions={[
                        { 
                          label: "Ver Detalhes", 
                          icon: ExternalLink, 
                          onClick: () => setDetailsId(o.id),
                          isPrimary: true
                        },
                        { 
                          label: "WhatsApp", 
                          icon: MessageCircle, 
                          onClick: () => {
                            const phone = o.technical_clients?.whatsapp || o.technical_clients?.phone || '';
                            if (phone) window.open(`https://wa.me/${phone.replace(/\D/g, '')}`, '_blank');
                            else toast.error("Telefone não disponível");
                          },
                          className: "text-green-600"
                        },
                        { 
                          label: "Excluir", 
                          icon: Trash2, 
                          onClick: async () => {
                            if (!confirm('Deseja excluir esta OS?')) return;
                            const { error } = await supabase.from('technical_orders' as any).delete().eq('id', o.id);
                            if (error) toast.error(error.message);
                            else { toast.success('OS excluída'); load(); }
                          },
                          variant: 'destructive'
                        }
                      ]} 
                    />
                  </TableCell>
                </TableRow>
              ))}
              {filteredOrders.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Nenhuma OS encontrada</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <OrderDetailsModal
        orderId={detailsId}
        open={!!detailsId}
        onOpenChange={(v) => { if (!v) setDetailsId(null); }}
        onChanged={load}
      />
    </div>
  );
}
