import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Send, Loader2, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const db = supabase as any;

interface QuoteChatProps {
  quoteId: string;
  quoteNumber: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ChatMessage {
  id: string;
  user_id: string;
  user_name: string;
  message: string;
  created_at: string;
}

export default function QuoteChat({ quoteId, quoteNumber, open, onOpenChange }: QuoteChatProps) {
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }, 50);
  };

  useEffect(() => {
    if (!open || !quoteId) return;
    setLoading(true);

    const fetchMessages = async () => {
      const { data } = await db
        .from('quote_messages')
        .select('*')
        .eq('quote_id', quoteId)
        .order('created_at', { ascending: true });
      setMessages(data || []);
      setLoading(false);
      scrollToBottom();
    };

    fetchMessages();

    let closed = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    try {
      channel = supabase.channel(`quote-chat-${quoteId}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      channel
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'quote_messages', filter: `quote_id=eq.${quoteId}` },
          (payload: any) => {
            if (closed) return;
            setMessages(prev => [...prev, payload.new as ChatMessage]);
            scrollToBottom();
          }
        )
        .subscribe();
    } catch (error) {
      console.warn('[QuoteChat] realtime não iniciado', error);
    }

    return () => {
      closed = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [open, quoteId]);

  const handleSend = async () => {
    if (!newMessage.trim() || !user) return;
    setSending(true);
    const userName = profile?.full_name || user.email || 'Usuário';

    const { error } = await db.from('quote_messages').insert({
      quote_id: quoteId,
      user_id: user.id,
      user_name: userName,
      message: newMessage.trim(),
    });

    if (!error) setNewMessage('');
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Chat — {quoteNumber}
          </DialogTitle>
        </DialogHeader>

        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto pr-1" style={{ maxHeight: '50vh' }}>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center text-muted-foreground py-8 text-sm">
              Nenhuma mensagem ainda. Inicie a conversa!
            </div>
          ) : (
            <div className="space-y-3 py-2">
              {messages.map(msg => {
                const isMe = msg.user_id === user?.id;
                return (
                  <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <span className="text-[11px] text-muted-foreground mb-0.5 px-1">{msg.user_name}</span>
                    <div className={`rounded-xl px-3 py-2 max-w-[80%] text-sm ${
                      isMe ? 'bg-primary text-primary-foreground' : 'bg-muted'
                    }`}>
                      {msg.message}
                    </div>
                    <span className="text-[10px] text-muted-foreground mt-0.5 px-1">
                      {format(new Date(msg.created_at), "dd/MM HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-2 border-t">
          <Input
            placeholder="Digite uma mensagem..."
            value={newMessage}
            onChange={e => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={sending}
            className="flex-1"
          />
          <Button size="icon" onClick={handleSend} disabled={sending || !newMessage.trim()}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
