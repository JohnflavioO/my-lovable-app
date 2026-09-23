import { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { useChangelog } from '@/hooks/useChangelog';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Info, Plus, Trash2, Sparkles } from 'lucide-react';

const ENV_LABEL: Record<string, string> = {
  producao: 'Produção',
  homologacao: 'Homologação',
};

export default function About() {
  const { isAdmin } = useAuth();
  const { entries, latest, currentVersion, refetch } = useChangelog();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    version: '',
    title: '',
    description: '',
    environment: 'producao',
    release_date: format(new Date(), 'yyyy-MM-dd'),
  });

  const handleSave = async () => {
    if (!form.version.trim() || !form.title.trim() || !form.description.trim()) {
      toast.error('Preencha versão, título e descrição.');
      return;
    }
    setSaving(true);
    const { error } = await (supabase as any).from('app_changelog').insert({
      version: form.version.trim(),
      title: form.title.trim(),
      description: form.description.trim(),
      environment: form.environment,
      release_date: form.release_date,
    });
    setSaving(false);
    if (error) {
      toast.error('Erro ao publicar versão: ' + error.message);
      return;
    }
    toast.success('Nova versão publicada!');
    setOpen(false);
    setForm({ version: '', title: '', description: '', environment: 'producao', release_date: format(new Date(), 'yyyy-MM-dd') });
    refetch();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir esta versão do histórico?')) return;
    const { error } = await (supabase as any).from('app_changelog').delete().eq('id', id);
    if (error) { toast.error('Erro: ' + error.message); return; }
    toast.success('Versão removida');
    refetch();
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Info className="h-6 w-6" /> Sobre o Sistema
            </h1>
            <p className="text-sm text-muted-foreground">Informações de versão e histórico de atualizações.</p>
          </div>
          {isAdmin && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2"><Plus className="h-4 w-4" /> Nova versão</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Publicar nova versão</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Versão *</Label>
                      <Input placeholder="ex: 2.8.4" value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} />
                    </div>
                    <div>
                      <Label>Data</Label>
                      <Input type="date" value={form.release_date} onChange={(e) => setForm({ ...form, release_date: e.target.value })} />
                    </div>
                  </div>
                  <div>
                    <Label>Ambiente</Label>
                    <Select value={form.environment} onValueChange={(v) => setForm({ ...form, environment: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="producao">Produção</SelectItem>
                        <SelectItem value="homologacao">Homologação</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Título *</Label>
                    <Input placeholder="ex: Controle de versão e tutoriais" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                  </div>
                  <div>
                    <Label>Descrição / Novidades *</Label>
                    <Textarea rows={6} placeholder="Liste as novidades e melhorias desta versão" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                  <Button onClick={handleSave} disabled={saving}>{saving ? 'Publicando...' : 'Publicar'}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Informações do Sistema</CardTitle>
            <CardDescription>Dados gerais da aplicação.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground text-xs uppercase">Nome do sistema</p>
              <p className="font-semibold">MCI CRM</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs uppercase">Versão atual</p>
              <p className="font-semibold">{currentVersion ? `v${currentVersion}` : '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs uppercase">Última atualização</p>
              <p className="font-semibold">
                {latest ? format(new Date(latest.release_date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : '—'}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs uppercase">Ambiente</p>
              <p className="font-semibold">{latest ? ENV_LABEL[latest.environment] || latest.environment : '—'}</p>
            </div>
            <div className="md:col-span-2">
              <p className="text-muted-foreground text-xs uppercase">Desenvolvedor</p>
              <p className="font-semibold">Studio On Design</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-emerald-500" /> Histórico de Versões
            </CardTitle>
            <CardDescription>Todas as atualizações publicadas.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {entries.map((e, i) => (
                <div key={e.id} className="border-l-2 border-emerald-500 pl-4 pb-2 relative group">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <Badge className="bg-emerald-500 hover:bg-emerald-600">v{e.version}</Badge>
                    {i === 0 && <Badge variant="outline" className="text-xs">Atual</Badge>}
                    <Badge variant="secondary" className="text-xs">{ENV_LABEL[e.environment] || e.environment}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(e.release_date), "dd/MM/yyyy", { locale: ptBR })}
                    </span>
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto h-7 px-2 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleDelete(e.id)}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    )}
                  </div>
                  <h3 className="font-semibold text-sm">{e.title}</h3>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-1">{e.description}</p>
                </div>
              ))}
              {entries.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhuma versão registrada.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
