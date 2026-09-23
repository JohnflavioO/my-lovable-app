import { useState } from 'react';
import { Megaphone } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useChangelog } from '@/hooks/useChangelog';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function WhatsNewBell() {
  const { entries, hasUnseen, markSeen, currentVersion } = useChangelog();
  const [open, setOpen] = useState(false);

  const handleOpen = (v: boolean) => {
    setOpen(v);
    if (v) markSeen();
  };

  if (!currentVersion) return null;

  return (
    <>
      <button
        onClick={() => handleOpen(true)}
        className="relative p-2 rounded-full hover:bg-muted transition-colors"
        aria-label="Novidades"
        title="Novidades"
      >
        <Megaphone className="h-5 w-5 text-foreground" />
        {hasUnseen && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-emerald-500 rounded-full">
            !
          </span>
        )}
      </button>

      <Dialog open={open} onOpenChange={handleOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-emerald-500" />
              Novidades do MCI CRM
            </DialogTitle>
            <DialogDescription>
              Veja as últimas atualizações e melhorias do sistema.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="space-y-4">
              {entries.map((e, i) => (
                <div key={e.id} className="border-l-2 border-emerald-500 pl-4 pb-2">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <Badge variant="default" className="bg-emerald-500 hover:bg-emerald-600">v{e.version}</Badge>
                    {i === 0 && <Badge variant="outline" className="text-xs">Mais recente</Badge>}
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(e.release_date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                    </span>
                  </div>
                  <h3 className="font-semibold text-sm">{e.title}</h3>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-1">{e.description}</p>
                </div>
              ))}
              {entries.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhuma versão registrada ainda.</p>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
