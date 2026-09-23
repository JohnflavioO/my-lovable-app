import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type Verdict = 'igual' | 'proximo' | 'mci_superior' | 'pesquisado_superior' | 'nao_comparavel' | 'indisponivel';
export type Confidence = 'alta' | 'média' | 'baixa' | 'desconhecida' | '';
export type Source = 'url' | 'estimativa_agente' | 'texto_usuario' | 'catalogo_mci' | '';

export interface ComparisonCell {
  value: string;
  source?: Source;
  confidence?: Confidence;
}

export interface ComparisonRow {
  key: string;
  label: string;
  left: ComparisonCell;
  right: ComparisonCell;
  verdict: Verdict;
}

export interface DetailedComparison {
  left: {
    brand?: string; model?: string; category?: string; application?: string;
    source?: Source; image?: string; url?: string;
  };
  right: {
    id?: string; brand?: string; model?: string; category?: string;
    sku?: string; code?: string; price?: number | null; image?: string;
    source?: Source; application?: string;
  };
  summary?: string;
  rows: ComparisonRow[];
  similarities?: string[];
  mciAdvantages?: string[];
  attentionPoints?: string[];
  conclusion?: string;
  tier?: string;
  compatibility?: number;
  scoring?: {
    categoryKey?: string;
    breakdown?: Array<{ attribute: string; weight: number; score: number; note?: string }>;
  };
  confidenceOverall?: 'alta' | 'média' | 'baixa';
  category_weights?: Record<string, number>;
  diagnostic?: any;
  response_time_ms?: number;
  error?: string;
}

export interface DetailedComparisonArgs {
  mci_product_id: string;
  external: {
    input?: string;
    brand?: string;
    model?: string;
    category?: string;
    url?: string;
  };
}

export function useDetailedComparison() {
  return useMutation({
    mutationFn: async (args: DetailedComparisonArgs): Promise<DetailedComparison> => {
      const { data, error } = await supabase.functions.invoke('compare-products-detailed', {
        body: args,
      });
      if (error) throw new Error(error.message || 'Falha na comparação');
      if (data?.error) throw new Error(data.error);
      return data as DetailedComparison;
    },
  });
}
