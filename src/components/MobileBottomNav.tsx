import { useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, FileText, Users, Kanban, Banknote, Clock, ArrowDownCircle, Truck, ClipboardList, MapPin, Target, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

const commercialItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Métricas' },
  { to: '/quotes', icon: FileText, label: 'Orçamentos' },
  
  { to: '/clients', icon: Users, label: 'Clientes' },
  { to: '/pipeline', icon: Kanban, label: 'Funil' },
];

const financialItems = [
  { to: '/financial?tab=dashboard', icon: Banknote, label: 'Dashboard' },
  { to: '/financial?tab=pendencias', icon: Clock, label: 'Pendências' },
  { to: '/financial?tab=baixas', icon: ArrowDownCircle, label: 'Baixas' },
];

const logisticsItems = [
  { to: '/logistics?tab=prevendas', icon: ClipboardList, label: 'Pré-vendas' },
  { to: '/logistics?tab=dashboard', icon: Truck, label: 'Dashboard' },
  { to: '/logistics?tab=envios', icon: MapPin, label: 'Envios' },
];


export default function MobileBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isFinanceiro, isAdmin, isGestor, isLogistica } = useAuth();

  const isFinanceiroOnly = isFinanceiro && !isAdmin && !isGestor;
  const isLogisticaOnly = isLogistica && !isAdmin && !isGestor && !isFinanceiro;
  const items = isLogisticaOnly ? logisticsItems : isFinanceiroOnly ? financialItems : commercialItems;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border md:hidden safe-area-bottom">
      <div className="flex items-stretch">
        {items.map(({ to, icon: Icon, label }) => {
          const active = location.pathname + location.search === to
            || (to === '/financial?tab=dashboard' && location.pathname === '/financial' && !location.search)
            || (to === '/logistics?tab=dashboard' && location.pathname === '/logistics' && !location.search);
          return (
            <button
              key={to}
              onClick={() => navigate(to)}
              className={cn(
                'flex-1 flex flex-col items-center gap-0.5 py-2 pt-2.5 transition-colors',
                active ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
