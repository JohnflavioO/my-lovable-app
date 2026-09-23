import { useState, useEffect } from 'react';
import { Download, X, Share } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const isPreview = window.location.hostname.includes('lovable.app') || 
                     window.location.hostname.includes('lovableproject.com');
    if (isPreview) return;

    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as any).standalone === true;
    setIsStandalone(standalone);

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setIsIOS(ios);

    let dismissed: string | null = null;
    try {
      dismissed = localStorage.getItem('pwa-install-dismissed');
    } catch {
      dismissed = null;
    }
    if (dismissed && Date.now() - Number(dismissed) < 7 * 24 * 60 * 60 * 1000) return;

    if (!standalone) {
      if (ios) {
        setTimeout(() => setShowBanner(true), 3000);
      }
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setTimeout(() => setShowBanner(true), 2000);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (isStandalone || !showBanner) return null;

  const handleInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') setShowBanner(false);
      setDeferredPrompt(null);
    }
  };

  const dismiss = () => {
    setShowBanner(false);
    try {
      localStorage.setItem('pwa-install-dismissed', String(Date.now()));
    } catch {
      // Sem armazenamento local, apenas fecha o aviso nesta sessão.
    }
  };

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 md:bottom-6 md:left-auto md:right-6 md:max-w-sm animate-fade-in">
      <div className="bg-card border border-border rounded-2xl shadow-2xl p-4">
        <button onClick={dismiss} className="absolute top-3 right-3 p-1 rounded-full hover:bg-muted transition-colors">
          <X className="h-4 w-4 text-muted-foreground" />
        </button>

        <div className="flex items-start gap-3">
          <img src="/pwa-icon-192.png" alt="MCI" className="w-12 h-12 rounded-xl" />
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-sm text-foreground">Instale o MCI CRM</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Acesse rápido direto da tela inicial do seu celular.
            </p>
          </div>
        </div>

        {isIOS ? (
          <div className="mt-3 p-3 bg-muted rounded-xl">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Share className="h-4 w-4 text-primary shrink-0" />
              Toque em <strong>Compartilhar</strong> e depois em <strong>"Tela Inicial"</strong>
            </p>
          </div>
        ) : (
          <Button
            onClick={handleInstall}
            className="w-full mt-3 bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
            size="sm"
          >
            <Download className="h-4 w-4" /> Instalar App
          </Button>
        )}
      </div>
    </div>
  );
}
