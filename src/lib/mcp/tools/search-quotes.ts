import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { runShared } from "../_bridge";

export default defineTool({
  name: "search_quotes",
  title: "Buscar orçamentos",
  description: "Busca orçamentos por cliente, status ou intervalo de datas.",
  inputSchema: {
    client_name: z.string().optional(),
    status: z.string().optional(),
    from: z.string().optional().describe("Data inicial ISO (created_at >=)"),
    to: z.string().optional().describe("Data final ISO (created_at <=)"),
    limit: z.number().int().min(1).max(100).default(25),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: (args, ctx) => runShared("search_quotes", args, ctx),
});
