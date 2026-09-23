import { useAppVersion } from '@/hooks/useAppVersion';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

export default function AppVersionBanner() {
  const { remote, hasUpdate, updateNow } = useAppVersion();
  if (!hasUpdate) return null;

  const forced = !!remote?.force_update;

  return (
    <div className={`fixed inset-x-0 top-0 z-[200] ${forced ? 'bg-destructive' : 'bg-primary'} text-white shadow-lg`}>
      <div className="max-w-5xl mx-auto px-4 py-3 flex flex-col sm:flex-row items-center gap-3 justify-between">
        <div className="flex-1 text-sm">
          <strong className="block">Nova atualização disponível</strong>
          <span className="opacity-90">
            {remote?.message || 'Uma nova versão do CRM MCI está disponível. Atualize para continuar usando a versão mais recente.'}
          </span>
        </div>
        <Button onClick={updateNow} variant="secondary" size="sm" className="shrink-0 gap-2">
          <RefreshCw className="h-4 w-4" /> Atualizar agora
        </Button>
      </div>
      {forced && (
        <div className="fixed inset-0 bg-black/60 z-[-1]" aria-hidden />
      )}
    </div>
  );
}
