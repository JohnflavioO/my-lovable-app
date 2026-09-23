import { installBrowserSafetyGuards } from "@/lib/browserRecovery";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

installBrowserSafetyGuards();

const escapeHtml = (value: string) =>
  value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char] ?? char);

const renderFatalStartupError = (error: unknown) => {
  const rootElement = document.getElementById("root");
  if (!rootElement) return;
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  rootElement.innerHTML = `
    <main style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f2b26;color:white;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:24px;">
      <section style="max-width:520px;width:100%;text-align:center;display:grid;gap:16px;">
        <h1 style="font-size:22px;font-weight:700;margin:0;">MCI CRM não iniciou corretamente</h1>
        <p style="margin:0;color:rgba(255,255,255,.72);font-size:14px;line-height:1.5;">Recarregue a página para tentar novamente.</p>
        <pre style="white-space:pre-wrap;word-break:break-word;text-align:left;background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:12px;font-size:11px;color:#fecaca;max-height:160px;overflow:auto;">${escapeHtml(message)}</pre>
        <button id="mci-reload" style="border:0;border-radius:10px;padding:12px 14px;background:#059669;color:white;font-weight:700;cursor:pointer;">Recarregar sistema</button>
      </section>
    </main>
  `;
  document.getElementById("mci-reload")?.addEventListener("click", () => window.location.reload());
};

const startApplication = () => {
 try {
  const rootElement = document.getElementById("root");
  if (!rootElement) throw new Error("Elemento #root não encontrado no documento.");

  // O App é importado estaticamente: no preview, um import() durante HMR podia
  // ser abortado pela troca do grafo de módulos e deixar o bootstrap incompleto.
  createRoot(rootElement).render(<App />);
 } catch (error) {
   console.error("[Main] Erro fatal durante a renderização:", error);
   renderFatalStartupError(error);
 }
};

startApplication();
