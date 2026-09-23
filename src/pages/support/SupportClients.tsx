import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, ArrowRight, ArrowLeft, Pencil, Trash2, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { Progress } from '@/components/ui/progress';
import { ActionMenu } from '@/components/ActionMenu';

export default function SupportClients() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [clients, setClients] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [search, setSearch] = useState('');
  const [editingClient, setEditingClient] = useState<any>(null);
  const [form, setForm] = useState<any>({ 
    name: '', 
    cpf_cnpj: '', 
    phone: '', 
    whatsapp: '', 
    email: '', 
    address: '', 
    city: '',
    state: '',
    zip_code: '',
    notes: '' 
  });

  const [crmSearch, setCrmSearch] = useState('');
  const [crmResults, setCrmResults] = useState<any[]>([]);
  const [linkedCrmId, setLinkedCrmId] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase.from('technical_clients' as any).select('*').order('created_at', { ascending: false });
    setClients((data || []) as any[]);
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!crmSearch.trim() || crmSearch.trim().length < 2) { setCrmResults([]); return; }
    const t = setTimeout(async () => {
      const term = `%${crmSearch.trim()}%`;
      const { data } = await (supabase.from('clients') as any)
        .select('id,name,company_name,cpf_cnpj,email,phone,address,city,state,cep,salesperson_id')
        .or(`name.ilike.${term},company_name.ilike.${term},cpf_cnpj.ilike.${term},email.ilike.${term}`)
        .limit(6);
      setCrmResults(data || []);
    }, 300);
    return () => clearTimeout(t);
  }, [crmSearch]);

  const emptyForm = { name: '', cpf_cnpj: '', phone: '', whatsapp: '', email: '', address: '', city: '', state: '', zip_code: '', notes: '' };

  const pickCrmClient = (c: any) => {
    setLinkedCrmId(c.id);
    setForm({
      name: c.company_name || c.name || '',
      cpf_cnpj: c.cpf_cnpj || '',
      phone: c.phone || '',
      whatsapp: c.phone || '',
      email: c.email || '',
      address: c.address || '',
      city: c.city || '',
      state: c.state || '',
      zip_code: c.cep || '',
      notes: '',
    });
    setCrmSearch('');
    setCrmResults([]);
  };

  const save = async () => {
    if (!form.name) return toast.error('Nome obrigatório');

    const payload: any = {
      name: form.name, cpf_cnpj: form.cpf_cnpj, phone: form.phone, whatsapp: form.whatsapp,
      email: form.email, address: form.address, city: form.city, state: form.state,
      zip_code: form.zip_code, notes: form.notes,
    };
    if (linkedCrmId) payload.crm_client_id = linkedCrmId;

    let error;
    if (editingClient) {
      const { error: err } = await supabase.from('technical_clients' as any).update(payload).eq('id', editingClient.id);
      error = err;
    } else {
      const { error: err } = await supabase.from('technical_clients' as any).insert({ ...payload, created_by: user?.id });
      error = err;
    }

    if (error) return toast.error(error.message);
    toast.success(editingClient ? 'Cliente atualizado' : 'Cliente cadastrado e sincronizado com o CRM');
    setOpen(false);
    setStep(1);
    setEditingClient(null);
    setLinkedCrmId(null);
    setForm(emptyForm);
    load();
  };


  const filtered = clients.filter(c => 
    c.name?.toLowerCase().includes(search.toLowerCase()) || 
    c.cpf_cnpj?.includes(search) ||
    c.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold font-display">Clientes</h1>
        <Dialog open={open} onOpenChange={(v) => { 
          setOpen(v); 
          if(v) setSearchParams({ new: 'true' });
          if(!v) { 
            setStep(1); 
            setEditingClient(null); 
            setLinkedCrmId(null); 
            setCrmSearch(''); 
            setCrmResults([]); 
            setForm(emptyForm); 
            setSearchParams({});
          } 
        }}>
          <DialogTrigger asChild>
            <Button className="bg-[#00966d] hover:bg-[#007a58]">
              <Plus className="h-4 w-4 mr-2" /> Novo Cliente
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <DialogTitle className="text-xl">Novo Cliente</DialogTitle>
                  <p className="text-xs text-muted-foreground">
                    Etapa {step} de 2: {step === 1 ? 'Dados Pessoais' : 'Endereço e Notas'}
                  </p>
                </div>
                <div className="flex gap-1">
                  <div className={`h-1.5 w-8 rounded-full ${step >= 1 ? 'bg-[#00966d]' : 'bg-gray-200'}`} />
                  <div className={`h-1.5 w-8 rounded-full ${step >= 2 ? 'bg-[#00966d]' : 'bg-gray-200'}`} />
                </div>
              </div>
            </DialogHeader>
            
            <div className="space-y-4 py-2">
              {step === 1 && !editingClient && (
                <div className="space-y-1.5 rounded-md border border-dashed p-3 bg-muted/30">
                  <Label className="text-sm font-medium">Buscar cliente já cadastrado no CRM</Label>
                  <Input
                    placeholder="Nome, CNPJ/CPF ou e-mail…"
                    value={crmSearch}
                    onChange={e => setCrmSearch(e.target.value)}
                  />
                  {linkedCrmId && (
                    <p className="text-xs text-emerald-700">✓ Vinculado a um cliente do CRM. A carteira do vendedor será preservada.</p>
                  )}
                  {crmResults.length > 0 && (
                    <div className="border rounded bg-popover max-h-48 overflow-auto">
                      {crmResults.map((c: any) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => pickCrmClient(c)}
                          className="block w-full text-left px-3 py-2 text-sm hover:bg-muted border-b last:border-b-0"
                        >
                          <div className="font-medium">{c.company_name || c.name}</div>
                          <div className="text-xs text-muted-foreground">{c.cpf_cnpj} · {c.email || c.phone}</div>
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">Se o cliente não existir, preencha abaixo — ele será criado automaticamente no CRM.</p>
                </div>
              )}
              {step === 1 && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Nome Completo</Label>
                    <Input 
                      placeholder=""
                      value={form.name} 
                      onChange={e => setForm({ ...form, name: e.target.value })} 
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">CPF / CNPJ</Label>
                    <Input 
                      placeholder=""
                      value={form.cpf_cnpj} 
                      onChange={e => setForm({ ...form, cpf_cnpj: e.target.value })} 
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">E-mail</Label>
                      <Input 
                        type="email"
                        placeholder=""
                        value={form.email} 
                        onChange={e => setForm({ ...form, email: e.target.value })} 
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">Telefone</Label>
                      <Input 
                        placeholder=""
                        value={form.phone} 
                        onChange={e => setForm({ ...form, phone: e.target.value })} 
                      />
                    </div>
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Endereço Completo</Label>
                    <Input 
                      placeholder="Rua, número, bairro..."
                      value={form.address} 
                      onChange={e => setForm({ ...form, address: e.target.value })} 
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2 space-y-1.5">
                      <Label className="text-sm font-medium">Cidade</Label>
                      <Input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">UF</Label>
                      <Input value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">WhatsApp (opcional)</Label>
                    <Input 
                      placeholder=""
                      value={form.whatsapp} 
                      onChange={e => setForm({ ...form, whatsapp: e.target.value })} 
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">Observações</Label>
                    <Textarea 
                      placeholder=""
                      className="min-h-[100px]"
                      value={form.notes} 
                      onChange={e => setForm({ ...form, notes: e.target.value })} 
                    />
                  </div>
                </>
              )}

              <div className="flex justify-between gap-3 mt-6">
                <Button variant="ghost" onClick={() => { if(step > 1) setStep(1); else setOpen(false); }}>
                  {step === 1 ? 'Cancelar' : 'Voltar'}
                </Button>
                
                {step === 1 ? (
                  <Button 
                    onClick={() => setStep(2)} 
                    className="bg-[#00966d] hover:bg-[#007a58] gap-2"
                  >
                    Próximo <ArrowRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button 
                    onClick={save} 
                    className="bg-[#00966d] hover:bg-[#007a58]"
                  >
                    Finalizar Cadastro
                  </Button>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Input 
          placeholder="Buscar por nome, documento ou email..." 
          className="max-w-xl"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>NOME / DOCUMENTO</TableHead>
              <TableHead>CONTATO</TableHead>
              <TableHead>ENDEREÇO</TableHead>
              <TableHead className="text-right">AÇÕES</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(c => (
              <TableRow key={c.id}>
                <TableCell>
                  <div className="font-semibold">{c.name}</div>
                  <div className="text-xs text-muted-foreground">{c.cpf_cnpj}</div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">{c.email}</div>
                  <div className="text-sm">{c.phone}</div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                  {c.address || '-'}
                </TableCell>
                <TableCell className="text-right">
                  <ActionMenu 
                    className="justify-end"
                    actions={[
                      { 
                        label: "WhatsApp", 
                        icon: MessageCircle, 
                        onClick: () => {
                          const phone = c.whatsapp || c.phone || '';
                          if (phone) window.open(`https://wa.me/${phone.replace(/\D/g, '')}`, '_blank');
                          else toast.error("Telefone não disponível");
                        },
                        isPrimary: true,
                        className: "text-green-600"
                      },
                      { 
                        label: "Editar", 
                        icon: Pencil, 
                        onClick: () => {
                          setEditingClient(c);
                          setForm({ ...emptyForm, ...Object.fromEntries(Object.entries(c).filter(([k]) => k in emptyForm)) });
                          setOpen(true);
                          setSearchParams({ edit: 'true' });
                        },
                        isSecondary: true
                      },
                      { 
                        label: "Excluir", 
                        icon: Trash2, 
                        onClick: async () => {
                          if (!confirm('Excluir este cliente?')) return;
                          const { error } = await supabase.from('technical_clients' as any).delete().eq('id', c.id);
                          if (error) toast.error(error.message);
                          else { toast.success('Cliente excluído'); load(); }
                        },
                        variant: 'destructive'
                      }
                    ]} 
                  />
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-12">
                  Nenhum cliente cadastrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
