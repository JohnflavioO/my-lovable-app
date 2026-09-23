import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CrmToolResponse<T = any> = {
  ok: boolean;
  entity: string;
  rows?: any[];
  columns?: string[];
  count?: number;
  summary?: any;
  data?: T;
  error?: string;
  diagnostics?: {
    tool: string;
    request_id: string;
    args?: any;
    duration_ms: number;
    row_count?: number | null;
    generated_at: string;
  };
};

async function callTool<T = any>(tool: string, args: Record<string, any> = {}): Promise<CrmToolResponse<T>> {
  const { data, error } = await supabase.functions.invoke("crm-tools", { body: { tool, args } });
  if (error) {
    return { ok: false, entity: "error", error: error.message };
  }
  return data as CrmToolResponse<T>;
}

export function useCrmTool<T = any>(
  tool: string,
  args: Record<string, any> = {},
  options?: Omit<UseQueryOptions<CrmToolResponse<T>, Error>, "queryKey" | "queryFn">,
) {
  return useQuery<CrmToolResponse<T>, Error>({
    queryKey: ["crm-tool", tool, args],
    queryFn: () => callTool<T>(tool, args),
    staleTime: 2 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    ...options,
  });
}

export { callTool };
