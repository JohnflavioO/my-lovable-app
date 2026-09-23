// Mapa de prefetch de rotas: dispara o import() do chunk ao passar o mouse
// sobre um link de navegação. Assim, quando o usuário clica, o chunk já
// está no cache do browser e a troca de rota é quase instantânea.

type Loader = () => Promise<unknown>;

const loaders: Record<string, Loader> = {
  '/dashboard': () => import('@/pages/Dashboard'),
  '/operational': () => import('@/pages/OperationalCenter'),
  '/clients': () => import('@/pages/Clients'),
  '/quotes': () => import('@/pages/Quotes'),
  '/inteligencia': () => import('@/pages/InteligenciaComercial'),
  '/products': () => import('@/pages/Products'),
  '/contracts': () => import('@/pages/ContractGenerator'),
  '/ecoflow': () => import('@/pages/EcoflowCalculator'),
  '/tasks': () => import('@/pages/Tasks'),
  '/metrics': () => import('@/pages/Metrics'),
  '/pipeline': () => import('@/pages/Pipeline'),
  '/negociacoes': () => import('@/pages/Negociacoes'),
  '/prospect': () => import('@/pages/ProspectView'),
  '/reports': () => import('@/pages/Reports'),
  '/logistics': () => import('@/pages/Logistics'),
  '/estoque-sc': () => import('@/pages/EstoqueSC'),
  '/financial': () => import('@/pages/Financial'),
  '/bank-slips': () => import('@/pages/BankSlips'),
  '/approvals': () => import('@/pages/Approvals'),
  '/integrations': () => import('@/pages/Integrations'),
  '/ajuda': () => import('@/pages/Help'),
  '/sobre': () => import('@/pages/About'),
  '/suporte': () => import('@/components/support/SupportLayout'),
  '/suporte/os': () => import('@/pages/support/SupportOrders'),
  '/suporte/orcamentos': () => import('@/pages/support/SupportBudgets'),
  '/suporte/clientes': () => import('@/pages/support/SupportClients'),
  '/suporte/estoque': () => import('@/pages/support/SupportStock'),
  '/suporte/compras': () => import('@/pages/support/SupportPurchases'),
  '/suporte/nuvem': () => import('@/pages/support/SupportCloud'),
  '/suporte/relatorios': () => import('@/pages/support/SupportReports'),
  '/suporte/manutencao': () => import('@/pages/support/SupportMaintenance'),
};

const prefetched = new Set<string>();

export function prefetchRoute(pathOrHref: string) {
  const path = pathOrHref.split('?')[0];
  if (prefetched.has(path)) return;
  const loader = loaders[path];
  if (!loader) return;
  prefetched.add(path);
  // Silencia erros de rede — é apenas prefetch
  loader().catch(() => prefetched.delete(path));
}
