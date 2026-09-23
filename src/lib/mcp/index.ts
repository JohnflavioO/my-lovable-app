import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listClientsTool from "./tools/list-clients";
import listQuotesTool from "./tools/list-quotes";
import whoamiTool from "./tools/whoami";
import searchClientsTool from "./tools/search-clients";
import getProductsTool from "./tools/get-products";
import getProductDetailsTool from "./tools/get-product-details";
import searchProductsTool from "./tools/search-products";
import searchQuotesTool from "./tools/search-quotes";
import getPipelineTool from "./tools/get-pipeline";
import getTasksTool from "./tools/get-tasks";
import getContractsTool from "./tools/get-contracts";
import getCustomerHistoryTool from "./tools/get-customer-history";
import getDashboardTool from "./tools/get-dashboard";
import getFollowupsTool from "./tools/get-followups";
import getSalesMetricsTool from "./tools/get-sales-metrics";
import getTopProductsTool from "./tools/get-top-products";



const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "mci-crm-mcp",
  title: "MCI CRM - Copiloto Comercial",
  version: "0.2.0",
  instructions:
    "Copiloto Comercial do MCI CRM. Use as ferramentas para consultar clientes, produtos, orçamentos, pipeline, contratos, tarefas, follow-ups e métricas de vendas do usuário autenticado. Nunca invente dados: se uma consulta retornar vazio, informe. Todas as consultas respeitam as permissões (RLS) e a carteira comercial do usuário.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    whoamiTool,
    listClientsTool,
    searchClientsTool,
    getProductsTool,
    getProductDetailsTool,
    searchProductsTool,
    listQuotesTool,
    searchQuotesTool,
    getPipelineTool,
    getTasksTool,
    getContractsTool,
    getCustomerHistoryTool,
    getDashboardTool,
    getFollowupsTool,
    getSalesMetricsTool,
    getTopProductsTool,
  ],
});
