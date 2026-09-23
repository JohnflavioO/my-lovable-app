import { useState, useMemo, useCallback } from 'react';
import { ClientFilters, emptyFilters } from './ClientFilterDrawer';
import { subDays, subMonths, parseISO, isAfter, isBefore } from 'date-fns';

interface ClientRow {
  id: string;
  company_name: string;
  city: string;
  state: string;
  created_at?: string;
  last_interaction_at?: string;
  created_by?: string;
  [key: string]: any;
}

export type { ClientRow };

interface QuoteRow {
  client_id: string;
  status: string;
  created_at: string;
  pipeline_stage?: string;
}

interface UseClientFiltersArgs {
  clients: ClientRow[];
  quotes: QuoteRow[];
  currentUserId: string;
  canSeeAll: boolean;
}

export function useClientFilters({ clients, quotes, currentUserId, canSeeAll }: UseClientFiltersArgs) {
  const [filters, setFilters] = useState<ClientFilters>(emptyFilters);
  const [ownerFilter, setOwnerFilter] = useState<string>('mine');
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Build lookup maps from quotes
  const clientQuotes = useMemo(() => {
    const map: Record<string, QuoteRow[]> = {};
    for (const q of quotes) {
      if (!q.client_id) continue;
      if (!map[q.client_id]) map[q.client_id] = [];
      map[q.client_id].push(q);
    }
    return map;
  }, [quotes]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.companyName) count++;
    if (filters.createdFrom || filters.createdTo) count++;
    if (filters.lastContactFrom || filters.lastContactTo) count++;
    if (filters.lastSaleFrom || filters.lastSaleTo) count++;
    if (filters.city) count++;
    if (filters.state) count++;
    if (filters.hasNegotiation !== null) count++;
    if (filters.hasContact !== null) count++;
    if (filters.hasSale !== null) count++;
    return count;
  }, [filters]);

  const applyPreset = useCallback((key: string) => {
    setActivePreset(prev => prev === key ? null : key);
  }, []);

  const clearAll = useCallback(() => {
    setFilters(emptyFilters);
    setActivePreset(null);
    setOwnerFilter('mine');
  }, []);

  const filtered = useMemo(() => {
    const now = new Date();
    const d30 = subDays(now, 30);
    const m3 = subMonths(now, 3);

    let result = [...clients];

    // Owner filter (enforced for sellers, optional for admins)
    if (!canSeeAll || ownerFilter === 'mine') {
      result = result.filter(c => c.created_by === currentUserId);
    } else if (ownerFilter !== 'all') {
      result = result.filter(c => c.created_by === ownerFilter);
    }

    // Drawer filters
    if (filters.companyName) {
      const q = filters.companyName.toLowerCase();
      result = result.filter(c => c.company_name?.toLowerCase().includes(q));
    }
    if (filters.createdFrom) {
      const d = parseISO(filters.createdFrom);
      result = result.filter(c => c.created_at && !isBefore(parseISO(c.created_at), d));
    }
    if (filters.createdTo) {
      const d = parseISO(filters.createdTo);
      result = result.filter(c => c.created_at && !isAfter(parseISO(c.created_at), d));
    }
    if (filters.lastContactFrom) {
      const d = parseISO(filters.lastContactFrom);
      result = result.filter(c => c.last_interaction_at && !isBefore(parseISO(c.last_interaction_at), d));
    }
    if (filters.lastContactTo) {
      const d = parseISO(filters.lastContactTo);
      result = result.filter(c => c.last_interaction_at && !isAfter(parseISO(c.last_interaction_at), d));
    }
    if (filters.city) {
      const q = filters.city.toLowerCase();
      result = result.filter(c => c.city?.toLowerCase().includes(q));
    }
    if (filters.state) {
      result = result.filter(c => c.state === filters.state);
    }

    // Has negotiation (quotes in negotiation/sent/etc status)
    if (filters.hasNegotiation === true) {
      result = result.filter(c => {
        const cq = clientQuotes[c.id] || [];
        return cq.some(q => ['negotiation', 'negociacao', 'sent', 'contact_made', 'pre_sale'].includes(q.status || ''));
      });
    } else if (filters.hasNegotiation === false) {
      result = result.filter(c => {
        const cq = clientQuotes[c.id] || [];
        return !cq.some(q => ['negotiation', 'negociacao', 'sent', 'contact_made', 'pre_sale'].includes(q.status || ''));
      });
    }

    // Has contact
    if (filters.hasContact === true) {
      result = result.filter(c => !!c.last_interaction_at);
    } else if (filters.hasContact === false) {
      result = result.filter(c => !c.last_interaction_at);
    }

    // Has sale
    if (filters.hasSale === true) {
      result = result.filter(c => {
        const cq = clientQuotes[c.id] || [];
        return cq.some(q => ['approved', 'closed'].includes(q.status || ''));
      });
    } else if (filters.hasSale === false) {
      result = result.filter(c => {
        const cq = clientQuotes[c.id] || [];
        return !cq.some(q => ['approved', 'closed'].includes(q.status || ''));
      });
    }

    // Last sale date range
    if (filters.lastSaleFrom || filters.lastSaleTo) {
      result = result.filter(c => {
        const cq = clientQuotes[c.id] || [];
        const sales = cq.filter(q => ['approved', 'closed'].includes(q.status || ''));
        if (sales.length === 0) return false;
        const lastSale = sales.sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
        const saleDate = parseISO(lastSale.created_at);
        if (filters.lastSaleFrom && isBefore(saleDate, parseISO(filters.lastSaleFrom))) return false;
        if (filters.lastSaleTo && isAfter(saleDate, parseISO(filters.lastSaleTo))) return false;
        return true;
      });
    }

    // Preset filters
    if (activePreset) {
      switch (activePreset) {
        case 'com_venda':
          result = result.filter(c => (clientQuotes[c.id] || []).some(q => ['approved', 'closed'].includes(q.status || '')));
          break;
        case 'sem_venda':
          result = result.filter(c => !(clientQuotes[c.id] || []).some(q => ['approved', 'closed'].includes(q.status || '')));
          break;
        case 'venda_recente_30d':
          result = result.filter(c => (clientQuotes[c.id] || []).some(q =>
            ['approved', 'closed'].includes(q.status || '') && isAfter(parseISO(q.created_at), d30)
          ));
          break;
        case 'venda_antiga_3m':
          result = result.filter(c => {
            const sales = (clientQuotes[c.id] || []).filter(q => ['approved', 'closed'].includes(q.status || ''));
            if (sales.length === 0) return false;
            const latest = sales.sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
            return isBefore(parseISO(latest.created_at), m3);
          });
          break;
        case 'venda_recorrente':
          result = result.filter(c => (clientQuotes[c.id] || []).filter(q => ['approved', 'closed'].includes(q.status || '')).length >= 2);
          break;
        case 'negociacao_andamento':
          result = result.filter(c => (clientQuotes[c.id] || []).some(q => ['negotiation', 'negociacao', 'sent'].includes(q.status || '')));
          break;
        case 'negociacao_contato_recente':
          result = result.filter(c => {
            const hasNeg = (clientQuotes[c.id] || []).some(q => ['negotiation', 'negociacao', 'sent', 'contact_made'].includes(q.status || ''));
            return hasNeg && c.last_interaction_at && isAfter(parseISO(c.last_interaction_at), d30);
          });
          break;
        case 'sem_negociacao':
          result = result.filter(c => !(clientQuotes[c.id] || []).length);
          break;
        case 'com_contato':
          result = result.filter(c => !!c.last_interaction_at);
          break;
        case 'sem_contato':
          result = result.filter(c => !c.last_interaction_at);
          break;
        case 'contato_antigo_30d':
          result = result.filter(c => c.last_interaction_at && isBefore(parseISO(c.last_interaction_at), d30));
          break;
      }
    }

    return result;
  }, [clients, filters, ownerFilter, activePreset, clientQuotes, canSeeAll, currentUserId]);

  return {
    filters, setFilters,
    ownerFilter, setOwnerFilter,
    activePreset, applyPreset,
    activeFilterCount,
    drawerOpen, setDrawerOpen,
    clearAll,
    filtered,
  };
}
