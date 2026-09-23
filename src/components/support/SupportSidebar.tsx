import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import {
  LayoutDashboard, Package, Users, ClipboardList, ShoppingCart, FileText,
  Cloud, BarChart3, Wrench, LogOut, ArrowLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

const items = [
  { to: '/suporte', icon: LayoutDashboard, label: 'Dashboard', end: true },
  
  { to: '/suporte/clientes', icon: Users, label: 'Clientes' },
  { to: '/suporte/estoque', icon: Package, label: 'Estoque' },
  { to: '/suporte/os', icon: ClipboardList, label: 'Ordens de Serviço' },
  { to: '/suporte/compras', icon: ShoppingCart, label: 'Ordem de Compra' },
  { to: '/suporte/orcamentos', icon: FileText, label: 'Orçamentos' },
  { to: '/suporte/nuvem', icon: Cloud, label: 'Nuvem' },
  { to: '/suporte/relatorios', icon: BarChart3, label: 'Relatórios' },
  { to: '/suporte/manutencao', icon: Wrench, label: 'Manutenção' },
];

export default function SupportSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { signOut, profile, isAdmin, isGestor } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const canGoBackToCRM = isAdmin || isGestor;

  return (
    <aside 
      className="w-full md:w-64 h-full md:h-screen md:fixed md:left-0 md:top-0 flex flex-col border-r border-sidebar-border"
      style={{ background: 'var(--gradient-sidebar)' }}
    >
      <div className="p-4 flex items-center gap-3">
        <img src="/mci-logo.png" alt="MCI Store" className="h-10 w-auto" />
        <div>
          <h1 className="text-sm font-bold font-display text-sidebar-primary-foreground">MCI Tech</h1>
          <p className="text-[10px] text-sidebar-foreground/60 uppercase tracking-wider">Suporte Técnico</p>
        </div>
      </div>

      <nav className="flex-1 px-3 space-y-1 overflow-y-auto mt-2">
        {items.map(({ to, icon: Icon, label, end }) => {
          const active = end ? pathname === to : pathname === to || pathname.startsWith(to + '/');
          return (
            <NavLink
              key={to}
              to={to}
              onClick={onNavigate}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[44px]',
                active
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-sm'
                  : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
              )}
            >
              <Icon className={cn("h-5 w-5", active ? "text-sidebar-accent-foreground" : "text-sidebar-foreground/40")} />
              {label}
            </NavLink>
          );
        })}
      </nav>

      <div className="p-4 border-t border-sidebar-border space-y-2">
        {canGoBackToCRM && (
          <button
            onClick={() => {
              navigate('/dashboard');
              onNavigate?.();
            }}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[44px] bg-emerald-600/10 text-emerald-400 hover:bg-emerald-600/20 w-full"
          >
            <ArrowLeft className="h-5 w-5" />
            Voltar ao Dashboard
          </button>
        )}
        {profile?.full_name && (
          <div className="px-2 flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-sidebar-accent/50 flex items-center justify-center text-[10px] font-bold text-sidebar-foreground">
              {profile.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-sidebar-primary-foreground truncate">{profile.full_name}</p>
              <p className="text-[10px] text-sidebar-foreground/60 truncate capitalize">{profile.role?.replace('_', ' ')}</p>
            </div>
          </div>
        )}
        <button
          onClick={() => { signOut(); onNavigate?.(); }}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors w-full min-h-[44px]"
        >
          <LogOut className="h-4 w-4" /> Sair
        </button>
      </div>
    </aside>
  );
}
