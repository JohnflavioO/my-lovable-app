import { ReactNode, useState, useEffect } from 'react';
import AppSidebar from './AppSidebar';
import mciLogoMobile from '@/assets/mci-logo-mobile.png';
import NotificationBell from './NotificationBell';
import WhatsNewBell from './WhatsNewBell';
import MobileBottomNav from './MobileBottomNav';
import PWAInstallPrompt from './PWAInstallPrompt';
import { Menu } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/hooks/useAuth';
import { useLocation, useNavigate } from 'react-router-dom';

function getAppSafeSearch(search: string) {
  const params = new URLSearchParams(search);

  const safeSearch = params.toString();
  return safeSearch ? `?${safeSearch}` : '';
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return window.localStorage.getItem('mci-sidebar-collapsed') === 'true'; } catch { return false; }
  });

  const toggleSidebar = () => setSidebarCollapsed(current => {
    const next = !current;
    try { window.localStorage.setItem('mci-sidebar-collapsed', String(next)); } catch { /* storage may be unavailable */ }
    return next;
  });
  const { isSupportOnly, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!loading && isSupportOnly) {
      console.log('[AppLayout] Restricted access: support_tech redirected to support dashboard');
      navigate(`/suporte${getAppSafeSearch(location.search)}`);
    }
  }, [isSupportOnly, loading, location.search, navigate]);

  if (loading || isSupportOnly) {
    return (
      <div className="min-h-screen bg-[#0f2b26] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className="min-h-screen bg-background overflow-x-hidden">
        <header className="sticky top-0 z-40 flex items-center gap-3 px-4 py-3 bg-background border-b border-border">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button className="p-2 -ml-2 rounded-lg hover:bg-muted transition-colors" aria-label="Menu">
                <Menu className="h-6 w-6" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-72" aria-describedby={undefined}>
              <AppSidebar onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <img src={mciLogoMobile} alt="MCI Store" className="h-8 w-auto" />
          <span className="text-sm font-bold font-display flex-1">MCI Store</span>
          <WhatsNewBell />
          <NotificationBell />
        </header>
        <main className="p-4 pb-24 animate-fade-in">
          {children}
        </main>
        <MobileBottomNav />
        <PWAInstallPrompt />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar collapsed={sidebarCollapsed} onToggleCollapse={toggleSidebar} />
      <div className={sidebarCollapsed ? 'ml-[4.5rem] min-w-0 transition-[margin] duration-200 ease-in-out' : 'ml-64 min-w-0 transition-[margin] duration-200 ease-in-out'}>
        <header className="sticky top-0 z-40 flex items-center justify-end gap-1 px-6 py-2 bg-background/80 backdrop-blur border-b border-border">
          <WhatsNewBell />
          <NotificationBell />
        </header>
        <main className="p-6 animate-fade-in">
          {children}
        </main>
      </div>
      <PWAInstallPrompt />
    </div>
  );
}
