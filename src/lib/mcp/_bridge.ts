// Bridge: MCP tools -> shared CRM handlers (single source of truth)
import { createClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";
import { resolveTool, type CrmCtx } from "../../../supabase/functions/_shared/crm-handlers";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function requireAuth(ctx: ToolContext) {
  if (!ctx.isAuthenticated()) {
    return { content: [{ type: "text" as const, text: "Não autenticado" }], isError: true };
  }
  return null;
}

async function loadProfile(supabase: any, userId: string) {
  const { data } = await supabase.from("profiles").select("full_name, role, company_id").eq("user_id", userId).maybeSingle();
  return data ?? null;
}

/**
 * Executes a shared CRM tool by name and adapts its envelope to the MCP content shape.
 * Keeps a single source of truth: MCP and assistant-commercial share the same handler.
 */
export async function runShared(name: string, args: any, ctx: ToolContext) {
  const guard = requireAuth(ctx);
  if (guard) return guard;
  const tool = resolveTool(name);
  if (!tool) return { content: [{ type: "text" as const, text: `Tool ${name} não implementada` }], isError: true };
  const supabase = supabaseForUser(ctx);
  const userId = ctx.getUserId() ?? "";
  const profile = await loadProfile(supabase, userId);
  const crmCtx: CrmCtx = { supabase, userId, profile, companyId: profile?.company_id ?? null };
  try {
    const res = await tool.handler(crmCtx, args ?? {});
    if (!res.ok) {
      return { content: [{ type: "text" as const, text: res.error ?? "Erro desconhecido" }], isError: true };
    }
    const structured: any = { ok: true, entity: res.entity };
    if (res.rows !== undefined) structured.rows = res.rows;
    if (res.count !== undefined) structured.count = res.count;
    if (res.summary !== undefined) structured.summary = res.summary;
    if (res.data !== undefined) structured.data = res.data;
    if (res.columns !== undefined) structured.columns = res.columns;
    return {
      content: [{ type: "text" as const, text: JSON.stringify(structured).slice(0, 12000) }],
      structuredContent: structured,
    };
  } catch (e: any) {
    return { content: [{ type: "text" as const, text: e?.message ?? "Erro na execução" }], isError: true };
  }
}
