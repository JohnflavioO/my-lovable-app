import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function PWAUpdatePrompt() {
  const [showUpdate, setShowUpdate] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    const host = window.location.hostname;
    const isPreview = window.self !== window.top
      || host.startsWith('id-preview--')
      || host.includes('-preview--')
      || host.includes('lovable.app')
      || host.endsWith('.lovableproject.com');
    if (isPreview) return;

    // Only run in standalone PWA mode (not in browser/iframe)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as any).standalone === true;
    
    if (!isStandalone || !('serviceWorker' in navigator)) return;

    const checkForUpdates = async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (!registration) return;

        // If there's already a waiting worker, show update
        if (registration.waiting) {
          setWaitingWorker(registration.waiting);
          setShowUpdate(true);
        }

        // Listen for new waiting workers
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              setWaitingWorker(newWorker);
              setShowUpdate(true);
            }
          });
        });

        // Check for updates every 60 seconds
        const interval = setInterval(() => {
          registration.update().catch(() => {});
        }, 60_000);

        return () => clearInterval(interval);
      } catch {
        // SW not available
      }
    };

    checkForUpdates();

    // Listen for controller change (new SW activated) → reload
    let refreshing = false;
    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  const handleUpdate = useCallback(() => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    }
  }, [waitingWorker]);

  if (!showUpdate) return null;

  return (
    <div className="fixed top-4 left-4 right-4 z-[100] md:left-auto md:right-6 md:max-w-sm animate-fade-in">
      <div className="bg-card border border-primary/30 rounded-2xl shadow-2xl p-4">
        <button
          onClick={() => setShowUpdate(false)}
          className="absolute top-3 right-3 p-1 rounded-full hover:bg-muted transition-colors"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>

        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <RefreshCw className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-sm text-foreground">Nova versão disponível</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Uma atualização do MCI CRM está pronta para ser aplicada.
            </p>
          </div>
        </div>

        <Button
          onClick={handleUpdate}
          className="w-full mt-3 bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
          size="sm"
        >
          <RefreshCw className="h-4 w-4" /> Atualizar agora
        </Button>
      </div>
    </div>
  );
}
