import { defineTool } from "@lovable.dev/mcp-js";
import { runShared } from "../_bridge";

export default defineTool({
  name: "get_pipeline",
  title: "Pipeline comercial",
  description: "Retorna orçamentos agrupados por status para visualização de pipeline.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: (args, ctx) => runShared("get_pipeline", args, ctx),
});
