import { useState, useEffect } from 'react';
import { Download, MonitorDown, Share, X } from 'lucide-react';
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
  const [isMobileDevice, setIsMobileDevice] = useState(false);

  useEffect(() => {
    const host = window.location.hostname;
    const isPreview = window.self !== window.top
      || host.startsWith('id-preview--')
      || host.startsWith('preview--')
      || host.includes('-preview--')
      || host === 'lovableproject.com'
      || host.endsWith('.lovableproject.com')
      || host === 'lovableproject-dev.com'
      || host.endsWith('.lovableproject-dev.com')
      || host === 'beta.lovable.dev'
      || host.endsWith('.beta.lovable.dev');
    if (isPreview) return;

    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as any).standalone === true;
    setIsStandalone(standalone);

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setIsIOS(ios);
    setIsMobileDevice(ios || /android|mobile/i.test(navigator.userAgent));

    let dismissed: string | null = null;
    try {
      dismissed = localStorage.getItem('pwa-install-dismissed');
    } catch {
      dismissed = null;
    }
    if (dismissed && Date.now() - Number(dismissed) < 7 * 24 * 60 * 60 * 1000) return;

    const bannerTimer = !standalone
      ? window.setTimeout(() => setShowBanner(true), 2500)
      : undefined;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setTimeout(() => setShowBanner(true), 2000);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      if (bannerTimer) window.clearTimeout(bannerTimer);
    };
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
              {isMobileDevice
                ? 'Acesse rápido direto da tela inicial do seu celular.'
                : 'Acesse rápido direto da área de trabalho do seu computador.'}
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
        ) : deferredPrompt ? (
          <Button
            onClick={handleInstall}
            className="w-full mt-3 bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
            size="sm"
          >
            <Download className="h-4 w-4" /> Instalar App
          </Button>
        ) : (
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-muted p-3 text-xs text-muted-foreground">
            <MonitorDown className="h-4 w-4 shrink-0 text-primary" />
            <p>
              {isMobileDevice
                ? 'Abra o menu do navegador e toque em “Instalar app” ou “Adicionar à tela inicial”.'
                : 'Abra o menu do navegador e escolha “Instalar MCI Proposta CRM”.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
