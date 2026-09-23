import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { runShared } from "../_bridge";

export default defineTool({
  name: "get_customer_history",
  title: "Histórico do cliente",
  description: "Retorna orçamentos, contratos e financeiro de um cliente (por id ou nome).",
  inputSchema: {
    client_id: z.string().uuid().optional(),
    client_name: z.string().optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: (args, ctx) => runShared("get_customer_history", args, ctx),
});
