import { useAuth } from '@/hooks/useAuth';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, FileText, UserCheck, LogOut, Package, Calculator, ListChecks, BarChart3, Filter, Handshake, Plug,
  Clock, ArrowDownCircle, AlertTriangle, FileBarChart, Truck, ClipboardList, TriangleAlert, MapPin, RefreshCw, Warehouse, Target, Sparkles,
  Wrench, Zap, HelpCircle, Brain, Compass, PackageSearch, Link2, Database
} from 'lucide-react';
import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import UserProfileEditor from './UserProfileEditor';
import SidebarVersion from './SidebarVersion';
import { usePermissions } from '@/hooks/usePermissions';
import { prefetchRoute } from '@/lib/routePrefetch';
import { useResellerRegistrations } from '@/hooks/useResellerRegistrations';
import { Settings } from 'lucide-react';


const commercialItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Métricas e Visão' },
  { to: '/quotes', icon: FileText, label: 'Orçamentos', color: '#15AFA1' },
  
  { to: '/clients', icon: Users, label: 'Clientes' },
  { to: '/products', icon: Package, label: 'Produtos' },
  { to: '/pipeline', icon: Filter, label: 'Funil' },
  { to: '/negociacoes', icon: Handshake, label: 'Negociações' },
  { to: '/tasks', icon: ListChecks, label: 'Tarefas' },
];

const analyticItems = [
  { to: '/metrics', icon: BarChart3, label: 'Métricas' },
  { to: '/inteligencia', icon: Brain, label: 'Inteligência Comercial' },
  { to: '/prospect', icon: Target, label: 'Visão Prospect' },
];

const toolItems = [
  { to: '/comparador', icon: PackageSearch, label: 'Comparador Inteligente' },
  { to: '/contracts', icon: FileText, label: 'Gerador de Contratos', permission: 'contracts.use' as const },
  { to: '/assistente', icon: Compass, label: 'Assistente Comercial' },
  { to: '/ecoflow', icon: Calculator, label: 'Calculadora Ecoflow' },
  { to: '/frete', icon: Truck, label: 'Cotação de Frete' },
  { to: '/tasks', icon: ListChecks, label: 'TaskHub' },
];


const supportMenuItems = [
  { to: '/suporte', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/suporte/os', icon: ClipboardList, label: 'Ordens de Serviço' },
  { to: '/suporte/orcamentos', icon: Calculator, label: 'Orçamentos' },
  { to: '/suporte/clientes', icon: Users, label: 'Clientes' },
  { to: '/suporte/estoque', icon: Warehouse, label: 'Estoque' },
  { to: '/suporte/compras', icon: Truck, label: 'Ordem de Compra' },
  { to: '/suporte/nuvem', icon: Sparkles, label: 'Nuvem' },
  { to: '/suporte/relatorios', icon: BarChart3, label: 'Relatórios' },
  { to: '/suporte/manutencao', icon: Wrench, label: 'Manutenção' },
];

interface Props {
  onNavigate?: () => void;
}

export default function AppSidebar({ onNavigate }: Props) {
  const { isAdmin, isGestor, isFinanceiro, isLogistica, isSupport, isSupportTech, isSupportManager, signOut } = useAuth();
  const { hasPermission } = usePermissions();
  const { newCount: resellerNewCount } = useResellerRegistrations();

  const location = useLocation();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefreshApp = useCallback(async () => {
    setRefreshing(true);
    const host = window.location.hostname;
    const isPreview = window.self !== window.top
      || host.startsWith('id-preview--')
      || host.includes('-preview--')
      || host.includes('lovable.app')
      || host.endsWith('.lovableproject.com');

    try {
      if (!isPreview) {
        if ('caches' in window) {
          const names = await caches.keys();
          await Promise.all(names.map(n => caches.delete(n)));
        }

        const reg = await navigator.serviceWorker?.getRegistration();
        if (reg) {
          await reg.unregister();
        }
      }

      if (isPreview) {
        window.history.replaceState(window.history.state, '', window.location.href);
        window.dispatchEvent(new PopStateEvent('popstate'));
        return;
      }

      window.location.reload();
    } catch {
      if (isPreview) return;
      window.location.reload();
    }
  }, []);

  const isFinanceiroOnly = isFinanceiro && !isAdmin && !isGestor;
  const isLogisticaOnly = isLogistica && !isAdmin && !isGestor && !isFinanceiro;

  const LinkItem = ({ to, icon: Icon, label, color, badge }: { to: string; icon: any; label: string; color?: string; badge?: number }) => {
    const isActive = location.pathname === to;
    return (
      <NavLink
        to={to}
        onClick={onNavigate}
        onMouseEnter={() => prefetchRoute(to)}
        onFocus={() => prefetchRoute(to)}
        onTouchStart={() => prefetchRoute(to)}
        className={cn(
          'group relative flex items-center gap-3.5 pl-4 pr-3 py-2.5 rounded-md text-[14px] leading-[1.35] font-medium transition-all duration-150 ease-out min-h-[42px]',
          isActive
            ? 'text-sidebar-accent-foreground bg-sidebar-accent/25 before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-r before:bg-sidebar-primary'
            : 'text-sidebar-foreground/65 hover:text-sidebar-foreground hover:bg-sidebar-accent/25 hover:translate-x-[2px]'
        )}
        style={color && !isActive ? { color } : undefined}
      >
        <Icon className={cn('h-[19px] w-[19px] shrink-0 transition-colors', isActive && 'text-sidebar-primary')} />
        <span className="truncate">{label}</span>
        {!!badge && badge > 0 && (
          <span className="ml-auto shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </NavLink>
    );
  };

  const financialMenuItems = [
    { to: '/financial?tab=dashboard', icon: LayoutDashboard, label: 'Dashboard Financeiro' },
    { to: '/bank-slips', icon: FileBarChart, label: 'Controle de Boletos' },
    { to: '/financial?tab=pendencias', icon: Clock, label: 'Contas a Receber' },
    { to: '/financial?tab=baixas', icon: ArrowDownCircle, label: 'Baixas' },
    { to: '/financial?tab=pendencias&priority=vencidos', icon: AlertTriangle, label: 'Pendências' },
    { to: '/financial?tab=relatorios', icon: FileBarChart, label: 'Relatórios' },
  ];

  const logisticsMenuItems = [
    { to: '/logistics?tab=prevendas', icon: ClipboardList, label: 'Pré-vendas' },
    { to: '/logistics?tab=dashboard', icon: LayoutDashboard, label: 'Dashboard Logística' },

    { to: '/logistics?tab=pedidos', icon: ClipboardList, label: 'Pedidos' },
    { to: '/logistics?tab=nf', icon: FileText, label: 'NF / Emissão' },
    { to: '/logistics?tab=envios', icon: Truck, label: 'Envios' },
    { to: '/logistics?tab=rastreamento', icon: MapPin, label: 'Rastreamento' },
    { to: '/logistics?tab=problemas', icon: TriangleAlert, label: 'Problemas' },
  ];

  const FinancialLinkItem = ({ to, icon: Icon, label }: { to: string; icon: any; label: string }) => {
    const isActive = location.pathname + location.search === to || (to === '/financial?tab=dashboard' && location.pathname === '/financial' && !location.search);
    return (
      <NavLink
        to={to}
        onClick={onNavigate}
        onMouseEnter={() => prefetchRoute(to)}
        onFocus={() => prefetchRoute(to)}
        onTouchStart={() => prefetchRoute(to)}
        className={cn(
          'relative flex items-center gap-3.5 pl-4 pr-3 py-2.5 rounded-md text-[14px] leading-[1.35] font-medium transition-all duration-150 ease-out min-h-[42px]',
          isActive
            ? 'text-sidebar-accent-foreground bg-sidebar-accent/25 before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-r before:bg-sidebar-primary'
            : 'text-sidebar-foreground/65 hover:text-sidebar-foreground hover:bg-sidebar-accent/25 hover:translate-x-[2px]'
        )}
      >
        <Icon className={cn('h-[19px] w-[19px] shrink-0 transition-colors', isActive && 'text-sidebar-primary')} />
        <span className="truncate">{label}</span>
      </NavLink>
    );
  };

  const LogisticsLinkItem = ({ to, icon: Icon, label }: { to: string; icon: any; label: string }) => {
    const isActive = location.pathname + location.search === to || (to === '/logistics?tab=dashboard' && location.pathname === '/logistics' && !location.search);
    return (
      <NavLink
        to={to}
        onClick={onNavigate}
        className={cn(
          'relative flex items-center gap-3.5 pl-4 pr-3 py-2.5 rounded-md text-[14px] leading-[1.35] font-medium transition-all duration-150 ease-out min-h-[42px]',
          isActive
            ? 'text-sidebar-accent-foreground bg-sidebar-accent/25 before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-r before:bg-sidebar-primary'
            : 'text-sidebar-foreground/65 hover:text-sidebar-foreground hover:bg-sidebar-accent/25 hover:translate-x-[2px]'
        )}
      >
        <Icon className={cn('h-[19px] w-[19px] shrink-0 transition-colors', isActive && 'text-sidebar-primary')} />
        <span className="truncate">{label}</span>
      </NavLink>
    );
  };


  const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <div className="pt-3 pb-1 px-4">
      <p className="text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-[0.12em]">{children}</p>
    </div>
  );

  const SectionDivider = () => (
    <div className="my-2 mx-4 h-px bg-sidebar-border/60" />
  );

  const SidebarHeader = ({ subtitle }: { subtitle: string }) => (
    <div className="px-4 pt-3 pb-3 flex items-center gap-2.5 border-b border-sidebar-border/60">
      <img src="/mci-logo.png" alt="MCI Store" className="h-8 w-auto" />
      <div className="min-w-0">
        <h1 className="text-[13px] font-semibold font-display text-sidebar-primary-foreground leading-tight truncate">MCI Store</h1>
        <p className="text-[10px] text-sidebar-foreground/55 truncate">{subtitle}</p>
      </div>
    </div>
  );

  const SidebarFooter = () => (
    <div className="px-3 pt-3 pb-3 border-t border-sidebar-border/60 space-y-2">
      <div className="rounded-lg bg-sidebar-accent/30 border border-sidebar-border/50 px-2.5 py-2">
        <UserProfileEditor />
      </div>
      <div className="flex items-center gap-1 px-1">
        <button onClick={handleRefreshApp} disabled={refreshing}
          className="flex items-center justify-center gap-1.5 text-[11px] text-sidebar-foreground/55 hover:text-sidebar-foreground transition-colors duration-150 flex-1 py-1.5 rounded-md hover:bg-sidebar-accent/25">
          <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} /> Atualizar
        </button>
        <div className="w-px h-4 bg-sidebar-border/60" />
        <button onClick={() => { signOut(); onNavigate?.(); }}
          className="flex items-center justify-center gap-1.5 text-[11px] text-sidebar-foreground/55 hover:text-sidebar-foreground transition-colors duration-150 flex-1 py-1.5 rounded-md hover:bg-sidebar-accent/25">
          <LogOut className="h-3.5 w-3.5" /> Sair
        </button>
      </div>
      <div className="pt-1 flex justify-center opacity-60">
        <SidebarVersion />
      </div>
    </div>
  );

  // Logistica-only sidebar
  if (isLogisticaOnly) {
    return (
      <aside className="w-full md:w-64 h-full md:h-screen md:fixed md:left-0 md:top-0 flex flex-col border-r border-sidebar-border"
        style={{ background: 'var(--gradient-sidebar)' }}>
        <SidebarHeader subtitle="Setor Logística" />
        <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto">
          {logisticsMenuItems.map(item => (
            <LogisticsLinkItem key={item.to} {...item} />
          ))}
          <SectionDivider />
          <SectionLabel>Configurações</SectionLabel>
          <LinkItem to="/configuracoes/aparencia" icon={Settings} label="Aparência" />
          <LinkItem to="/ajuda" icon={HelpCircle} label="Ajuda" />
        </nav>
        <SidebarFooter />
      </aside>
    );
  }

  const isSupportOnly = isSupport && !isAdmin && !isGestor && !isFinanceiro && !isLogistica;

  if (isSupportOnly) {
    return (
      <aside className="w-full md:w-64 h-full md:h-screen md:fixed md:left-0 md:top-0 flex flex-col border-r border-sidebar-border"
        style={{ background: 'var(--gradient-sidebar)' }}>
        <SidebarHeader subtitle="Suporte Técnico" />
        <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto">
          {supportMenuItems.map(item => (
            <LinkItem key={item.to} {...item} />
          ))}
          <SectionDivider />
          <SectionLabel>Configurações</SectionLabel>
          <LinkItem to="/configuracoes/aparencia" icon={Settings} label="Aparência" />
          <LinkItem to="/ajuda" icon={HelpCircle} label="Ajuda" />
        </nav>
        <SidebarFooter />
      </aside>
    );
  }

  return (
    <aside className="w-full md:w-64 h-full md:h-screen md:fixed md:left-0 md:top-0 flex flex-col border-r border-sidebar-border"
      style={{ background: 'var(--gradient-sidebar)' }}>
      <SidebarHeader subtitle={isFinanceiroOnly ? 'Setor Financeiro' : 'Sistema de Orçamentos'} />

      <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto">
        {isFinanceiroOnly ? (
          <>
            {financialMenuItems.map(item => (
              <FinancialLinkItem key={item.to} {...item} />
            ))}
            <SectionDivider />
            <SectionLabel>Ajuda</SectionLabel>
            <LinkItem to="/ajuda" icon={HelpCircle} label="Tutoriais" />
          </>
        ) : (
          <>
            <SectionLabel>Comercial</SectionLabel>
            {commercialItems.map(item => (
              <LinkItem key={item.to} {...item} color={item.color} badge={item.to === '/clients' ? resellerNewCount : 0} />
            ))}

            <SectionDivider />
            <SectionLabel>Análise</SectionLabel>
            {analyticItems.map(item => (
              <LinkItem key={item.to} {...item} />
            ))}

            <SectionDivider />
            <SectionLabel>Ferramentas</SectionLabel>
            {toolItems
              .filter(item => !item.permission || hasPermission(item.permission))
              .map(item => (
                <LinkItem key={item.to} to={item.to} icon={item.icon} label={item.label} />
              ))}

            <SectionDivider />
            <SectionLabel>Operacional e Logística</SectionLabel>
            <LinkItem to="/logistics" icon={Truck} label="Acompanhamento" />
            <LinkItem to="/estoque-sc" icon={Warehouse} label="Estoque SC" />

            {(isGestor || isFinanceiro) && (
              <>
                <SectionDivider />
                <SectionLabel>Financeiro</SectionLabel>
                {financialMenuItems.map(item => (
                  <FinancialLinkItem key={item.to} {...item} />
                ))}
              </>
            )}

            {(isAdmin || isGestor) && (
              <>
                <SectionDivider />
                <SectionLabel>Administrativo</SectionLabel>
                {[{ to: '/approvals', icon: UserCheck, label: 'Aprovações' }, { to: '/aprovacoes/reciclagem', icon: RefreshCw, label: 'Reciclagem de Ciclo' }, { to: '/assistente/auditoria', icon: Compass, label: 'Auditoria do Assistente' }, { to: '/diagnostico/logistica', icon: Truck, label: 'Diagnóstico Logístico' }, { to: '/mapeamento-produtos', icon: Link2, label: 'Mapeamento de Produtos' }, { to: '/backup', icon: Database, label: 'Backup de Dados' }].map(item => <LinkItem key={item.to} {...item} />)}
                {isAdmin && [{ to: '/integrations', icon: Plug, label: 'Integrações' }].map(item => <LinkItem key={item.to} {...item} />)}
              </>
            )}

            {(isSupport || isAdmin || isGestor) && (
              <>
                <SectionDivider />
                <SectionLabel>Suporte Técnico</SectionLabel>
                <LinkItem to="/suporte" icon={Wrench} label="Portal de Suporte" />
              </>
            )}

            <SectionDivider />
            <SectionLabel>Configurações</SectionLabel>
            <LinkItem to="/configuracoes/aparencia" icon={Settings} label="Aparência" />
            <LinkItem to="/ajuda" icon={HelpCircle} label="Tutoriais" />
          </>
        )}
      </nav>

      <SidebarFooter />
    </aside>
  );
}

