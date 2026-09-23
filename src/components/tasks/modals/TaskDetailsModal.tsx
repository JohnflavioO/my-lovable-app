import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { 
  Calendar, User, Tag, MessageSquare, CheckSquare, 
  History, Paperclip, Phone, MoreHorizontal, Trash2,
  Clock, Share2, Send, Plus, X, ExternalLink, Copy, Archive,
  RefreshCw, MessageCircle
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

const db = supabase as any;

interface TaskDetailsModalProps {
  task: any | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

export default function TaskDetailsModal({ task, isOpen, onClose, onUpdate }: TaskDetailsModalProps) {
  const isMobile = useIsMobile();
  const [comment, setComment] = useState('');
  const [comments, setComments] = useState<any[]>([]);
  const [checklist, setChecklist] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('checklist');

  useEffect(() => {
    if (task && isOpen) {
      loadDetails();
    }
  }, [task, isOpen]);

  const loadDetails = async () => {
    if (!task) return;
    
    const [{ data: c }, { data: ch }, { data: act }] = await Promise.all([
      db.from('task_comments').select('*').eq('task_id', task.id).order('created_at', { ascending: false }),
      db.from('task_checklists').select('*').eq('task_id', task.id).order('position', { ascending: true }),
      db.from('task_activities').select('*').eq('task_id', task.id).order('created_at', { ascending: false })
    ]);
    
    setComments(c || []);
    setChecklist(ch || []);
    setActivities(act || []);
  };

  const addActivity = async (type: string, oldVal?: string, newVal?: string) => {
    if (!task) return;
    await db.from('task_activities').insert({
      task_id: task.id,
      user_id: (await supabase.auth.getUser()).data.user?.id,
      activity_type: type,
      old_value: oldVal,
      new_value: newVal
    });
  };

  const addComment = async () => {
    if (!comment.trim() || !task) return;
    setLoading(true);
    const user = (await supabase.auth.getUser()).data.user;
    const { error } = await db.from('task_comments').insert({
      task_id: task.id,
      content: comment,
      user_id: user?.id
    });

    if (error) {
      toast.error('Erro ao adicionar comentário');
    } else {
      setComment('');
      await addActivity('comment', undefined, comment.substring(0, 50));
      loadDetails();
      toast.success('Comentário enviado');
    }
    setLoading(false);
  };

  const addChecklistItem = async () => {
    if (!newChecklistItem.trim() || !task) return;
    const { error } = await db.from('task_checklists').insert({
      task_id: task.id,
      content: newChecklistItem,
      position: checklist.length,
      is_completed: false
    });

    if (error) {
      toast.error('Erro ao adicionar item');
    } else {
      await addActivity('checklist_add', undefined, newChecklistItem);
      setNewChecklistItem('');
      loadDetails();
    }
  };

  const toggleChecklistItem = async (item: any) => {
    const { error } = await db.from('task_checklists').update({
      is_completed: !item.is_completed
    }).eq('id', item.id);

    if (!error) {
      await addActivity('checklist_toggle', item.is_completed ? 'completed' : 'pending', !item.is_completed ? 'completed' : 'pending');
      loadDetails();
    }
  };

  const removeChecklistItem = async (id: string, content: string) => {
    const { error } = await db.from('task_checklists').delete().eq('id', id);
    if (!error) {
      await addActivity('checklist_remove', content, undefined);
      loadDetails();
    }
  };

  const deletetask = async () => {
    if (!task || !confirm('Deseja realmente excluir esta tarefa?')) return;
    const { error } = await db.from('tasks').delete().eq('id', task.id);
    if (error) {
      toast.error('Erro ao excluir tarefa');
    } else {
      toast.success('Tarefa excluída');
      onUpdate();
      onClose();
    }
  };

  if (!task) return null;

  const priorityColors: Record<string, string> = {
    alta: 'bg-red-500/10 text-red-600 border-red-200 shadow-sm',
    média: 'bg-yellow-500/10 text-yellow-600 border-yellow-200 shadow-sm',
    baixa: 'bg-emerald-500/10 text-emerald-600 border-emerald-200 shadow-sm',
  };

  const completedItems = checklist.filter(i => i.is_completed).length;
  const totalItems = checklist.length;
  const progress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent 
        side={isMobile ? "bottom" : "right"} 
        className={cn(
          "p-0 flex flex-col border-none shadow-2xl transition-all duration-500 sm:max-w-[650px] w-full",
          isMobile ? "h-[90vh] rounded-t-3xl" : "h-screen"
        )}
      >
        {/* Modern Header */}
        <div className="p-6 pb-4 border-b bg-gradient-to-r from-background to-muted/20">
          <div className="flex justify-between items-center mb-6">
            <div className="flex gap-2 items-center">
              <Badge variant="outline" className={cn("px-3 py-1 font-semibold tracking-wide uppercase text-[10px]", priorityColors[task.priority] || '')}>
                {task.priority}
              </Badge>
              <Badge variant="secondary" className="px-3 py-1 text-[10px] font-medium bg-muted text-muted-foreground border-none">
                {task.task_type || 'Geral'}
              </Badge>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-muted" title="Arquivar">
                <Archive className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-muted" title="Duplicar">
                <Copy className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={deletetask} className="h-8 w-8 rounded-full text-destructive hover:bg-destructive/10" title="Excluir">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          <SheetTitle className="text-2xl font-bold leading-tight mb-6 group flex items-start gap-3">
             <div className="mt-1.5 p-1.5 rounded-lg bg-primary/10 text-primary">
                <CheckSquare className="h-5 w-5" />
             </div>
             <span className="flex-1">{task.title}</span>
          </SheetTitle>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-2">
            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-1.5">
                <Calendar className="h-3 w-3" /> Prazo
              </p>
              <p className="text-sm font-medium">
                {task.due_date ? format(new Date(task.due_date), "dd/MM/yyyy", { locale: ptBR }) : 'Definir'}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-1.5">
                <User className="h-3 w-3" /> Responsável
              </p>
              <div className="flex items-center gap-2">
                <div className="h-5 w-5 rounded-full bg-accent flex items-center justify-center text-[10px] font-bold">
                  {task.user_id?.substring(0, 1).toUpperCase() || 'M'}
                </div>
                <span className="text-sm font-medium">Equipe MCI</span>
              </div>
            </div>
            <div className="space-y-1 col-span-2">
              <p className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-1.5">
                <RefreshCw className="h-3 w-3" /> Progresso ({progress}%)
              </p>
              <Progress value={progress} className="h-2" />
            </div>
          </div>
        </div>

        <ScrollArea className="flex-1 px-6 pt-6">
          <div className="space-y-8 pb-8">
            {/* Description */}
            <div className="space-y-3">
              <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <MoreHorizontal className="h-3.5 w-3.5" /> Descrição da Tarefa
              </Label>
              <div className="text-sm bg-muted/30 p-4 rounded-xl border border-muted/50 leading-relaxed min-h-[100px] hover:border-accent/30 transition-colors">
                {task.description || <span className="italic text-muted-foreground">Adicione uma descrição detalhada para esta tarefa...</span>}
              </div>
            </div>

            {/* Context Cards */}
            {(task.client || task.quote) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {task.client && (
                  <div className="group border bg-card hover:bg-muted/20 rounded-xl p-4 transition-all duration-300">
                    <div className="flex justify-between items-start mb-2">
                      <p className="text-[10px] font-bold uppercase text-muted-foreground">Cliente</p>
                      <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity">
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                        <User className="h-4 w-4" />
                      </div>
                      <p className="text-sm font-semibold">{task.client.name}</p>
                    </div>
                  </div>
                )}
                {task.quote && (
                  <div className="group border bg-card hover:bg-muted/20 rounded-xl p-4 transition-all duration-300">
                    <div className="flex justify-between items-start mb-2">
                      <p className="text-[10px] font-bold uppercase text-muted-foreground">Orçamento</p>
                      <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity">
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-accent/10 text-accent flex items-center justify-center">
                          <Tag className="h-4 w-4" />
                        </div>
                        <p className="text-sm font-semibold">#{task.quote.quote_number}</p>
                      </div>
                      {task.quote.total && (
                        <p className="text-sm font-bold text-emerald-600">
                          R$ {task.quote.total.toLocaleString('pt-BR')}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Content Tabs */}
            <Tabs defaultValue="checklist" className="w-full" onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-4 bg-muted/50 p-1 rounded-xl h-11 mb-8">
                <TabsTrigger value="checklist" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all gap-2 text-xs">
                  <CheckSquare className="h-3.5 w-3.5" /> 
                  <span className="hidden sm:inline">Checklist</span>
                  {totalItems > 0 && <Badge variant="secondary" className="ml-1 h-4 w-4 p-0 flex items-center justify-center text-[10px]">{totalItems}</Badge>}
                </TabsTrigger>
                <TabsTrigger value="comments" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all gap-2 text-xs">
                  <MessageSquare className="h-3.5 w-3.5" /> 
                  <span className="hidden sm:inline">Chat</span>
                  {comments.length > 0 && <Badge variant="secondary" className="ml-1 h-4 w-4 p-0 flex items-center justify-center text-[10px]">{comments.length}</Badge>}
                </TabsTrigger>
                <TabsTrigger value="attachments" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all gap-2 text-xs">
                  <Paperclip className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Anexos</span>
                </TabsTrigger>
                <TabsTrigger value="history" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all gap-2 text-xs">
                  <History className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Histórico</span>
                </TabsTrigger>
              </TabsList>

              {/* Checklist Tab */}
              <TabsContent value="checklist" className="space-y-6 focus-visible:outline-none animate-in fade-in duration-300">
                <div className="space-y-3">
                  {checklist.length === 0 && (
                    <div className="text-center py-10 bg-muted/20 rounded-2xl border-2 border-dashed border-muted/50">
                      <CheckSquare className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                      <p className="text-sm text-muted-foreground">Nenhum item no checklist ainda.</p>
                      <p className="text-xs text-muted-foreground/60 mt-1">Divida sua tarefa em etapas menores.</p>
                    </div>
                  )}
                  {checklist.map(item => (
                    <div key={item.id} className="flex items-center gap-3 p-3 hover:bg-muted/50 rounded-xl group transition-all border border-transparent hover:border-muted/50">
                      <Checkbox 
                        id={`item-${item.id}`} 
                        checked={item.is_completed} 
                        onCheckedChange={() => toggleChecklistItem(item)}
                        className="h-5 w-5 rounded-md data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500"
                      />
                      <label 
                        htmlFor={`item-${item.id}`}
                        className={cn(
                          "text-sm flex-1 font-medium cursor-pointer transition-all",
                          item.is_completed ? 'line-through text-muted-foreground' : 'text-foreground'
                        )}
                      >
                        {item.content}
                      </label>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                        onClick={() => removeChecklistItem(item.id, item.content)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 p-1.5 bg-muted/30 rounded-xl border focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                  <Input 
                    placeholder="Adicionar nova etapa..." 
                    className="h-10 text-sm border-none bg-transparent shadow-none focus-visible:ring-0" 
                    value={newChecklistItem}
                    onChange={e => setNewChecklistItem(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addChecklistItem()}
                  />
                  <Button size="sm" onClick={addChecklistItem} className="h-10 px-4 rounded-lg bg-primary hover:bg-primary/90">
                    <Plus className="h-4 w-4 mr-1" /> Adicionar
                  </Button>
                </div>
              </TabsContent>

              {/* Chat Tab */}
              <TabsContent value="comments" className="space-y-6 focus-visible:outline-none animate-in fade-in duration-300">
                <div className="flex flex-col gap-4">
                  <div className="flex gap-3 items-start">
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 space-y-3">
                      <div className="bg-muted/30 p-1.5 rounded-2xl border focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                        <Textarea 
                          placeholder="Escreva um comentário operacional..." 
                          className="min-h-[100px] text-sm border-none bg-transparent shadow-none focus-visible:ring-0 resize-none leading-relaxed" 
                          value={comment}
                          onChange={e => setComment(e.target.value)}
                        />
                      </div>
                      <div className="flex justify-end">
                        <Button 
                          size="sm" 
                          onClick={addComment} 
                          disabled={loading || !comment.trim()} 
                          className="gap-2 px-6 rounded-full bg-primary"
                        >
                          <Send className="h-4 w-4" /> Comentar
                        </Button>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-6 pt-4">
                    {comments.length === 0 && (
                      <div className="text-center py-10 opacity-40 italic">
                        <MessageCircle className="h-10 w-10 mx-auto mb-2" />
                        <p className="text-sm">Nenhum comentário ainda.</p>
                      </div>
                    )}
                    {comments.map((c, idx) => (
                      <div key={c.id} className="flex gap-3 group animate-in slide-in-from-bottom-2 duration-300" style={{ animationDelay: `${idx * 50}ms` }}>
                        <div className="h-9 w-9 rounded-full bg-accent border-2 border-background shadow-sm text-[10px] flex items-center justify-center shrink-0 font-bold">
                          {c.user_id?.substring(0, 1).toUpperCase() || 'U'}
                        </div>
                        <div className="flex-1 space-y-1.5 min-w-0">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-foreground">Equipe MCI</span>
                            <span className="text-[10px] text-muted-foreground">{format(new Date(c.created_at), 'dd MMM, HH:mm', { locale: ptBR })}</span>
                          </div>
                          <div className="bg-muted/40 p-3.5 rounded-2xl rounded-tl-none text-sm leading-relaxed border border-muted/50 shadow-sm group-hover:bg-muted/60 transition-colors">
                            {c.content}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>

              {/* Attachments Tab */}
              <TabsContent value="attachments" className="py-16 text-center focus-visible:outline-none animate-in fade-in duration-300">
                <div className="max-w-[280px] mx-auto space-y-4">
                  <div className="h-16 w-16 bg-muted/30 rounded-full flex items-center justify-center mx-auto border-2 border-dashed border-muted">
                    <Paperclip className="h-7 w-7 text-muted-foreground/40" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Sem arquivos anexados</p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">Arraste documentos ou imagens para cá para vincular a esta tarefa.</p>
                  </div>
                  <Button variant="outline" size="sm" className="rounded-full px-6">Escolher arquivos</Button>
                </div>
              </TabsContent>

              {/* Timeline/History Tab */}
              <TabsContent value="history" className="space-y-6 focus-visible:outline-none animate-in fade-in duration-300">
                <div className="relative pl-7 space-y-8 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[1.5px] before:bg-muted/50">
                  {activities.length === 0 && (
                    <div className="relative flex items-center gap-4 py-1 animate-in slide-in-from-left duration-300">
                      <div className="absolute -left-[20px] h-3.5 w-3.5 rounded-full bg-primary ring-4 ring-background shadow-sm" />
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-tight">Tarefa Criada</p>
                        <p className="text-xs text-muted-foreground">{format(new Date(task.created_at), "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}</p>
                      </div>
                    </div>
                  )}
                  
                  {activities.map((act, idx) => (
                    <div key={act.id} className="relative flex flex-col gap-1 animate-in slide-in-from-left duration-300" style={{ animationDelay: `${idx * 30}ms` }}>
                      <div className="absolute -left-[20px] h-3.5 w-3.5 rounded-full bg-accent ring-4 ring-background shadow-sm" />
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] font-bold uppercase tracking-tight">Equipe <span className="text-primary">{act.activity_type}</span></p>
                        <p className="text-[10px] text-muted-foreground">{format(new Date(act.created_at), 'HH:mm', { locale: ptBR })}</p>
                      </div>
                      {act.new_value && (
                        <div className="bg-muted/30 p-2.5 rounded-lg border text-xs text-muted-foreground italic leading-snug">
                          "{act.new_value}"
                        </div>
                      )}
                      <p className="text-[10px] text-muted-foreground mt-0.5">{format(new Date(act.created_at), 'dd/MM/yyyy', { locale: ptBR })}</p>
                    </div>
                  ))}

                  <div className="relative flex items-center gap-4 py-1">
                    <div className="absolute -left-[20px] h-3.5 w-3.5 rounded-full bg-muted ring-4 ring-background shadow-sm" />
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-tight text-muted-foreground/60">Fim do Histórico</p>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </ScrollArea>

        {/* Action-Oriented Footer */}
        <SheetFooter className="p-4 border-t bg-muted/10 sm:flex-row flex-col gap-2">
          <div className="flex-1 flex gap-2">
             <Button variant="outline" className="gap-2 flex-1 rounded-xl h-11 border-muted hover:bg-muted/50 transition-all font-medium" onClick={() => {/* Quick Call */}}>
                <Phone className="h-4 w-4" /> 
                <span className="hidden sm:inline">Ligar</span>
             </Button>
             <Button variant="outline" className="gap-2 flex-1 rounded-xl h-11 border-emerald-200 text-emerald-600 hover:bg-emerald-50 transition-all font-medium" onClick={() => {/* Open WhatsApp */}}>
                <MessageCircle className="h-4 w-4" /> 
                <span className="hidden sm:inline">WhatsApp</span>
             </Button>
          </div>
          <Button className="h-11 px-8 rounded-xl font-bold bg-primary hover:bg-primary/90 transition-all shadow-md active:scale-95" onClick={onClose}>
            Concluir Visualização
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}