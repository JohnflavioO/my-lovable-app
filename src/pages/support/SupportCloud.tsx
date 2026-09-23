import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import {
  Search, Upload, File, FileText, Image as ImageIcon, MoreVertical, Download, Trash2, FolderOpen, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

const CATEGORIES = ['Manual', 'Firmware', 'Esquema Elétrico', 'Outros'];
const BUCKET = 'technical-cloud';

interface CloudFile {
  id: string;
  name: string;
  category: string | null;
  file_url: string;
  file_type: string | null;
  created_at: string;
}

export default function SupportCloud() {
  const { user } = useAuth();
  const [files, setFiles] = useState<CloudFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState<{ name: string; category: string; file: File | null }>({ name: '', category: 'Manual', file: null });

  const fetchFiles = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('technical_cloud_files')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) toast.error('Erro ao carregar arquivos');
    setFiles((data || []) as any);
    setLoading(false);
  };

  useEffect(() => { fetchFiles(); }, []);

  const handleUpload = async () => {
    if (!form.file) return toast.error('Selecione um arquivo');
    if (!form.name.trim()) return toast.error('Nome obrigatório');
    setUploading(true);
    try {
      const ext = form.file.name.split('.').pop();
      const path = `${user?.id || 'anon'}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, form.file, { contentType: form.file.type });
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from('technical_cloud_files').insert({
        name: form.name.trim(),
        category: form.category,
        file_url: path,
        file_type: form.file.type,
        uploaded_by: user?.id,
      });
      if (insErr) throw insErr;
      toast.success('Arquivo enviado');
      setOpen(false);
      setForm({ name: '', category: 'Manual', file: null });
      fetchFiles();
    } catch (e: any) {
      toast.error('Erro: ' + e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (file: CloudFile) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(file.file_url, 3600);
    if (error || !data) return toast.error('Erro ao gerar link');
    window.open(data.signedUrl, '_blank');
  };

  const handleDelete = async (file: CloudFile) => {
    if (!confirm(`Excluir "${file.name}"?`)) return;
    await supabase.storage.from(BUCKET).remove([file.file_url]);
    const { error } = await supabase.from('technical_cloud_files').delete().eq('id', file.id);
    if (error) return toast.error(error.message);
    toast.success('Excluído');
    fetchFiles();
  };

  const getFileIcon = (type: string | null) => {
    if (type?.includes('pdf')) return <FileText className="h-6 w-6 text-rose-500" />;
    if (type?.includes('image')) return <ImageIcon className="h-6 w-6 text-blue-500" />;
    return <File className="h-6 w-6 text-muted-foreground" />;
  };

  const filteredFiles = files.filter(f =>
    f.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (f.category || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Nuvem Técnica</h1>
          <p className="text-sm text-muted-foreground">Manuais, firmwares e esquemas elétricos</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2"><Upload className="h-4 w-4" /> Upload de Arquivo</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Enviar arquivo</DialogTitle></DialogHeader>
            <div className="space-y-3 pt-2">
              <div className="space-y-1">
                <Label className="text-xs">Nome</Label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex: Manual LS 600d" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Categoria</Label>
                <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Arquivo</Label>
                <Input type="file" onChange={e => setForm({ ...form, file: e.target.files?.[0] || null, name: form.name || (e.target.files?.[0]?.name.replace(/\.[^.]+$/, '') ?? '') })} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setOpen(false)} disabled={uploading}>Cancelar</Button>
                <Button onClick={handleUpload} disabled={uploading}>
                  {uploading ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Enviando...</> : 'Enviar'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-card p-4 rounded-xl border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome ou categoria..." className="pl-9" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {loading ? (
          Array(8).fill(0).map((_, i) => <Card key={i} className="animate-pulse h-32" />)
        ) : filteredFiles.length > 0 ? (
          filteredFiles.map(file => (
            <Card key={file.id} className="group hover:border-primary/50 transition-all">
              <CardContent className="p-4 flex items-start gap-4">
                <div className="p-3 bg-muted rounded-xl">{getFileIcon(file.file_type)}</div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold truncate">{file.name}</h4>
                  <p className="text-[10px] text-muted-foreground uppercase font-bold mt-1">{file.category || 'Outros'}</p>
                  <p className="text-[10px] text-muted-foreground mt-2">{new Date(file.created_at).toLocaleDateString('pt-BR')}</p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2"><MoreVertical className="h-4 w-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem className="gap-2" onClick={() => handleDownload(file)}><Download className="h-4 w-4" /> Download</DropdownMenuItem>
                    <DropdownMenuItem className="gap-2 text-rose-600 focus:text-rose-600" onClick={() => handleDelete(file)}><Trash2 className="h-4 w-4" /> Excluir</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="col-span-full py-20 text-center space-y-4">
            <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center">
              <FolderOpen className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground">Nenhum arquivo encontrado.</p>
          </div>
        )}
      </div>
    </div>
  );
}
