import { Outlet } from 'react-router-dom';
import { useState } from 'react';
import { Menu } from 'lucide-react';
import SupportSidebar from './SupportSidebar';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import mciLogoMobile from '@/assets/mci-logo-mobile.png';
import NotificationBell from '../NotificationBell';
import PWAInstallPrompt from '../PWAInstallPrompt';

export default function SupportLayout() {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  if (isMobile) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <header className="sticky top-0 z-40 flex items-center gap-3 px-4 py-3 bg-background border-b border-border">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button className="p-2 -ml-2 rounded-lg hover:bg-muted transition-colors" aria-label="Menu">
                <Menu className="h-6 w-6" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-72" aria-describedby={undefined}>
              <SupportSidebar onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <img src={mciLogoMobile} alt="MCI Store" className="h-8 w-auto" />
          <span className="text-sm font-bold font-display flex-1">MCI Tech</span>
          <NotificationBell />
        </header>
        <main className="p-4 pb-24 animate-fade-in">
          <Outlet />
        </main>
        <PWAInstallPrompt />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SupportSidebar />
      <div className="ml-64">
        <header className="sticky top-0 z-40 flex items-center justify-end px-6 py-2 bg-background/80 backdrop-blur border-b border-border">
          <NotificationBell />
        </header>
        <main className="p-6 animate-fade-in">
          <Outlet />
        </main>
      </div>
      <PWAInstallPrompt />
    </div>
  );
}
