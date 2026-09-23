import { useState, useMemo } from 'react';
import { Bell, Check, X, ShieldCheck, Settings, Filter } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { requestNotificationPermission } from '@/lib/firebase';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useNotifications, type AppNotification } from '@/contexts/NotificationsContext';

const TYPE_LABELS: Record<string, string> = {
  quote_status: 'Orçamento',
  new_client: 'Novo cliente',
  followup: 'Follow-up',
  followup_push: 'Follow-up',
  demonstration_7d: 'Demonstração',
  demonstration_3d: 'Demonstração',
  demonstration_due: 'Demonstração',
  demonstration_overdue: 'Demonstração',
  demonstration: 'Demonstração',
  financial: 'Financeiro',
  logistics: 'Logística',
  task: 'Tarefa',
  comment: 'Comentário',
  info: 'Info',
  test: 'Teste',
};

const typeColor: Record<string, string> = {
  quote_status: 'bg-blue-50 border-blue-200',
  new_client: 'bg-emerald-50 border-emerald-200',
  followup: 'bg-amber-50 border-amber-200',
  followup_push: 'bg-amber-50 border-amber-200',
  demonstration_7d: 'bg-violet-50 border-violet-200',
  demonstration_3d: 'bg-violet-50 border-violet-200',
  demonstration_due: 'bg-orange-50 border-orange-200',
  demonstration_overdue: 'bg-red-50 border-red-200',
  financial: 'bg-emerald-50 border-emerald-200',
  logistics: 'bg-sky-50 border-sky-200',
  task: 'bg-indigo-50 border-indigo-200',
  comment: 'bg-slate-50 border-slate-200',
  test: 'bg-muted',
  info: 'bg-muted',
};

export default function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { notifications, unreadCount, preferences, markRead, markAllRead, deleteOne } = useNotifications();
  const [open, setOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [isPushEnabled, setIsPushEnabled] = useState(
    typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted'
  );

  const handleEnablePush = async () => {
    try {
      await requestNotificationPermission();
      setIsPushEnabled(true);
      toast.success('Notificações push ativadas!');
    } catch (e: any) {
      toast.error(`[${e?.code || 'erro'}] ${e?.message || 'Falha ao ativar push'}`);
    }
  };

  const filtered = useMemo(() => {
    if (typeFilter === 'all') return notifications;
    if (typeFilter === 'unread') return notifications.filter(n => !n.is_read);
    return notifications.filter(n => (n.type || '').startsWith(typeFilter));
  }, [notifications, typeFilter]);

  const availableTypes = useMemo(() => {
    const set = new Set<string>();
    notifications.forEach(n => {
      const key = n.type?.startsWith('demonstration_') ? 'demonstration' : n.type;
      if (key) set.add(key);
    });
    return Array.from(set);
  }, [notifications]);

  // Quando o usuário desliga "Notificações internas", ocultamos o sino por completo.
  if (!user || !preferences.notifications_enabled) return null;

  const handleClick = (n: AppNotification) => {
    if (!n.is_read) markRead(n.id);
    setOpen(false);
    if (n.related_url) { navigate(n.related_url); return; }
    if (n.related_quote_id) { navigate(`/quotes?id=${n.related_quote_id}`); return; }
    if (n.related_client_id) { navigate(`/clients?id=${n.related_client_id}`); return; }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button className="relative p-2 rounded-full hover:bg-muted transition-colors" aria-label="Notificações">
          <Bell className="h-5 w-5 text-foreground" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-destructive rounded-full">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:w-96 p-0 flex flex-col" aria-describedby={undefined}>
        <SheetHeader className="p-4 pb-2 border-b border-border">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-lg font-bold">Notificações</SheetTitle>
            <button
              onClick={() => { setOpen(false); navigate('/configuracoes/notificacoes'); }}
              className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground"
              aria-label="Configurações de notificações"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </SheetHeader>

        <div className="px-4 py-2 flex items-center gap-2 border-b border-border">
          <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="unread">Não lidas</SelectItem>
              {availableTypes.map(t => (
                <SelectItem key={t} value={t}>
                  {TYPE_LABELS[t] || TYPE_LABELS[`${t}_due`] || t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {unreadCount > 0 && (
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={markAllRead}>
              <Check className="h-3 w-3 mr-1" /> Ler tudo
            </Button>
          )}
        </div>

        {!isPushEnabled && typeof window !== 'undefined' && 'Notification' in window && (
          <div className="px-4 py-2 border-b border-border">
            <Button variant="ghost" size="sm" onClick={handleEnablePush} className="h-7 text-xs gap-1 text-amber-600 hover:text-amber-700 hover:bg-amber-50 w-full justify-start">
              <ShieldCheck className="h-3 w-3" /> Ativar notificações push do navegador
            </Button>
          </div>
        )}

        <ScrollArea className="flex-1 px-4 py-3">
          <div className="space-y-2">
            {filtered.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">Sem notificações</p>
            )}
            {filtered.map(n => (
              <div
                key={n.id}
                className={`relative p-3 rounded-lg border transition-colors cursor-pointer ${
                  n.is_read ? 'bg-muted/30 border-border opacity-70' : (typeColor[n.type] || 'bg-accent/50 border-accent')
                }`}
                onClick={() => handleClick(n)}
              >
                <button
                  onClick={(e) => { e.stopPropagation(); deleteOne(n.id); }}
                  className="absolute top-2 right-2 p-1 rounded hover:bg-muted/80 transition-colors"
                  aria-label="Remover"
                >
                  <X className="h-3 w-3 text-muted-foreground" />
                </button>
                {!n.is_read && (
                  <span className="absolute top-3 left-2 h-2 w-2 rounded-full bg-primary" />
                )}
                <p className={`text-sm font-semibold pr-7 ${!n.is_read ? 'pl-4' : ''}`}>{n.title}</p>
                <p className={`text-xs text-muted-foreground mt-1 ${!n.is_read ? 'pl-4' : ''}`}>{n.message}</p>
                <p className={`text-[10px] text-muted-foreground mt-2 ${!n.is_read ? 'pl-4' : ''}`}>
                  {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}
                </p>
              </div>
            ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
