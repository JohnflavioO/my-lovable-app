import { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, AlertTriangle, Search, Tags, History, Printer, SlidersHorizontal, Package, MoreHorizontal, Pencil, Trash2, PlusCircle, Wrench, Download, Upload, FileJson, FileSpreadsheet, FileText, MessageCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { ActionMenu } from '@/components/ActionMenu';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

type ImportMethod = 'sheet' | 'xml' | 'pdf' | 'text';
type ParsedRow = { name: string; code?: string; price?: number; cost?: number; quantity?: number; location?: string; unit_measure?: string };

const norm = (s: any) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
const toNum = (v: any) => {
  if (v == null || v === '') return 0;
  const s = String(v).replace(/[^0-9,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};
const HEADER_MAP: Record<string, (keyof ParsedRow)> = {
  codigo: 'code', code: 'code', sku: 'code', ref: 'code', referencia: 'code',
  nome: 'name', descricao: 'name', produto: 'name', name: 'name', item: 'name',
  preco: 'price', precovenda: 'price', valor: 'price', price: 'price', vlrunit: 'price', valorunitario: 'price',
  custo: 'cost', precocusto: 'cost', cost: 'cost',
  qtd: 'quantity', quantidade: 'quantity', estoque: 'quantity', qty: 'quantity', quant: 'quantity',
  local: 'location', localizacao: 'location', location: 'location', prateleira: 'location',
  unidade: 'unit_measure', un: 'unit_measure', unit: 'unit_measure',
};

const CATEGORIES = ['Aputure', 'Amaran', 'Astera', 'Creamsource', 'Outros'];
const MAINTENANCE_STATUS = ['Aguardando', 'Em Manutenção', 'Pronto', 'Entregue'];

export default function SupportStock() {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [maintenances, setMaintenances] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);
  const [brandDialogOpen, setBrandDialogOpen] = useState(false);
  const [newBrandName, setNewBrandName] = useState('');
  const [editingItem, setEditingItem] = useState<any>(null);
  const [editingMaintenance, setEditingMaintenance] = useState<any>(null);
  const [form, setForm] = useState<any>({
    name: '', code: '', manufacturer: '', compatibility: '', location: '',
    quantity: 0, min_quantity: 0, cost: 0, price: 0, notes: '', category: 'Outros',
    unit_measure: 'UN'
  });
  const [mForm, setMForm] = useState<any>({
    brand: '', model: '', description: '', technician: '', status: 'Aguardando', notes: ''
  });
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<{ category: string; brand: string; status: string }>({ category: 'all', brand: 'all', status: 'all' });
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  // Import state
  const [importBrand, setImportBrand] = useState<string>('');
  const [importMethod, setImportMethod] = useState<ImportMethod>('sheet');
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<ParsedRow[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const xmlRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const { data: products, error: productsError } = await supabase.from('technical_products' as any).select('*').order('name');
    if (productsError) {
      toast.error(`Erro ao carregar estoque: ${productsError.message}`);
      setItems([]);
      return;
    }
    setItems((products || []) as any[]);
    
    const { data: brandList, error: brandsError } = await supabase.from('technical_brands' as any).select('*').order('name');
    if (brandsError) {
      toast.error(`Erro ao carregar marcas: ${brandsError.message}`);
    }
    setBrands((brandList || []) as any[]);

    const { data: maintList, error: maintError } = await supabase.from('technical_maintenances' as any).select('*').order('created_at', { ascending: false });
    if (maintError) {
      toast.error(`Erro ao carregar manutenções: ${maintError.message}`);
    }
    setMaintenances((maintList || []) as any[]);
  };

  const loadBrands = async () => {
    const { data: brandList } = await supabase.from('technical_brands' as any).select('*').order('name');
    setBrands((brandList || []) as any[]);
  };

  const handleCreateBrand = async () => {
    if (!newBrandName.trim()) return toast.error('Nome da marca é obrigatório');
    const { data, error } = await supabase.from('technical_brands' as any).insert({ name: newBrandName.trim() }).select();
    if (error) return toast.error(error.message);
    toast.success('Marca criada com sucesso');
    
    const brand = (data as any[])?.[0];
    if (brand && open) {
      setForm((prev: any) => ({ ...prev, manufacturer: brand.name }));
    }
    if (brand && maintenanceOpen) {
      setMForm((prev: any) => ({ ...prev, brand: brand.name }));
    }
    
    setNewBrandName('');
    setBrandDialogOpen(false);
    loadBrands();
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.name) return toast.error('Nome obrigatório');
    
    const payload = { ...form, created_by: user?.id };
    
    if (editingItem) {
      const { error } = await supabase.from('technical_products' as any).update(payload).eq('id', editingItem.id);
      if (error) return toast.error(error.message);
      toast.success('Peça atualizada');
    } else {
      const { error } = await supabase.from('technical_products' as any).insert(payload);
      if (error) return toast.error(error.message);
      toast.success('Peça cadastrada');
    }
    
    setOpen(false);
    setEditingItem(null);
    setForm({ name: '', code: '', manufacturer: '', compatibility: '', location: '', quantity: 0, min_quantity: 0, cost: 0, price: 0, notes: '', category: 'Outros', unit_measure: 'UN' });
    load();
  };

  const saveMaintenance = async () => {
    if (!mForm.brand || !mForm.model || !mForm.description) return toast.error('Marca, Modelo e Descrição são obrigatórios');
    
    if (editingMaintenance) {
      const { error } = await supabase.from('technical_maintenances' as any).update(mForm).eq('id', editingMaintenance.id);
      if (error) return toast.error(error.message);
      toast.success('Manutenção atualizada');
    } else {
      const { error } = await supabase.from('technical_maintenances' as any).insert(mForm);
      if (error) return toast.error(error.message);
      toast.success('Manutenção cadastrada');
    }
    
    setMaintenanceOpen(false);
    setEditingMaintenance(null);
    setMForm({ brand: '', model: '', description: '', technician: '', status: 'Aguardando', notes: '' });
    load();
  };

  const handleEdit = (item: any) => {
    setEditingItem(item);
    setForm({
      name: item.name, code: item.code, manufacturer: item.manufacturer,
      compatibility: item.compatibility, location: item.location,
      quantity: item.quantity, min_quantity: item.min_quantity,
      cost: Number(item.cost), price: Number(item.price),
      notes: item.notes, category: item.category,
      unit_measure: item.unit_measure || 'UN'
    });
    setOpen(true);
  };

  const handleEditMaintenance = (m: any) => {
    setEditingMaintenance(m);
    setMForm({
      brand: m.brand, model: m.model, description: m.description,
      technician: m.technician, status: m.status, notes: m.notes
    });
    setMaintenanceOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente excluir este item?')) return;
    const { error } = await supabase.from('technical_products' as any).delete().eq('id', id);
    if (error) return toast.error(error.message);
    toast.success('Item excluído');
    load();
  };

  const handleDeleteMaintenance = async (id: string) => {
    if (!confirm('Deseja realmente excluir esta manutenção?')) return;
    const { error } = await supabase.from('technical_maintenances' as any).delete().eq('id', id);
    if (error) return toast.error(error.message);
    toast.success('Manutenção excluída');
    load();
  };

  // ============ IMPORT HANDLERS ============
  const mapRows = (rows: any[][]): ParsedRow[] => {
    if (!rows.length) return [];
    // Detect header row (first row with >= 2 known headers)
    let hIdx = 0;
    for (let i = 0; i < Math.min(rows.length, 5); i++) {
      const matches = rows[i].filter(c => HEADER_MAP[norm(c)]).length;
      if (matches >= 2) { hIdx = i; break; }
    }
    const headers = rows[hIdx].map(h => HEADER_MAP[norm(h)] || null);
    const out: ParsedRow[] = [];
    for (let i = hIdx + 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.every(c => c == null || c === '')) continue;
      const obj: any = {};
      headers.forEach((k, idx) => { if (k) obj[k] = r[idx]; });
      if (!obj.name && !obj.code) continue;
      out.push({
        name: String(obj.name || obj.code || '').trim(),
        code: obj.code ? String(obj.code).trim() : undefined,
        price: toNum(obj.price),
        cost: toNum(obj.cost),
        quantity: Math.round(toNum(obj.quantity)),
        location: obj.location ? String(obj.location).trim() : undefined,
        unit_measure: obj.unit_measure ? String(obj.unit_measure).trim().toUpperCase() : 'UN',
      });
    }
    return out;
  };

  const handleSheetFile = async (file: File) => {
    try {
      setImporting(true);
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' });
      const parsed = mapRows(rows);
      if (!parsed.length) { toast.error('Nenhuma linha válida encontrada. Verifique os cabeçalhos.'); return; }
      setPreview(parsed);
    } catch (e: any) {
      toast.error('Erro ao ler arquivo: ' + (e.message || e));
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleXmlFile = async (file: File) => {
    try {
      setImporting(true);
      const txt = await file.text();
      const doc = new DOMParser().parseFromString(txt, 'text/xml');
      const dets = Array.from(doc.getElementsByTagName('det'));
      const parsed: ParsedRow[] = dets.map(det => {
        const prod = det.getElementsByTagName('prod')[0];
        const g = (t: string) => prod?.getElementsByTagName(t)[0]?.textContent || '';
        return {
          code: g('cProd'),
          name: g('xProd'),
          quantity: Math.round(toNum(g('qCom'))),
          price: toNum(g('vUnCom')),
          cost: toNum(g('vUnCom')),
          unit_measure: (g('uCom') || 'UN').toUpperCase(),
        };
      }).filter(r => r.name);
      if (!parsed.length) { toast.error('Nenhum produto encontrado no XML da NF-e'); return; }
      setPreview(parsed);
    } catch (e: any) {
      toast.error('Erro ao ler XML: ' + (e.message || e));
    } finally {
      setImporting(false);
      if (xmlRef.current) xmlRef.current.value = '';
    }
  };

  const handleTextImport = () => {
    const lines = importText.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) return toast.error('Cole ao menos uma linha');
    const parsed: ParsedRow[] = lines.map(line => {
      const parts = line.split(/[|;\t]/).map(p => p.trim());
      const [code, name, price, qty, location] = parts;
      return {
        code: code || undefined,
        name: name || code || '',
        price: toNum(price),
        quantity: Math.round(toNum(qty)),
        location: location || undefined,
        unit_measure: 'UN',
      };
    }).filter(r => r.name);
    if (!parsed.length) return toast.error('Nenhuma linha válida');
    setPreview(parsed);
  };

  const confirmImport = async () => {
    if (!preview?.length) return;
    setImporting(true);
    try {
      const payload = preview.map(r => ({
        name: r.name,
        code: r.code || null,
        manufacturer: importBrand || null,
        brand: importBrand || null,
        category: importBrand || 'Outros',
        quantity: r.quantity || 0,
        min_quantity: 0,
        cost: r.cost || 0,
        price: r.price || 0,
        unit_price: r.price || 0,
        location: r.location || null,
        unit_measure: r.unit_measure || 'UN',
        created_by: user?.id,
      }));
      const { error } = await supabase.from('technical_products' as any).insert(payload);
      if (error) throw error;
      toast.success(`${payload.length} peça(s) importada(s)`);
      setPreview(null);
      setImportText('');
      load();
    } catch (e: any) {
      toast.error('Erro ao importar: ' + (e.message || e));
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Código', 'Nome', 'Preço', 'Custo', 'Quantidade', 'Local', 'Unidade'],
      ['EX001', 'Peça exemplo', '199,90', '120,00', '10', 'Prateleira A1', 'UN'],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Peças');
    XLSX.writeFile(wb, 'modelo-importacao-pecas.xlsx');
  };


  const filtered = useMemo(() => items.filter(i => {
    const q = search.toLowerCase().trim();
    const matchSearch = !q
      || i.name?.toLowerCase().includes(q)
      || i.code?.toLowerCase().includes(q)
      || i.category?.toLowerCase().includes(q)
      || i.manufacturer?.toLowerCase().includes(q)
      || i.brand?.toLowerCase().includes(q)
      || i.location?.toLowerCase().includes(q);
    const matchCat = filters.category === 'all' || i.category === filters.category;
    const matchBrand = filters.brand === 'all' || i.manufacturer === filters.brand;
    let matchStatus = true;
    if (filters.status === 'in') matchStatus = i.quantity > i.min_quantity;
    else if (filters.status === 'low') matchStatus = i.quantity > 0 && i.quantity <= i.min_quantity;
    else if (filters.status === 'out') matchStatus = i.quantity <= 0;
    return matchSearch && matchCat && matchBrand && matchStatus;
  }), [items, search, filters]);

  useEffect(() => { setPage(1); }, [search, filters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const activeFilterCount = (filters.category !== 'all' ? 1 : 0) + (filters.brand !== 'all' ? 1 : 0) + (filters.status !== 'all' ? 1 : 0);


  const getStatus = (item: any) => {
    if (item.quantity <= 0) return { label: 'Sem estoque', color: 'destructive' };
    if (item.quantity <= item.min_quantity) return { label: 'Baixo estoque', color: 'warning' };
    return { label: 'Em estoque', color: 'success' };
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display">Estoque de Peças</h1>
          <p className="text-sm text-muted-foreground italic">Gerenciamento de componentes Aputure e Astera</p>
        </div>
      </div>

      <Tabs defaultValue="consulta" className="w-full">
        <div className="flex items-center justify-between mb-4 border-b pb-2">
          <TabsList className="bg-transparent h-auto p-0 gap-4">
            <TabsTrigger 
              value="consulta" 
              className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none px-0 py-2 flex items-center gap-2"
            >
              <Package className="h-4 w-4" /> Consulta
            </TabsTrigger>
            <TabsTrigger 
              value="manutencao" 
              className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none px-0 py-2 flex items-center gap-2"
            >
              <Wrench className="h-4 w-4" /> Manutenção
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="consulta" className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <div className="flex gap-2">
              <Badge variant="secondary" className="cursor-pointer bg-primary text-white px-3 py-1">Todos</Badge>
              {brands.slice(0, 5).map(b => (
                <Badge key={b.id} variant="outline" className="cursor-pointer hover:bg-muted px-3 py-1">{b.name}</Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditingItem(null); }}>
                <DialogTrigger asChild>
                  <Button className="bg-[#00966d] hover:bg-[#007a58]">
                    <Plus className="h-4 w-4 mr-2" /> Nova Peça
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>{editingItem ? 'Editar Peça' : 'Adicionar Nova Peça'}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <Label>Nome da Peça</Label>
                      <Input 
                        value={form.name} 
                        onChange={e => setForm({ ...form, name: e.target.value })} 
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Código (SKU)</Label>
                        <Input 
                          value={form.code} 
                          onChange={e => setForm({ ...form, code: e.target.value })} 
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Categoria</Label>
                        <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Fabricante</Label>
                        </div>
                        <Select value={form.manufacturer} onValueChange={v => setForm({ ...form, manufacturer: v })}>
                          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>
                            {brands.map(b => <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Un. por Pacote</Label>
                        <Input 
                          value={form.unit_measure} 
                          onChange={e => setForm({ ...form, unit_measure: e.target.value })} 
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Quantidade</Label>
                        <Input 
                          type="number"
                          value={form.quantity} 
                          onChange={e => setForm({ ...form, quantity: Number(e.target.value) })} 
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Estoque Mínimo</Label>
                        <Input 
                          type="number"
                          value={form.min_quantity} 
                          onChange={e => setForm({ ...form, min_quantity: Number(e.target.value) })} 
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Preço (R$)</Label>
                        <Input 
                          type="number"
                          value={form.price} 
                          onChange={e => setForm({ ...form, price: Number(e.target.value) })} 
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Localização</Label>
                        <Input 
                          value={form.location} 
                          onChange={e => setForm({ ...form, location: e.target.value })} 
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>URL da Imagem</Label>
                      <Input 
                        value={form.image_url || ''} 
                        placeholder="https://exemplo.com/imagem.png"
                        onChange={e => setForm({ ...form, image_url: e.target.value })} 
                      />
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                      <Button onClick={save} className="bg-[#00966d] hover:bg-[#007a58]">
                        {editingItem ? 'Salvar' : 'Criar Peça'}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              <Button variant="outline" className="gap-2" onClick={() => setBrandDialogOpen(true)}>
                <PlusCircle className="h-4 w-4" /> Cadastrar Marca
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Buscar por nome, código ou categoria..." 
                className="pl-9"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <Popover open={filterOpen} onOpenChange={setFilterOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <SlidersHorizontal className="h-4 w-4" /> Filtros
                  {activeFilterCount > 0 && (
                    <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">{activeFilterCount}</Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-4 space-y-3" align="end">
                <div className="space-y-1.5">
                  <Label className="text-xs">Categoria</Label>
                  <Select value={filters.category} onValueChange={v => setFilters(f => ({ ...f, category: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      {Array.from(new Set(items.map(i => i.category).filter(Boolean))).map((c: any) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Marca / Fabricante</Label>
                  <Select value={filters.brand} onValueChange={v => setFilters(f => ({ ...f, brand: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      {Array.from(new Set([...brands.map(b => b.name), ...items.map(i => i.manufacturer)].filter(Boolean))).map((b: any) => (
                        <SelectItem key={b} value={b}>{b}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Status</Label>
                  <Select value={filters.status} onValueChange={v => setFilters(f => ({ ...f, status: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="in">Em estoque</SelectItem>
                      <SelectItem value="low">Baixo estoque</SelectItem>
                      <SelectItem value="out">Sem estoque</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-between pt-2 border-t">
                  <Button variant="ghost" size="sm" onClick={() => setFilters({ category: 'all', brand: 'all', status: 'all' })}>Limpar</Button>
                  <Button size="sm" onClick={() => setFilterOpen(false)}>Aplicar</Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-[400px]">PEÇA</TableHead>
                  <TableHead>CÓDIGO</TableHead>
                  <TableHead>LOCALIZAÇÃO</TableHead>
                  <TableHead>PREÇO</TableHead>
                  <TableHead>QTD</TableHead>
                  <TableHead className="text-right">AÇÕES</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded bg-muted flex items-center justify-center overflow-hidden border">
                          <img 
                            src={item.image_url || 'https://picsum.photos/40?grayscale'} 
                            alt="" 
                            className="w-full h-full object-cover" 
                          />
                        </div>
                        <div>
                          <div className="text-sm font-semibold">{item.name}</div>
                          <div className="text-xs text-muted-foreground uppercase">{item.category}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">{item.code || '-'}</TableCell>
                    <TableCell className="text-muted-foreground">{item.location || '-'}</TableCell>
                    <TableCell className="font-medium">
                      <div className="text-xs text-muted-foreground">R$</div>
                      <div>{Number(item.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                    </TableCell>
                    <TableCell>
                      <span className={item.quantity <= item.min_quantity ? "text-destructive font-bold" : "font-bold"}>
                        {item.quantity}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <ActionMenu 
                        className="justify-end"
                        actions={[
                          { 
                            label: "Editar", 
                            icon: Pencil, 
                            onClick: () => handleEdit(item),
                            isPrimary: true
                          },
                          { 
                            label: "Excluir", 
                            icon: Trash2, 
                            onClick: () => handleDelete(item.id),
                            variant: 'destructive'
                          }
                        ]} 
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                      Nenhum item encontrado.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {filtered.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
              <p className="text-xs text-muted-foreground">
                Mostrando <span className="font-semibold text-foreground">{(currentPage - 1) * PAGE_SIZE + 1}</span>
                {' – '}
                <span className="font-semibold text-foreground">{Math.min(currentPage * PAGE_SIZE, filtered.length)}</span>
                {' de '}
                <span className="font-semibold text-foreground">{filtered.length}</span> peça(s)
              </p>
              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setPage(1)}>Início</Button>
                  <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Anterior</Button>
                  <span className="px-3 text-sm tabular-nums">
                    Página <span className="font-semibold">{currentPage}</span> de <span className="font-semibold">{totalPages}</span>
                  </span>
                  <Button variant="outline" size="sm" disabled={currentPage === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>Próxima</Button>
                  <Button variant="outline" size="sm" disabled={currentPage === totalPages} onClick={() => setPage(totalPages)}>Fim</Button>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="manutencao" className="space-y-6">
          <div className="p-6 border rounded-lg bg-card space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-primary font-medium">
                <AlertTriangle className="h-5 w-5" /> Configuração da Importação
              </div>
              <Button variant="outline" size="sm" className="gap-2" onClick={downloadTemplate}>
                <Download className="h-4 w-4" /> Baixar modelo Excel
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>Marca (opcional)</Label>
                <Select value={importBrand} onValueChange={setImportBrand}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {brands.map(b => <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Método de Entrada</Label>
                <div className="flex bg-muted p-1 rounded-md gap-1">
                  {([
                    { k: 'sheet', icon: <FileSpreadsheet className="h-4 w-4 text-green-600" />, label: 'Planilha (Excel/CSV)' },
                    { k: 'xml', icon: <FileJson className="h-4 w-4 text-orange-500" />, label: 'XML (NF-e)' },
                    { k: 'pdf', icon: <FileText className="h-4 w-4 text-red-500" />, label: 'PDF (DANFE)' },
                    { k: 'text', icon: <FileText className="h-4 w-4 text-slate-500" />, label: 'Texto (Massa)' },
                  ] as { k: ImportMethod; icon: any; label: string }[]).map(m => (
                    <Button
                      key={m.k}
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setImportMethod(m.k)}
                      className={`flex-1 gap-2 text-xs ${importMethod === m.k ? 'bg-white shadow-sm' : ''}`}
                    >
                      {m.icon} {m.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            {importMethod === 'sheet' && (
              <div className="border-2 border-dashed rounded-lg p-12 flex flex-col items-center justify-center text-center space-y-4 bg-muted/10"
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleSheetFile(f); }}
              >
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                  <FileSpreadsheet className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">Importar Planilha de Peças</h3>
                  <p className="text-sm text-muted-foreground">Arraste seu arquivo CSV/XLSX aqui, ou clique no botão</p>
                  <p className="text-xs text-muted-foreground mt-1">Colunas: Código, Nome, Preço, Custo, Quantidade, Local, Unidade</p>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleSheetFile(f); }}
                />
                <Button
                  disabled={importing}
                  onClick={() => fileRef.current?.click()}
                  className="bg-[#1e293b] hover:bg-[#0f172a] gap-2 px-8"
                >
                  {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Selecionar Arquivo
                </Button>
              </div>
            )}

            {importMethod === 'xml' && (
              <div className="border-2 border-dashed rounded-lg p-12 flex flex-col items-center justify-center text-center space-y-4 bg-muted/10">
                <FileJson className="h-8 w-8 text-orange-500" />
                <div>
                  <h3 className="font-semibold text-lg">Importar XML da NF-e</h3>
                  <p className="text-sm text-muted-foreground">Selecione o arquivo XML da nota fiscal eletrônica</p>
                </div>
                <input
                  ref={xmlRef}
                  type="file"
                  accept=".xml"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleXmlFile(f); }}
                />
                <Button
                  disabled={importing}
                  onClick={() => xmlRef.current?.click()}
                  className="bg-[#1e293b] hover:bg-[#0f172a] gap-2 px-8"
                >
                  {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Selecionar XML
                </Button>
              </div>
            )}

            {importMethod === 'pdf' && (
              <div className="border-2 border-dashed rounded-lg p-8 text-center space-y-3 bg-muted/10">
                <FileText className="h-8 w-8 text-red-500 mx-auto" />
                <h3 className="font-semibold">Importação por PDF (DANFE)</h3>
                <p className="text-sm text-muted-foreground">
                  A extração automática de PDF ainda não é suportada. Use o XML da NF-e (mesma nota) — o resultado é mais preciso.
                </p>
                <Button variant="outline" size="sm" onClick={() => setImportMethod('xml')}>Usar XML da NF-e</Button>
              </div>
            )}

            {importMethod === 'text' && (
              <div className="space-y-3">
                <Label className="text-sm">Cole uma linha por peça. Separe por <code>|</code>, <code>;</code> ou tab. Ordem: <b>código | nome | preço | quantidade | local</b></Label>
                <Textarea
                  rows={8}
                  value={importText}
                  onChange={e => setImportText(e.target.value)}
                  placeholder={"EX001 | Cabo XLR | 89,90 | 20 | Prateleira A1\nEX002 | Suporte Boom | 249,00 | 5 | Prateleira B2"}
                  className="font-mono text-xs"
                />
                <div className="flex justify-end">
                  <Button onClick={handleTextImport} className="gap-2">
                    <Upload className="h-4 w-4" /> Processar Texto
                  </Button>
                </div>
              </div>
            )}
          </div>

          <Dialog open={!!preview} onOpenChange={o => !o && setPreview(null)}>
            <DialogContent className="sm:max-w-[860px] max-h-[85vh] overflow-hidden flex flex-col">
              <DialogHeader>
                <DialogTitle>Pré-visualização da importação ({preview?.length || 0} itens)</DialogTitle>
              </DialogHeader>
              <div className="overflow-auto border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead className="text-right">Qtd</TableHead>
                      <TableHead className="text-right">Custo</TableHead>
                      <TableHead className="text-right">Preço</TableHead>
                      <TableHead>Local</TableHead>
                      <TableHead>Un.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(preview || []).slice(0, 200).map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs">{r.code || '-'}</TableCell>
                        <TableCell className="text-xs">{r.name}</TableCell>
                        <TableCell className="text-right text-xs">{r.quantity ?? 0}</TableCell>
                        <TableCell className="text-right text-xs">{(r.cost ?? 0).toFixed(2)}</TableCell>
                        <TableCell className="text-right text-xs">{(r.price ?? 0).toFixed(2)}</TableCell>
                        <TableCell className="text-xs">{r.location || '-'}</TableCell>
                        <TableCell className="text-xs">{r.unit_measure || 'UN'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {preview && preview.length > 200 && (
                <p className="text-xs text-muted-foreground">Mostrando as primeiras 200 linhas de {preview.length}.</p>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setPreview(null)} disabled={importing}>Cancelar</Button>
                <Button onClick={confirmImport} disabled={importing} className="gap-2">
                  {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Confirmar Importação
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>
      </Tabs>

      <Dialog open={brandDialogOpen} onOpenChange={setBrandDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Criar Nova Marca</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Nome da Marca</Label>
              <Input 
                placeholder="Ex: Aputure, Sony, etc" 
                value={newBrandName}
                onChange={e => setNewBrandName(e.target.value)}
              />
            </div>
            <Button className="w-full bg-[#00966d] hover:bg-[#007a58]" onClick={handleCreateBrand}>
              Criar Marca
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <footer className="text-center py-8 text-xs text-muted-foreground border-t mt-12">
        <p>© 2026 MCI. Todos os direitos reservados.</p>
        <p>Desenvolvido por <span className="text-primary font-medium">Studio On Design</span></p>
      </footer>
    </div>
  );
}
