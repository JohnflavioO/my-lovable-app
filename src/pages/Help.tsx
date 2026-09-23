import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, PlayCircle, Search, HelpCircle, RefreshCw, Upload, ImageOff } from 'lucide-react';
import AppLayout from '@/components/AppLayout';

type VideoType = 'loom' | 'youtube' | 'vimeo' | 'unknown';

interface HelpVideo {
  id: string;
  title: string;
  description: string | null;
  category: string;
  loom_url: string;
  sort_order: number;
  created_at: string;
  video_type: VideoType | null;
  video_id: string | null;
  thumbnail_url: string | null;
  custom_thumbnail_url: string | null;
}

const CATEGORIES = [
  'Geral', 'Orçamentos', 'Clientes', 'Financeiro',
  'Logística', 'Suporte Técnico', 'Métricas', 'Configurações',
];

// ---------- Provider detection ----------
function detectVideo(url: string): { type: VideoType; id: string | null } {
  if (!url) return { type: 'unknown', id: null };
  const u = url.trim();
  let m = u.match(/loom\.com\/(?:share|embed)\/([a-zA-Z0-9]+)/);
  if (m) return { type: 'loom', id: m[1] };
  m = u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{6,})/);
  if (m) return { type: 'youtube', id: m[1] };
  m = u.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (m) return { type: 'vimeo', id: m[1] };
  return { type: 'unknown', id: null };
}

function embedUrl(type: VideoType, id: string | null): string | null {
  if (!id) return null;
  if (type === 'loom') return `https://www.loom.com/embed/${id}`;
  if (type === 'youtube') return `https://www.youtube.com/embed/${id}`;
  if (type === 'vimeo') return `https://player.vimeo.com/video/${id}`;
  return null;
}

// Try multiple thumbnail URLs (fallbacks per provider)
function thumbCandidates(type: VideoType, id: string | null): string[] {
  if (!id) return [];
  if (type === 'loom') return [
    `https://cdn.loom.com/sessions/thumbnails/${id}-with-play.gif`,
    `https://cdn.loom.com/sessions/thumbnails/${id}-with-play.jpg`,
    `https://cdn.loom.com/sessions/thumbnails/${id}-00001.jpg`,
  ];
  if (type === 'youtube') return [
    `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
    `https://i.ytimg.com/vi/${id}/default.jpg`,
  ];
  if (type === 'vimeo') return []; // requires oEmbed
  return [];
}

// Fetch thumbnail via oEmbed (Loom/Vimeo). YouTube uses static URL.
async function fetchAutoThumbnail(url: string, type: VideoType, id: string | null): Promise<string | null> {
  try {
    if (type === 'youtube' && id) {
      return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    }
    if (type === 'loom') {
      const r = await fetch(`https://www.loom.com/v1/oembed?format=json&url=${encodeURIComponent(url)}`);
      if (r.ok) {
        const j = await r.json();
        if (j?.thumbnail_url) return j.thumbnail_url as string;
      }
      if (id) return `https://cdn.loom.com/sessions/thumbnails/${id}-with-play.gif`;
    }
    if (type === 'vimeo') {
      const r = await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`);
      if (r.ok) {
        const j = await r.json();
        if (j?.thumbnail_url) return j.thumbnail_url as string;
      }
    }
  } catch (e) {
    console.warn('oEmbed thumb fetch failed', e);
  }
  return null;
}

export default function Help() {
  const { isAdmin, isGestor } = useAuth();
  const canManage = isAdmin || isGestor;
  const [videos, setVideos] = useState<HelpVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<HelpVideo | null>(null);
  const [playing, setPlaying] = useState<HelpVideo | null>(null);
  const [uploading, setUploading] = useState(false);
  const [refreshingThumb, setRefreshingThumb] = useState(false);

  const [form, setForm] = useState({
    title: '',
    description: '',
    category: 'Geral',
    loom_url: '',
    sort_order: 0,
    custom_thumbnail_url: '' as string | null | '',
  });

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('help_videos' as any)
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });
    if (error) toast.error('Erro ao carregar vídeos');
    else setVideos((data || []) as unknown as HelpVideo[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setForm({ title: '', description: '', category: 'Geral', loom_url: '', sort_order: 0, custom_thumbnail_url: '' });
    setEditing(null);
  };

  const openCreate = () => { resetForm(); setOpenForm(true); };
  const openEdit = (v: HelpVideo) => {
    setEditing(v);
    setForm({
      title: v.title,
      description: v.description || '',
      category: v.category,
      loom_url: v.loom_url,
      sort_order: v.sort_order,
      custom_thumbnail_url: v.custom_thumbnail_url || '',
    });
    setOpenForm(true);
  };

  const handleUploadThumb = async (file: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from('help-thumbnails').upload(path, file, {
        cacheControl: '3600', upsert: false,
      });
      if (error) throw error;
      const { data } = supabase.storage.from('help-thumbnails').getPublicUrl(path);
      setForm(f => ({ ...f, custom_thumbnail_url: data.publicUrl }));
      toast.success('Miniatura enviada');
    } catch (e: any) {
      toast.error('Erro no upload: ' + (e?.message || e));
    } finally {
      setUploading(false);
    }
  };

  const refreshThumbnail = async () => {
    if (!form.loom_url.trim()) {
      toast.error('Informe o link do vídeo primeiro');
      return;
    }
    setRefreshingThumb(true);
    const { type, id } = detectVideo(form.loom_url);
    const thumb = await fetchAutoThumbnail(form.loom_url, type, id);
    setRefreshingThumb(false);
    if (!thumb) {
      toast.error('Não foi possível capturar a miniatura automaticamente');
      return;
    }
    if (editing) {
      const { error } = await supabase.from('help_videos' as any)
        .update({ thumbnail_url: thumb, video_type: type, video_id: id })
        .eq('id', editing.id);
      if (error) return toast.error('Erro ao atualizar');
      toast.success('Miniatura atualizada');
      load();
    } else {
      toast.success('Miniatura capturada — será salva ao adicionar');
    }
  };

  const save = async () => {
    if (!form.title.trim() || !form.loom_url.trim()) {
      toast.error('Título e link do vídeo são obrigatórios');
      return;
    }
    const { type, id } = detectVideo(form.loom_url);
    if (type === 'unknown' || !id) {
      toast.error('Link inválido. Use Loom, YouTube ou Vimeo.');
      return;
    }

    const auto = await fetchAutoThumbnail(form.loom_url, type, id);

    const payload: any = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      category: form.category,
      loom_url: form.loom_url.trim(),
      sort_order: Number(form.sort_order) || 0,
      video_type: type,
      video_id: id,
      thumbnail_url: auto,
      custom_thumbnail_url: form.custom_thumbnail_url || null,
    };

    if (editing) {
      const { error } = await supabase.from('help_videos' as any).update(payload).eq('id', editing.id);
      if (error) return toast.error('Erro ao atualizar');
      toast.success('Vídeo atualizado');
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('help_videos' as any).insert({ ...payload, created_by: user?.id });
      if (error) return toast.error('Erro ao criar');
      toast.success('Vídeo adicionado');
    }
    setOpenForm(false);
    resetForm();
    load();
  };

  const remove = async (v: HelpVideo) => {
    if (!confirm(`Remover "${v.title}"?`)) return;
    const { error } = await supabase.from('help_videos' as any).delete().eq('id', v.id);
    if (error) return toast.error('Erro ao remover');
    toast.success('Vídeo removido');
    load();
  };

  const filtered = videos.filter(v => {
    const matchesSearch = !search ||
      v.title.toLowerCase().includes(search.toLowerCase()) ||
      (v.description || '').toLowerCase().includes(search.toLowerCase());
    const matchesCat = categoryFilter === 'all' || v.category === categoryFilter;
    return matchesSearch && matchesCat;
  });

  return (
    <AppLayout>
    <div className="container mx-auto p-4 md:p-6 max-w-7xl">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <HelpCircle className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Ajuda</h1>
            <p className="text-sm text-muted-foreground">Tutoriais e passo a passo de uso do CRM</p>
          </div>
        </div>
        {canManage && (
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" /> Novo tutorial
          </Button>
        )}
      </div>

      <div className="flex flex-col md:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar tutoriais..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="md:w-56"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <p className="text-center text-muted-foreground py-12">Carregando...</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <HelpCircle className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p>Nenhum tutorial encontrado.</p>
            {canManage && (
              <Button variant="outline" className="mt-4 gap-2" onClick={openCreate}>
                <Plus className="h-4 w-4" /> Adicionar o primeiro
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(v => <VideoCard key={v.id} v={v} canManage={canManage} onPlay={() => setPlaying(v)} onEdit={() => openEdit(v)} onRemove={() => remove(v)} />)}
        </div>
      )}

      {/* Player */}
      <Dialog open={!!playing} onOpenChange={(o) => !o && setPlaying(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>{playing?.title}</DialogTitle></DialogHeader>
          {playing && (() => {
            const { type, id } = detectVideo(playing.loom_url);
            const src = embedUrl(type, id);
            return src ? (
              <div className="aspect-video w-full">
                <iframe src={src} allowFullScreen className="w-full h-full rounded-md" />
              </div>
            ) : null;
          })()}
          {playing?.description && (
            <p className="text-sm text-muted-foreground">{playing.description}</p>
          )}
        </DialogContent>
      </Dialog>

      {/* Form */}
      <Dialog open={openForm} onOpenChange={(o) => { setOpenForm(o); if (!o) resetForm(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar tutorial' : 'Novo tutorial'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Título *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Categoria</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Ordem</Label>
                <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
              </div>
            </div>
            <div>
              <Label>Link do vídeo *</Label>
              <Input
                placeholder="https://www.loom.com/share/... | youtube.com/... | vimeo.com/..."
                value={form.loom_url}
                onChange={(e) => setForm({ ...form, loom_url: e.target.value })}
              />
              <p className="text-xs text-muted-foreground mt-1">Suporta Loom, YouTube e Vimeo.</p>
            </div>

            <div className="border rounded-md p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="m-0">Miniatura</Label>
                {editing && (
                  <Button type="button" size="sm" variant="outline" className="gap-1" onClick={refreshThumbnail} disabled={refreshingThumb}>
                    <RefreshCw className={`h-3 w-3 ${refreshingThumb ? 'animate-spin' : ''}`} /> Atualizar Miniatura
                  </Button>
                )}
              </div>
              {form.custom_thumbnail_url ? (
                <div className="relative">
                  <img src={form.custom_thumbnail_url} alt="Capa" className="w-full aspect-video object-cover rounded" />
                  <Button type="button" size="sm" variant="destructive" className="absolute top-2 right-2"
                    onClick={() => setForm(f => ({ ...f, custom_thumbnail_url: '' }))}>
                    Remover
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">A miniatura será obtida automaticamente do vídeo. Você pode enviar uma capa personalizada abaixo.</p>
              )}
              <div>
                <input
                  id="thumb-upload" type="file" accept="image/*" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadThumb(f); e.currentTarget.value = ''; }}
                />
                <Button type="button" variant="outline" size="sm" className="gap-1" disabled={uploading}
                  onClick={() => document.getElementById('thumb-upload')?.click()}>
                  <Upload className="h-3 w-3" /> {uploading ? 'Enviando...' : 'Upload capa personalizada'}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenForm(false)}>Cancelar</Button>
            <Button onClick={save}>{editing ? 'Salvar' : 'Adicionar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </AppLayout>
  );
}

// ============== Video card with thumbnail fallback ==============
function VideoCard({ v, canManage, onPlay, onEdit, onRemove }: {
  v: HelpVideo; canManage: boolean;
  onPlay: () => void; onEdit: () => void; onRemove: () => void;
}) {
  const { type, id } = detectVideo(v.loom_url);
  const candidates: string[] = [];
  if (v.custom_thumbnail_url) candidates.push(v.custom_thumbnail_url);
  if (v.thumbnail_url) candidates.push(v.thumbnail_url);
  candidates.push(...thumbCandidates(type, id));

  const [idx, setIdx] = useState(0);
  const [failed, setFailed] = useState(false);
  const current = candidates[idx];

  return (
    <Card className="overflow-hidden flex flex-col hover:shadow-lg transition-shadow">
      <button
        onClick={onPlay}
        className="relative aspect-video bg-gradient-to-br from-muted to-muted/60 flex items-center justify-center group overflow-hidden"
      >
        {current && !failed ? (
          <img
            src={current}
            alt={v.title}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover"
            onError={() => {
              if (idx + 1 < candidates.length) setIdx(idx + 1);
              else setFailed(true);
            }}
          />
        ) : failed ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground gap-1 text-xs">
            <ImageOff className="h-6 w-6" />
            Miniatura indisponível
          </div>
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
        <div className="absolute inset-0 flex items-center justify-center transition-transform group-hover:scale-110">
          <div className="h-14 w-14 rounded-full bg-white/90 backdrop-blur flex items-center justify-center shadow-lg">
            <PlayCircle className="h-10 w-10 text-primary" />
          </div>
        </div>
      </button>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base leading-snug line-clamp-2">{v.title}</CardTitle>
          <Badge variant="secondary" className="shrink-0 text-[10px]">{v.category}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-3 pt-0">
        {v.description && <p className="text-sm text-muted-foreground line-clamp-3">{v.description}</p>}
        <div className="mt-auto flex items-center gap-2">
          <Button size="sm" variant="default" className="flex-1 gap-2" onClick={onPlay}>
            <PlayCircle className="h-4 w-4" /> Assistir
          </Button>
          {canManage && (
            <>
              <Button size="sm" variant="outline" onClick={onEdit}><Pencil className="h-4 w-4" /></Button>
              <Button size="sm" variant="outline" onClick={onRemove}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
