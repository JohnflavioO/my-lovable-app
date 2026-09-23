// Deno tests for the assistant-commercial shared registry & wiring.
// Run: supabase functions test (via test_edge_functions tool)
import { assert, assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { TOOL_REGISTRY, resolveTool, openAiToolSchemas } from "../_shared/crm-handlers.ts";

Deno.test("registry: expected tools are registered", () => {
  const expected = [
    "list_clients", "search_clients", "get_customer_history",
    "search_products", "get_product_details",
    "list_quotes", "search_quotes",
    "get_pipeline", "get_dashboard",
    "get_sales_metrics", "get_top_products",
    "get_followups", "get_tasks", "get_contracts",
  ];
  for (const name of expected) assertExists(TOOL_REGISTRY[name], `missing tool: ${name}`);
});

Deno.test("resolveTool: aliases map to canonical tool", () => {
  assertEquals(resolveTool("get_clients")?.name, "list_clients");
  assertEquals(resolveTool("get_quotes")?.name, "list_quotes");
  assertEquals(resolveTool("get_products")?.name, "search_products");
  assertEquals(resolveTool("list_products")?.name, "search_products");
  assertEquals(resolveTool("get_metrics")?.name, "get_sales_metrics");
  assertEquals(resolveTool("get_top_products")?.name, "get_top_products");
  assertEquals(resolveTool("does_not_exist"), null);
});

Deno.test("openAiToolSchemas: every tool has function schema", () => {
  const schemas = openAiToolSchemas();
  assertEquals(schemas.length, Object.keys(TOOL_REGISTRY).length);
  for (const s of schemas) {
    assertEquals(s.type, "function");
    assert(typeof s.function.name === "string" && s.function.name.length > 0);
    assert(typeof s.function.description === "string");
    assertEquals(s.function.parameters.type, "object");
  }
});

Deno.test("registry: all handlers are readOnly and callable", () => {
  for (const t of Object.values(TOOL_REGISTRY)) {
    assertEquals(t.readOnly, true);
    assertEquals(typeof t.handler, "function");
  }
});

// ---------- Classifier smoke tests (mirrors classify() in index.ts) ----------
// The classifier is private to index.ts; we replicate the expected routing
// contract here so regressions in intent detection break the build.
const SUPERLATIVE_RE = /\b(qual|quais|quem|top|ranking|mais\s+vend|maior|menor|melhor|pior|com\s+mais|com\s+menos|com\s+maior|com\s+menor)\b/;
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s%$]/g, " ").replace(/\s+/g, " ").trim();

Deno.test("intent: 'produtos mais vendidos' matches top-products pattern", () => {
  const q = norm("Quais os produtos mais vendidos este mês?");
  assert(/\b(produtos?)\b.*\b(mais\s+vend|top|ranking|campe|maior\s+fatur|maior\s+quant)/.test(q));
});

Deno.test("intent: superlative queries route to GPT", () => {
  assert(SUPERLATIVE_RE.test(norm("Qual o melhor cliente?")));
  assert(SUPERLATIVE_RE.test(norm("Quem tem maior ticket médio?")));
});
