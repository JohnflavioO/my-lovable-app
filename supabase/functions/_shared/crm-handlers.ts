// ================================================================
// CRM Shared Handlers (single source of truth)
// Used by both the MCP server (src/lib/mcp/tools/*) and by the
// assistant-commercial Edge Function. NO external deps — supabase
// client is injected so this module works in Deno and Node/Vite.
// ================================================================

export type CrmCtx = {
  supabase: any;              // JWT-scoped supabase client (RLS applies)
  userId: string;
  profile?: any;
  companyId?: string | null;
};

export type CrmEnvelope = {
  ok: boolean;
  entity: string;
  columns?: string[];
  rows?: any[];
  count?: number;
  summary?: any;
  data?: any;
  error?: string;
};

const APPROVED_STATUSES = ["approved", "aprovado", "aprovada", "won", "closed_won"];

const okEnv = (entity: string, extra: Partial<CrmEnvelope> = {}): CrmEnvelope => ({
  ok: true,
  entity,
  ...extra,
});
const errEnv = (entity: string, error: string): CrmEnvelope => ({ ok: false, entity, error });

// Scope helper: admin/gestor podem pedir scope='team' para ampliar; caso contrário, restringe.
function scopeOwn(query: any, column: string, ctx: CrmCtx, scope?: string) {
  const role = ctx.profile?.role;
  const isBoss = role === "admin" || role === "gestor";
  if (isBoss && scope === "team") return query;
  return query.eq(column, ctx.userId);
}

// -----------------------------------------------------------------
// Clients
// -----------------------------------------------------------------
export async function listClients(ctx: CrmCtx, args: { search?: string; limit?: number; scope?: string } = {}): Promise<CrmEnvelope> {
  const limit = Math.min(args.limit ?? 25, 200);
  let q = ctx.supabase
    .from("clients")
    .select("id,name,company_name,email,phone,city,state,salesperson_id,created_by,last_interaction_at,created_at")
    .order("company_name", { ascending: true })
    .limit(limit);
  q = scopeOwn(q, "salesperson_id", ctx, args.scope);
  if (args.search) {
    const like = `%${args.search}%`;
    q = q.or(`name.ilike.${like},company_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`);
  }
  const { data, error } = await q;
  if (error) return errEnv("clients", error.message);
  return okEnv("clients", {
    columns: ["company_name", "name", "city", "state", "email", "phone"],
    rows: data ?? [],
    count: data?.length ?? 0,
  });
}

export async function searchClients(ctx: CrmCtx, args: { query: string; limit?: number }): Promise<CrmEnvelope> {
  const limit = Math.min(args.limit ?? 20, 50);
  const like = `%${args.query}%`;
  const { data, error } = await ctx.supabase
    .from("clients")
    .select("id,name,company_name,email,phone,city,state,cpf_cnpj,created_at")
    .or(`name.ilike.${like},company_name.ilike.${like},email.ilike.${like},phone.ilike.${like},city.ilike.${like},cpf_cnpj.ilike.${like}`)
    .limit(limit);
  if (error) return errEnv("clients", error.message);
  return okEnv("clients", { rows: data ?? [], count: data?.length ?? 0 });
}

export async function getCustomerHistory(ctx: CrmCtx, args: { client_id?: string; client_name?: string }): Promise<CrmEnvelope> {
  if (!args.client_id && !args.client_name) return errEnv("client_history", "Informe client_id ou client_name");
  let client: any = null;
  if (args.client_id) {
    const { data } = await ctx.supabase.from("clients").select("*").eq("id", args.client_id).maybeSingle();
    client = data;
  } else {
    const { data } = await ctx.supabase.from("clients").select("*").ilike("name", `%${args.client_name}%`).limit(1).maybeSingle();
    client = data;
  }
  if (!client) return errEnv("client_history", "Cliente não encontrado");
  const [q, c, f] = await Promise.all([
    ctx.supabase.from("quotes").select("id,quote_number,status,total,total_amount,created_at").eq("client_id", client.id).order("created_at", { ascending: false }).limit(50),
    ctx.supabase.from("generated_contracts").select("id,status,created_at").eq("client_id", client.id).order("created_at", { ascending: false }).limit(20),
    ctx.supabase.from("financial_records").select("id,status,amount,due_date").eq("client_id", client.id).order("due_date", { ascending: false }).limit(50),
  ]);
  return okEnv("client_history", {
    data: { client, quotes: q.data ?? [], contracts: c.data ?? [], financial: f.data ?? [] },
  });
}

// -----------------------------------------------------------------
// Products
// -----------------------------------------------------------------
export async function searchProducts(ctx: CrmCtx, args: { query?: string; search?: string; brand?: string; category?: string; limit?: number } = {}): Promise<CrmEnvelope> {
  const term = args.query ?? args.search;
  const limit = Math.min(args.limit ?? 25, 200);
  let q = ctx.supabase
    .from("products")
    .select("id,name,code,sku,brand,category_principal,price,level")
    .order("name", { ascending: true })
    .limit(limit);
  if (term) {
    const like = `%${term}%`;
    q = q.or(`name.ilike.${like},code.ilike.${like},sku.ilike.${like},brand.ilike.${like},description.ilike.${like}`);
  }
  if (args.brand) q = q.ilike("brand", `%${args.brand}%`);
  if (args.category) q = q.ilike("category_principal", `%${args.category}%`);
  const { data, error } = await q;
  if (error) return errEnv("products", error.message);
  return okEnv("products", {
    columns: ["name", "code", "brand", "category_principal", "price"],
    rows: data ?? [],
    count: data?.length ?? 0,
  });
}

export async function getProductDetails(ctx: CrmCtx, args: { id: string }): Promise<CrmEnvelope> {
  const { data, error } = await ctx.supabase.from("products").select("*").eq("id", args.id).maybeSingle();
  if (error) return errEnv("product", error.message);
  if (!data) return errEnv("product", "Produto não encontrado");
  return okEnv("product", { data });
}

// -----------------------------------------------------------------
// Quotes
// -----------------------------------------------------------------
export async function listQuotes(ctx: CrmCtx, args: { status?: string; limit?: number; scope?: string } = {}): Promise<CrmEnvelope> {
  const limit = Math.min(args.limit ?? 25, 200);
  let q = ctx.supabase
    .from("quotes")
    .select("id,quote_number,client_name,status,total,total_amount,created_at,created_by")
    .order("quote_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  q = scopeOwn(q, "created_by", ctx, args.scope);
  if (args.status) q = q.eq("status", args.status);
  const { data, error } = await q;
  if (error) return errEnv("quotes", error.message);
  return okEnv("quotes", {
    columns: ["quote_number", "client_name", "total_amount", "status", "created_at"],
    rows: data ?? [],
    count: data?.length ?? 0,
  });
}

export async function searchQuotes(ctx: CrmCtx, args: { client_name?: string; status?: string; from?: string; to?: string; limit?: number; scope?: string }): Promise<CrmEnvelope> {
  const limit = Math.min(args.limit ?? 25, 200);
  let q = ctx.supabase
    .from("quotes")
    .select("id,quote_number,client_name,status,total,total_amount,created_at,created_by")
    .order("created_at", { ascending: false })
    .limit(limit);
  q = scopeOwn(q, "created_by", ctx, args.scope);
  if (args.client_name) q = q.ilike("client_name", `%${args.client_name}%`);
  if (args.status) q = q.eq("status", args.status);
  if (args.from) q = q.gte("created_at", args.from);
  if (args.to) q = q.lte("created_at", args.to);
  const { data, error } = await q;
  if (error) return errEnv("quotes", error.message);
  return okEnv("quotes", { rows: data ?? [], count: data?.length ?? 0 });
}

// -----------------------------------------------------------------
// Pipeline / Dashboard / Sales metrics
// -----------------------------------------------------------------
export async function getPipeline(ctx: CrmCtx, args: { scope?: string } = {}): Promise<CrmEnvelope> {
  let q = ctx.supabase
    .from("quotes")
    .select("id,quote_number,client_name,status,total,total_amount,created_at,created_by")
    .in("status", ["draft", "sent", "negotiation", "negociacao", "pre_sale", "contact_made"])
    .order("created_at", { ascending: false })
    .limit(500);
  q = scopeOwn(q, "created_by", ctx, args.scope);
  const { data, error } = await q;
  if (error) return errEnv("pipeline", error.message);
  const byStage: Record<string, { count: number; value: number; items: any[] }> = {};
  for (const r of data ?? []) {
    const s = (r as any).status ?? "sem_status";
    byStage[s] ??= { count: 0, value: 0, items: [] };
    byStage[s].count += 1;
    byStage[s].value += Number((r as any).total_amount ?? (r as any).total ?? 0);
    if (byStage[s].items.length < 20) byStage[s].items.push(r);
  }
  return okEnv("pipeline", { summary: byStage, rows: data ?? [], count: data?.length ?? 0 });
}

export async function getDashboard(ctx: CrmCtx): Promise<CrmEnvelope> {
  const [clientsRes, quotesRes] = await Promise.all([
    ctx.supabase.from("clients").select("id", { count: "exact", head: true }),
    ctx.supabase.from("quotes").select("status,total,total_amount,created_at").limit(2000),
  ]);
  if (quotesRes.error) return errEnv("dashboard", quotesRes.error.message);
  const byStatus: Record<string, { count: number; total: number }> = {};
  let grand = 0;
  for (const q of quotesRes.data ?? []) {
    const s = (q as any).status ?? "sem_status";
    const v = Number((q as any).total_amount ?? (q as any).total ?? 0);
    byStatus[s] ??= { count: 0, total: 0 };
    byStatus[s].count += 1;
    byStatus[s].total += v;
    grand += v;
  }
  return okEnv("dashboard", {
    summary: {
      total_clients: clientsRes.count ?? 0,
      total_quotes: quotesRes.data?.length ?? 0,
      forecast_total: grand,
      quotes_by_status: byStatus,
    },
  });
}

export async function getSalesMetrics(ctx: CrmCtx, args: { from?: string; to?: string; days_back?: number; scope?: string } = {}): Promise<CrmEnvelope> {
  const from = args.from ?? (args.days_back ? new Date(Date.now() - args.days_back * 86400000).toISOString() : undefined);
  let q = ctx.supabase
    .from("quotes")
    .select("id,status,total,total_amount,client_name,created_at,created_by")
    .in("status", APPROVED_STATUSES)
    .limit(5000);
  q = scopeOwn(q, "created_by", ctx, args.scope);
  if (from) q = q.gte("created_at", from);
  if (args.to) q = q.lte("created_at", args.to);
  const { data, error } = await q;
  if (error) return errEnv("sales_metrics", error.message);
  const total = (data ?? []).reduce((s: number, r: any) => s + Number(r.total_amount ?? r.total ?? 0), 0);
  const count = data?.length ?? 0;
  return okEnv("sales_metrics", {
    summary: {
      approved_count: count,
      revenue_total: total,
      average_ticket: count ? total / count : 0,
      period: { from: from ?? null, to: args.to ?? null },
    },
  });
}

// -----------------------------------------------------------------
// Top products (produtos mais vendidos)
// -----------------------------------------------------------------
export async function getTopProducts(ctx: CrmCtx, args: {
  from?: string; to?: string; days_back?: number;
  metric?: "quantity" | "revenue"; limit?: number;
  brand?: string; scope?: string;
} = {}): Promise<CrmEnvelope> {
  const limit = Math.min(args.limit ?? 10, 50);
  const metric = args.metric ?? "revenue";
  const from = args.from ?? (args.days_back ? new Date(Date.now() - args.days_back * 86400000).toISOString() : undefined);

  // Human-friendly period label (never expose raw JSON to the UI)
  const fmtDate = (iso: string) => {
    try { const d = new Date(iso); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`; } catch { return iso; }
  };
  let periodLabel = "Todo o histórico";
  if (args.days_back) periodLabel = `Últimos ${args.days_back} dias`;
  else if (from && args.to) periodLabel = `${fmtDate(from)} até ${fmtDate(args.to)}`;
  else if (from) {
    const d = new Date(from); const now = new Date();
    if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === 1) periodLabel = "Este mês";
    else if (d.getFullYear() === now.getFullYear() && d.getMonth() === 0 && d.getDate() === 1) periodLabel = "Este ano";
    else periodLabel = `A partir de ${fmtDate(from)}`;
  } else if (args.to) periodLabel = `Até ${fmtDate(args.to)}`;

  // 1) approved quotes (RLS-scoped) matching filters
  let qq = ctx.supabase
    .from("quotes")
    .select("id,created_by,created_at,status")
    .in("status", APPROVED_STATUSES)
    .limit(5000);
  qq = scopeOwn(qq, "created_by", ctx, args.scope);
  if (from) qq = qq.gte("created_at", from);
  if (args.to) qq = qq.lte("created_at", args.to);
  const { data: quotes, error: qErr } = await qq;
  if (qErr) return errEnv("top_products", qErr.message);
  if (!quotes || quotes.length === 0) {
    return okEnv("top_products", { rows: [], count: 0, summary: { metric, period_label: periodLabel, approved_quotes_scanned: 0 } });
  }
  const quoteIds = quotes.map((q: any) => q.id);

  // 2) aggregate items (quote_items has no product_id → key by code/description)
  let ii = ctx.supabase
    .from("quote_items")
    .select("quote_id,code,product_code,description,brand,quantity,line_total,total_price,unit_total,unit_price,image_url,model")
    .in("quote_id", quoteIds)
    .limit(20000);
  if (args.brand) ii = ii.ilike("brand", `%${args.brand}%`);
  const { data: items, error: iErr } = await ii;
  if (iErr) return errEnv("top_products", iErr.message);

  const looksLikeName = (s: any) => typeof s === "string" && s.trim().length >= 3 && !/^\d+$/.test(s.trim());
  const agg: Record<string, {
    key: string; code: string | null; itemName: string | null; itemBrand: string | null;
    itemImage: string | null; quantity: number; revenue: number; quotes: Set<string>;
  }> = {};
  for (const it of items ?? []) {
    const code = ((it as any).product_code || (it as any).code || "").toString().trim() || null;
    const rawDesc = ((it as any).description || "").toString().trim();
    const itemName = looksLikeName(rawDesc) ? rawDesc : null;
    const key = (code || itemName || rawDesc || "sem-chave").toLowerCase();
    const qty = Number((it as any).quantity ?? 0);
    const rev = Number((it as any).line_total ?? (it as any).total_price ?? (it as any).unit_total ?? (Number((it as any).unit_price ?? 0) * qty));
    agg[key] ??= { key, code, itemName, itemBrand: (it as any).brand ?? null, itemImage: (it as any).image_url ?? null, quantity: 0, revenue: 0, quotes: new Set() };
    agg[key].quantity += qty;
    agg[key].revenue += rev;
    agg[key].quotes.add((it as any).quote_id);
  }

  // 3) enrich with real products table (name/brand/sku/image_url/id) — batch by code/sku
  const codes = Array.from(new Set(Object.values(agg).map((r) => r.code).filter(Boolean))) as string[];
  const productByCode: Record<string, any> = {};
  const productBySku: Record<string, any> = {};
  if (codes.length > 0) {
    const chunk = 200;
    for (let i = 0; i < codes.length; i += chunk) {
      const slice = codes.slice(i, i + chunk);
      const { data: prods } = await ctx.supabase
        .from("products")
        .select("id,name,brand,sku,code,image_url")
        .or(`code.in.(${slice.map((c) => `"${c.replace(/"/g, "")}"`).join(",")}),sku.in.(${slice.map((c) => `"${c.replace(/"/g, "")}"`).join(",")})`);
      for (const p of prods ?? []) {
        if (p.code) productByCode[String(p.code).toLowerCase()] = p;
        if (p.sku) productBySku[String(p.sku).toLowerCase()] = p;
      }
    }
  }

  const totalRevenue = Object.values(agg).reduce((s, r) => s + r.revenue, 0);
  const totalQty = Object.values(agg).reduce((s, r) => s + r.quantity, 0);

  const rows = Object.values(agg)
    .map((r) => {
      const codeKey = r.code?.toLowerCase();
      const prod = (codeKey && (productByCode[codeKey] || productBySku[codeKey])) || null;
      // Name priority: 1) products.name  2) item description (only if it's a real name)  3) fallback
      const name = (prod?.name && String(prod.name).trim())
        || (r.itemName && String(r.itemName).trim())
        || "Produto sem nome cadastrado";
      const brand = prod?.brand || r.itemBrand || null;
      const sku = prod?.sku || null;
      const image_url = prod?.image_url || r.itemImage || null;
      const avg = r.quantity > 0 ? r.revenue / r.quantity : 0;
      const share = metric === "quantity"
        ? (totalQty > 0 ? (r.quantity / totalQty) * 100 : 0)
        : (totalRevenue > 0 ? (r.revenue / totalRevenue) * 100 : 0);
      return {
        product_id: prod?.id ?? null,
        product_code: prod?.code ?? r.code ?? null,
        sku,
        product_name: name,
        brand,
        image_url,
        quantity_sold: r.quantity,
        revenue: r.revenue,
        approved_quotes_count: r.quotes.size,
        average_price: avg,
        share_pct: Number(share.toFixed(2)),
      };
    })
    .sort((a, b) => metric === "quantity" ? b.quantity_sold - a.quantity_sold : b.revenue - a.revenue)
    .slice(0, limit)
    .map((r, idx) => ({ ranking_position: idx + 1, ...r }));

  return okEnv("top_products", {
    columns: ["ranking_position", "image_url", "product_name", "brand", "sku", "quantity_sold", "revenue", "approved_quotes_count", "average_price", "share_pct"],
    rows,
    count: rows.length,
    summary: { metric, period_label: periodLabel, approved_quotes_scanned: quotes.length },
  });
}

// -----------------------------------------------------------------
// Top brands (marcas mais vendidas — apenas orçamentos aprovados)
// -----------------------------------------------------------------
export async function getTopBrands(ctx: CrmCtx, args: {
  from?: string; to?: string; days_back?: number; limit?: number; scope?: string;
} = {}): Promise<CrmEnvelope> {
  const limit = Math.min(args.limit ?? 10, 50);
  const from = args.from ?? (args.days_back ? new Date(Date.now() - args.days_back * 86400000).toISOString() : undefined);
  const fmtDate = (iso: string) => { try { const d = new Date(iso); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`; } catch { return iso; } };
  let periodLabel = "Todo o histórico";
  if (args.days_back) periodLabel = `Últimos ${args.days_back} dias`;
  else if (from && args.to) periodLabel = `${fmtDate(from)} até ${fmtDate(args.to)}`;
  else if (from) periodLabel = `A partir de ${fmtDate(from)}`;

  let qq = ctx.supabase.from("quotes").select("id,client_id,created_by,created_at,status").in("status", APPROVED_STATUSES).limit(5000);
  qq = scopeOwn(qq, "created_by", ctx, args.scope);
  if (from) qq = qq.gte("created_at", from);
  if (args.to) qq = qq.lte("created_at", args.to);
  const { data: quotes, error: qErr } = await qq;
  if (qErr) return errEnv("top_brands", qErr.message);
  if (!quotes?.length) return okEnv("top_brands", { rows: [], count: 0, summary: { period_label: periodLabel } });

  const quoteIds = quotes.map((q: any) => q.id);
  const clientByQuote: Record<string, string | null> = {};
  quotes.forEach((q: any) => { clientByQuote[q.id] = q.client_id ?? null; });

  const { data: items, error: iErr } = await ctx.supabase
    .from("quote_items")
    .select("quote_id,brand,product_code,code,quantity,line_total,total_price,unit_total,unit_price")
    .in("quote_id", quoteIds).limit(20000);
  if (iErr) return errEnv("top_brands", iErr.message);

  const codes = Array.from(new Set((items ?? []).map((it: any) => (it.product_code || it.code || "").toString().trim().toLowerCase()).filter(Boolean))) as string[];
  const brandByCode: Record<string, string> = {};
  if (codes.length) {
    for (let i = 0; i < codes.length; i += 200) {
      const slice = codes.slice(i, i + 200);
      const { data: prods } = await ctx.supabase.from("products").select("code,sku,brand")
        .or(`code.in.(${slice.map(c => `"${c.replace(/"/g,"")}"`).join(",")}),sku.in.(${slice.map(c => `"${c.replace(/"/g,"")}"`).join(",")})`);
      for (const p of prods ?? []) {
        if (p.brand) {
          if (p.code) brandByCode[String(p.code).toLowerCase()] = p.brand;
          if (p.sku) brandByCode[String(p.sku).toLowerCase()] = p.brand;
        }
      }
    }
  }

  const agg: Record<string, { brand: string; quantity: number; revenue: number; quotes: Set<string>; clients: Set<string> }> = {};
  for (const it of items ?? []) {
    const rawCode = ((it as any).product_code || (it as any).code || "").toString().trim().toLowerCase();
    const brand = ((it as any).brand?.toString().trim()) || brandByCode[rawCode] || null;
    if (!brand) continue;
    const key = brand.toLowerCase();
    const qty = Number((it as any).quantity ?? 0);
    const rev = Number((it as any).line_total ?? (it as any).total_price ?? (it as any).unit_total ?? (Number((it as any).unit_price ?? 0) * qty));
    agg[key] ??= { brand, quantity: 0, revenue: 0, quotes: new Set(), clients: new Set() };
    agg[key].quantity += qty;
    agg[key].revenue += rev;
    agg[key].quotes.add((it as any).quote_id);
    const cid = clientByQuote[(it as any).quote_id];
    if (cid) agg[key].clients.add(cid);
  }

  const totalRev = Object.values(agg).reduce((s, r) => s + r.revenue, 0);
  const rows = Object.values(agg)
    .map(r => ({
      brand: r.brand,
      quantity_sold: r.quantity,
      revenue: r.revenue,
      approved_quotes_count: r.quotes.size,
      customer_count: r.clients.size,
      participation_percentage: totalRev > 0 ? Number(((r.revenue / totalRev) * 100).toFixed(2)) : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);

  return okEnv("top_brands", {
    columns: ["brand", "quantity_sold", "revenue", "customer_count", "approved_quotes_count", "participation_percentage"],
    rows, count: rows.length,
    summary: { period_label: periodLabel, approved_quotes_scanned: quotes.length },
  });
}

// -----------------------------------------------------------------
// Inactive clients (clientes sem compra aprovada há X dias)
// -----------------------------------------------------------------
export async function getInactiveClients(ctx: CrmCtx, args: {
  inactive_days?: number; minimum_revenue?: number; limit?: number; scope?: string;
  period_start?: string; period_end?: string;
} = {}): Promise<CrmEnvelope> {
  const inactiveDays = args.inactive_days ?? 90;
  const minRevenue = args.minimum_revenue ?? 0;
  const limit = Math.min(args.limit ?? 20, 100);
  const cutoff = new Date(Date.now() - inactiveDays * 86400000);

  let qq = ctx.supabase.from("quotes")
    .select("id,client_id,client_name,total,total_amount,approved_at,created_at,created_by,salesperson,status")
    .in("status", APPROVED_STATUSES).limit(10000);
  qq = scopeOwn(qq, "created_by", ctx, args.scope);
  if (args.period_start) qq = qq.gte("created_at", args.period_start);
  if (args.period_end) qq = qq.lte("created_at", args.period_end);
  const { data: quotes, error } = await qq;
  if (error) return errEnv("inactive_clients", error.message);

  const map = new Map<string, { client_id: string; client_name: string; last: Date; count: number; revenue: number; seller: string | null }>();
  for (const q of quotes ?? []) {
    const cid = (q as any).client_id;
    if (!cid) continue;
    const d = new Date((q as any).approved_at || (q as any).created_at);
    const v = Number((q as any).total_amount ?? (q as any).total ?? 0);
    const cur = map.get(cid);
    if (!cur) map.set(cid, { client_id: cid, client_name: (q as any).client_name || "Sem cliente", last: d, count: 1, revenue: v, seller: (q as any).salesperson ?? null });
    else { cur.count++; cur.revenue += v; if (d > cur.last) cur.last = d; }
  }

  const rows = Array.from(map.values())
    .filter(r => r.last < cutoff && r.revenue >= minRevenue)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit)
    .map(r => {
      const days = Math.floor((Date.now() - r.last.getTime()) / 86400000);
      return {
        client_id: r.client_id,
        client_name: r.client_name,
        last_purchase_date: r.last.toISOString(),
        days_inactive: days,
        total_revenue: r.revenue,
        total_purchases: r.count,
        seller_name: r.seller,
        recommended_action: days >= 180 ? "Reengajamento urgente" : "Follow-up comercial",
      };
    });

  return okEnv("inactive_clients", {
    columns: ["client_name", "last_purchase_date", "days_inactive", "total_revenue", "total_purchases", "seller_name", "recommended_action"],
    rows, count: rows.length,
    summary: { inactive_days: inactiveDays, minimum_revenue: minRevenue },
  });
}

// -----------------------------------------------------------------
// Repurchase window (janela de recompra baseada em intervalo médio)
// -----------------------------------------------------------------
export async function getRepurchaseWindow(ctx: CrmCtx, args: {
  min_purchases?: number; tolerance_pct?: number; limit?: number; scope?: string;
} = {}): Promise<CrmEnvelope> {
  const minPurchases = Math.max(args.min_purchases ?? 2, 2);
  const tol = args.tolerance_pct ?? 0.3;
  const limit = Math.min(args.limit ?? 20, 100);

  let qq = ctx.supabase.from("quotes")
    .select("id,client_id,client_name,total,total_amount,approved_at,created_at,created_by,status")
    .in("status", APPROVED_STATUSES).limit(10000);
  qq = scopeOwn(qq, "created_by", ctx, args.scope);
  const { data: quotes, error } = await qq;
  if (error) return errEnv("repurchase_window", error.message);

  const map = new Map<string, { client_id: string; client_name: string; dates: Date[] }>();
  for (const q of quotes ?? []) {
    const cid = (q as any).client_id;
    if (!cid) continue;
    const d = new Date((q as any).approved_at || (q as any).created_at);
    const cur = map.get(cid);
    if (!cur) map.set(cid, { client_id: cid, client_name: (q as any).client_name || "Sem cliente", dates: [d] });
    else cur.dates.push(d);
  }

  const now = Date.now();
  const rows: any[] = [];
  for (const r of map.values()) {
    if (r.dates.length < minPurchases) continue;
    r.dates.sort((a, b) => a.getTime() - b.getTime());
    const first = r.dates[0], last = r.dates[r.dates.length - 1];
    const avgDays = Math.round((last.getTime() - first.getTime()) / 86400000 / (r.dates.length - 1));
    if (avgDays <= 0) continue;
    const expected = new Date(last.getTime() + avgDays * 86400000);
    const daysUntil = Math.floor((expected.getTime() - now) / 86400000);
    const daysSinceLast = Math.floor((now - last.getTime()) / 86400000);
    const inWindow = daysSinceLast >= avgDays * (1 - tol) && daysSinceLast <= avgDays * (1 + tol);
    if (!inWindow) continue;
    const confidence = r.dates.length >= 4 ? "alta" : r.dates.length >= 3 ? "média" : "baixa";
    rows.push({
      client_id: r.client_id,
      client_name: r.client_name,
      last_purchase_date: last.toISOString(),
      average_purchase_interval_days: avgDays,
      expected_repurchase_date: expected.toISOString(),
      days_until_repurchase: daysUntil,
      confidence,
      recommended_action: daysUntil <= 0 ? "Abordagem imediata" : "Preparar oferta",
    });
  }
  rows.sort((a, b) => a.days_until_repurchase - b.days_until_repurchase);
  return okEnv("repurchase_window", {
    columns: ["client_name", "last_purchase_date", "average_purchase_interval_days", "expected_repurchase_date", "days_until_repurchase", "confidence", "recommended_action"],
    rows: rows.slice(0, limit), count: Math.min(rows.length, limit),
    summary: { min_purchases: minPurchases, tolerance_pct: tol },
  });
}


// -----------------------------------------------------------------
// Commercial overview — payload agregado usado pela página
// Inteligência Comercial. Substitui o loadCommercialData no frontend.
// -----------------------------------------------------------------
const COUNTABLE_STATUSES = new Set(APPROVED_STATUSES);

export async function getCommercialOverview(ctx: CrmCtx, args: { scope?: string; limit?: number } = {}): Promise<CrmEnvelope> {
  const role = ctx.profile?.role;
  const canSeeAll = role === "admin" || role === "gestor";
  const wantsTeam = canSeeAll && (args.scope ?? "team") !== "own";
  const limit = Math.min(args.limit ?? 5000, 10000);

  let qq = ctx.supabase
    .from("quotes")
    .select("id, quote_number, client_id, client_name, salesperson, salesperson_id, created_by, status, payment_status, total_amount, total, approved_at, created_at, is_demonstration")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (!wantsTeam) qq = qq.eq("created_by", ctx.userId);
  const { data: quotesRaw, error: qErr } = await qq;
  if (qErr) return errEnv("commercial_overview", qErr.message);

  const validQuotes = (quotesRaw ?? []).filter((q: any) => {
    if (q.is_demonstration) return false;
    const s = (q.status ?? "").toLowerCase().trim();
    return COUNTABLE_STATUSES.has(s);
  });

  const [clientsRes, productsRes, profilesRes] = await Promise.all([
    ctx.supabase.from("clients").select("id, name, company_name, contact_name, email, phone, contact_phone, city, state, cpf_cnpj, created_by"),
    ctx.supabase.from("products").select("id, name, brand, code, sku"),
    wantsTeam
      ? ctx.supabase.from("profiles").select("user_id, full_name, active").eq("active", true)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (clientsRes.error) return errEnv("commercial_overview", clientsRes.error.message);
  if (productsRes.error) return errEnv("commercial_overview", productsRes.error.message);
  if ((profilesRes as any).error) return errEnv("commercial_overview", (profilesRes as any).error.message);

  const clients: Record<string, any> = {};
  for (const c of (clientsRes.data ?? [])) clients[(c as any).id] = c;

  const quoteIds = validQuotes.map((q: any) => q.id);
  const items: any[] = [];
  const CHUNK = 200;
  for (let i = 0; i < quoteIds.length; i += CHUNK) {
    const slice = quoteIds.slice(i, i + CHUNK);
    const { data, error } = await ctx.supabase
      .from("quote_items")
      .select("quote_id, code, product_code, description, brand, model, quantity, unit_price, total_price, line_total, unit_total")
      .in("quote_id", slice);
    if (error) return errEnv("commercial_overview", error.message);
    if (data) items.push(...data);
  }

  const sellerProfiles = ((profilesRes as any).data ?? []).map((p: any) => ({
    user_id: p.user_id,
    full_name: p.full_name || "Vendedor",
  }));

  return okEnv("commercial_overview", {
    data: {
      quotes: validQuotes,
      clients,
      items,
      products: productsRes.data ?? [],
      sellerProfiles,
      loadedAt: Date.now(),
      scope: wantsTeam ? "team" : "own",
    },
    summary: {
      quotes_count: validQuotes.length,
      items_count: items.length,
      clients_count: Object.keys(clients).length,
      scope: wantsTeam ? "team" : "own",
    },
  });
}

// -----------------------------------------------------------------
// Client Ranking — server-side aggregation used pela aba Rankings
// -----------------------------------------------------------------
export async function getClientRanking(
  ctx: CrmCtx,
  args: {
    scope?: string;
    period_days?: number | "all";
    seller_id?: string;
    state?: string;
    city?: string;
    only_recurrent?: boolean;
    active_filter?: "all" | "active" | "inactive";
    limit?: number;
  } = {},
): Promise<CrmEnvelope> {
  const overview = await getCommercialOverview(ctx, { scope: args.scope });
  if (!overview.ok) return overview;

  const payload: any = overview.data ?? {};
  const quotes: any[] = payload.quotes ?? [];
  const clients: Record<string, any> = payload.clients ?? {};
  const items: any[] = payload.items ?? [];
  const products: any[] = payload.products ?? [];

  const productByCode = new Map<string, any>();
  for (const p of products) {
    if (p?.code) productByCode.set(String(p.code).toLowerCase(), p);
    if (p?.sku) productByCode.set(String(p.sku).toLowerCase(), p);
  }

  const itemsByQuote = new Map<string, any[]>();
  for (const it of items) {
    const arr = itemsByQuote.get(it.quote_id) ?? [];
    arr.push(it);
    itemsByQuote.set(it.quote_id, arr);
  }

  const now = Date.now();
  const period = args.period_days === "all" || !args.period_days ? null : Number(args.period_days);
  const filtered = quotes.filter((q) => {
    if (period != null) {
      const d = new Date(q.approved_at || q.created_at).getTime();
      if (now - d > period * 86400000) return false;
    }
    if (args.seller_id && args.seller_id !== "all") {
      if (q.salesperson_id !== args.seller_id && q.created_by !== args.seller_id) return false;
    }
    if (args.state && args.state !== "all") {
      const c = q.client_id ? clients[q.client_id] : null;
      if ((c?.state ?? "") !== args.state) return false;
    }
    if (args.city && args.city !== "all") {
      const c = q.client_id ? clients[q.client_id] : null;
      if ((c?.city ?? "") !== args.city) return false;
    }
    return true;
  });

  const itemValue = (it: any) => {
    const tp = Number(it.total_price || 0); if (tp > 0) return tp;
    const lt = Number(it.line_total || 0); if (lt > 0) return lt;
    const ut = Number(it.unit_total || 0); if (ut > 0) return ut;
    const up = Number(it.unit_price || 0);
    const qty = Number(it.quantity || 0) || 1;
    return up * qty;
  };
  const qValue = (q: any) => Number(q.total_amount ?? q.total ?? 0);

  const map = new Map<string, any>();
  for (const q of filtered) {
    const cid = q.client_id || `__${q.client_name || "sem"}`;
    const c = q.client_id ? clients[q.client_id] ?? null : null;
    let a = map.get(cid);
    if (!a) {
      a = {
        client_id: cid,
        client_name: c?.company_name || c?.name || q.client_name || "Sem cliente",
        cnpj: c?.cpf_cnpj || "",
        city: c?.city || "",
        state: c?.state || "",
        salesperson: q.salesperson || "",
        quotes_count: 0,
        total_value: 0,
        received_value: 0,
        first_purchase: null as string | null,
        last_purchase: null as string | null,
        monthly: {} as Record<string, number>,
        brands: {} as Record<string, number>,
        products: {} as Record<string, { qty: number; value: number; name: string; brand: string }>,
      };
      map.set(cid, a);
    }
    const val = qValue(q);
    const dateStr = q.approved_at || q.created_at;
    const d = new Date(dateStr);
    a.quotes_count += 1;
    a.total_value += val;
    if ((q.payment_status ?? "").toLowerCase() === "liquidado") a.received_value += val;
    if (!a.first_purchase || d < new Date(a.first_purchase)) a.first_purchase = dateStr;
    if (!a.last_purchase || d > new Date(a.last_purchase)) a.last_purchase = dateStr;
    const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    a.monthly[mk] = (a.monthly[mk] || 0) + val;
    for (const it of (itemsByQuote.get(q.id) ?? [])) {
      const rawCode = String(it.code || it.product_code || "").trim();
      const prod = rawCode ? productByCode.get(rawCode.toLowerCase()) : undefined;
      const desc = (it.description || "").trim();
      const name = prod?.name?.trim() || desc || rawCode || "Item sem nome";
      const brand = (prod?.brand?.trim() || it.brand || "Sem marca");
      const v = itemValue(it);
      a.brands[brand] = (a.brands[brand] || 0) + v;
      const key = (rawCode || desc || name).toLowerCase();
      if (!a.products[key]) a.products[key] = { qty: 0, value: 0, name, brand };
      a.products[key].qty += Number(it.quantity || 0);
      a.products[key].value += v;
    }
  }

  const rows = Array.from(map.values()).map((a) => {
    const ticket = a.quotes_count ? a.total_value / a.quotes_count : 0;
    const lastDate = a.last_purchase ? new Date(a.last_purchase) : null;
    const firstDate = a.first_purchase ? new Date(a.first_purchase) : null;
    const daysSinceLast = lastDate ? Math.floor((now - lastDate.getTime()) / 86400000) : null;
    const intervalAvgDays = (firstDate && lastDate && a.quotes_count > 1)
      ? Math.round(Math.floor((lastDate.getTime() - firstDate.getTime()) / 86400000) / (a.quotes_count - 1))
      : null;
    const isActive = (daysSinceLast ?? 9999) <= 90;
    const isRecurrent = a.quotes_count >= 2;
    const status = (daysSinceLast ?? 9999) <= 30 ? "verde" : (daysSinceLast ?? 9999) <= 90 ? "amarelo" : "vermelho";
    const topProducts = Object.values(a.products)
      .sort((x: any, y: any) => y.value - x.value)
      .slice(0, 5);
    return {
      ...a,
      ticket_medio: ticket,
      days_since_last: daysSinceLast,
      interval_avg_days: intervalAvgDays,
      is_active: isActive,
      is_recurrent: isRecurrent,
      status,
      top_products: topProducts,
    };
  }).filter((a) => {
    if (args.only_recurrent && !a.is_recurrent) return false;
    if (args.active_filter === "active" && !a.is_active) return false;
    if (args.active_filter === "inactive" && a.is_active) return false;
    return true;
  }).sort((x, y) => y.total_value - x.total_value);

  const limit = Math.min(args.limit ?? 500, 2000);
  const trimmed = rows.slice(0, limit);

  return okEnv("client_ranking", {
    rows: trimmed,
    count: trimmed.length,
    summary: {
      total_clients: rows.length,
      active_clients: rows.filter((a) => a.is_active).length,
      recurrent_clients: rows.filter((a) => a.is_recurrent).length,
      total_revenue: rows.reduce((s, a) => s + a.total_value, 0),
      period_days: args.period_days ?? "all",
      scope: payload.scope,
    },
  });
}

// -----------------------------------------------------------------
// Follow-ups / Tasks
// -----------------------------------------------------------------
export async function getFollowups(ctx: CrmCtx, args: { days_without_contact?: number; limit?: number } = {}): Promise<CrmEnvelope> {
  const days = args.days_without_contact ?? 30;
  const limit = Math.min(args.limit ?? 25, 200);
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const { data, error } = await ctx.supabase
    .from("clients")
    .select("id,name,company_name,email,phone,last_interaction_at")
    .or(`last_interaction_at.lt.${cutoff},last_interaction_at.is.null`)
    .order("last_interaction_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) return errEnv("followups", error.message);
  return okEnv("followups", {
    columns: ["company_name", "name", "phone", "last_interaction_at"],
    rows: data ?? [],
    count: data?.length ?? 0,
  });
}

export async function getTasks(ctx: CrmCtx, args: { status?: string; overdue_only?: boolean; limit?: number } = {}): Promise<CrmEnvelope> {
  const limit = Math.min(args.limit ?? 25, 200);
  let q = ctx.supabase
    .from("tasks")
    .select("id,title,description,status,priority,due_date,client_id,user_id,created_at")
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(limit);
  if (args.status) q = q.eq("status", args.status);
  if (args.overdue_only) q = q.lt("due_date", new Date().toISOString()).neq("status", "done");
  const { data, error } = await q;
  if (error) return errEnv("tasks", error.message);
  return okEnv("tasks", {
    columns: ["title", "due_date", "status", "priority"],
    rows: data ?? [],
    count: data?.length ?? 0,
  });
}

export async function getContracts(ctx: CrmCtx, args: { status?: string; limit?: number } = {}): Promise<CrmEnvelope> {
  const limit = Math.min(args.limit ?? 25, 200);
  let q = ctx.supabase
    .from("generated_contracts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (args.status) q = q.eq("status", args.status);
  const { data, error } = await q;
  if (error) return errEnv("contracts", error.message);
  return okEnv("contracts", { rows: data ?? [], count: data?.length ?? 0 });
}

// -----------------------------------------------------------------
// Tool Registry — single source used by MCP AND assistant-commercial
// -----------------------------------------------------------------
export type ToolDef = {
  name: string;
  description: string;
  parameters: any; // JSON schema
  handler: (ctx: CrmCtx, args: any) => Promise<CrmEnvelope>;
  readOnly: true;
  aliases?: string[];
};

export const TOOL_REGISTRY: Record<string, ToolDef> = {
  list_clients: {
    name: "list_clients",
    description: "Lista clientes da carteira do usuário. Use scope='team' apenas se admin/gestor pedir a equipe inteira.",
    parameters: { type: "object", properties: { search: { type: "string" }, limit: { type: "number" }, scope: { type: "string", enum: ["own", "team"] } } },
    handler: listClients, readOnly: true, aliases: ["get_clients"],
  },
  search_clients: {
    name: "search_clients",
    description: "Busca clientes por nome, empresa, e-mail, telefone, cidade, CPF ou CNPJ.",
    parameters: { type: "object", required: ["query"], properties: { query: { type: "string" }, limit: { type: "number" } } },
    handler: searchClients, readOnly: true,
  },
  get_customer_history: {
    name: "get_customer_history",
    description: "Histórico completo de um cliente (orçamentos, contratos, financeiro).",
    parameters: { type: "object", properties: { client_id: { type: "string" }, client_name: { type: "string" } } },
    handler: getCustomerHistory, readOnly: true,
  },
  search_products: {
    name: "search_products",
    description: "Busca produtos por nome, código, SKU, marca, descrição ou categoria.",
    parameters: { type: "object", properties: { query: { type: "string" }, brand: { type: "string" }, category: { type: "string" }, limit: { type: "number" } } },
    handler: searchProducts, readOnly: true, aliases: ["get_products", "list_products"],
  },
  get_product_details: {
    name: "get_product_details",
    description: "Retorna todos os dados do produto MCI pelo id.",
    parameters: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    handler: getProductDetails, readOnly: true,
  },
  list_quotes: {
    name: "list_quotes",
    description: "Lista orçamentos da carteira do usuário. Aceita filtro por status.",
    parameters: { type: "object", properties: { status: { type: "string" }, limit: { type: "number" }, scope: { type: "string", enum: ["own", "team"] } } },
    handler: listQuotes, readOnly: true, aliases: ["get_quotes"],
  },
  search_quotes: {
    name: "search_quotes",
    description: "Busca orçamentos por cliente, status, período (from/to ISO).",
    parameters: { type: "object", properties: { client_name: { type: "string" }, status: { type: "string" }, from: { type: "string" }, to: { type: "string" }, limit: { type: "number" }, scope: { type: "string", enum: ["own", "team"] } } },
    handler: searchQuotes, readOnly: true,
  },
  get_pipeline: {
    name: "get_pipeline",
    description: "Orçamentos abertos agrupados por estágio do pipeline.",
    parameters: { type: "object", properties: { scope: { type: "string", enum: ["own", "team"] } } },
    handler: getPipeline, readOnly: true,
  },
  get_dashboard: {
    name: "get_dashboard",
    description: "Dashboard executivo: totais de clientes, orçamentos por status, valor previsto.",
    parameters: { type: "object", properties: {} },
    handler: getDashboard, readOnly: true,
  },
  get_sales_metrics: {
    name: "get_sales_metrics",
    description: "Métricas de vendas (orçamentos aprovados): receita total, ticket médio. Aceita from/to ou days_back.",
    parameters: { type: "object", properties: { from: { type: "string" }, to: { type: "string" }, days_back: { type: "number" }, scope: { type: "string", enum: ["own", "team"] } } },
    handler: getSalesMetrics, readOnly: true, aliases: ["get_metrics"],
  },
  get_top_products: {
    name: "get_top_products",
    description: "Ranking de produtos mais vendidos (apenas orçamentos aprovados). metric='quantity' ou 'revenue'.",
    parameters: {
      type: "object",
      properties: {
        from: { type: "string" }, to: { type: "string" }, days_back: { type: "number" },
        metric: { type: "string", enum: ["quantity", "revenue"] },
        brand: { type: "string" }, limit: { type: "number" },
        scope: { type: "string", enum: ["own", "team"] },
      },
    },
    handler: getTopProducts, readOnly: true,
  },
  get_followups: {
    name: "get_followups",
    description: "Clientes sem interação recente (default 30 dias) para follow-up.",
    parameters: { type: "object", properties: { days_without_contact: { type: "number" }, limit: { type: "number" } } },
    handler: getFollowups, readOnly: true,
  },
  get_tasks: {
    name: "get_tasks",
    description: "Lista tarefas do usuário. overdue_only=true traz apenas vencidas não concluídas.",
    parameters: { type: "object", properties: { status: { type: "string" }, overdue_only: { type: "boolean" }, limit: { type: "number" } } },
    handler: getTasks, readOnly: true,
  },
  get_contracts: {
    name: "get_contracts",
    description: "Lista contratos gerados e status de assinatura.",
    parameters: { type: "object", properties: { status: { type: "string" }, limit: { type: "number" } } },
    handler: getContracts, readOnly: true,
  },
  get_top_brands: {
    name: "get_top_brands",
    description: "Ranking de marcas mais vendidas (orçamentos aprovados). Retorna receita, unidades, clientes e participação %.",
    parameters: { type: "object", properties: { from: { type: "string" }, to: { type: "string" }, days_back: { type: "number" }, limit: { type: "number" }, scope: { type: "string", enum: ["own", "team"] } } },
    handler: getTopBrands, readOnly: true,
  },
  get_inactive_clients: {
    name: "get_inactive_clients",
    description: "Clientes sem compra aprovada há X dias (default 90). Retorna dias inativos, receita histórica, vendedor e ação recomendada.",
    parameters: { type: "object", properties: { inactive_days: { type: "number" }, minimum_revenue: { type: "number" }, limit: { type: "number" }, scope: { type: "string", enum: ["own", "team"] }, period_start: { type: "string" }, period_end: { type: "string" } } },
    handler: getInactiveClients, readOnly: true, aliases: ["inactive_clients"],
  },
  get_repurchase_window: {
    name: "get_repurchase_window",
    description: "Clientes em janela de recompra: intervalo médio entre compras aprovadas, data prevista, confiança e ação recomendada. Requer no mínimo 2 compras.",
    parameters: { type: "object", properties: { min_purchases: { type: "number" }, tolerance_pct: { type: "number" }, limit: { type: "number" }, scope: { type: "string", enum: ["own", "team"] } } },
    handler: getRepurchaseWindow, readOnly: true, aliases: ["recompute_repurchase", "repurchase_window"],
  },
  get_commercial_overview: {
    name: "get_commercial_overview",
    description: "Payload agregado da Inteligência Comercial: quotes aprovados válidos + clients + items + products + sellerProfiles. Substitui o SQL direto no navegador. scope='team' apenas para admin/gestor.",
    parameters: { type: "object", properties: { scope: { type: "string", enum: ["own", "team"] }, limit: { type: "number" } } },
    handler: getCommercialOverview, readOnly: true, aliases: ["commercial_overview", "intelligence_overview"],
  },
  get_client_ranking: {
    name: "get_client_ranking",
    description: "Ranking de clientes agregado no servidor (aba Rankings da Inteligência Comercial): valor total, ticket médio, marcas, top produtos, status, recorrência, período configurável.",
    parameters: {
      type: "object",
      properties: {
        scope: { type: "string", enum: ["own", "team"] },
        period_days: { type: ["number", "string"], description: "Número de dias ou 'all'" },
        seller_id: { type: "string" },
        state: { type: "string" },
        city: { type: "string" },
        only_recurrent: { type: "boolean" },
        active_filter: { type: "string", enum: ["all", "active", "inactive"] },
        limit: { type: "number" },
      },
    },
    handler: getClientRanking, readOnly: true, aliases: ["client_ranking", "top_clients"],
  },

};

// Resolve name or alias to a tool
export function resolveTool(name: string): ToolDef | null {
  if (TOOL_REGISTRY[name]) return TOOL_REGISTRY[name];
  for (const t of Object.values(TOOL_REGISTRY)) {
    if (t.aliases?.includes(name)) return t;
  }
  return null;
}

// OpenAI-format tool schemas (usable directly by chat completions endpoints)
export function openAiToolSchemas(): any[] {
  return Object.values(TOOL_REGISTRY).map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}
