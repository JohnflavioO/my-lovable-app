import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  build: {
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false },
    cssCodeSplit: true,
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          ui: ["@radix-ui/react-dialog", "@radix-ui/react-dropdown-menu", "@radix-ui/react-select", "@radix-ui/react-tabs", "@radix-ui/react-popover", "@radix-ui/react-tooltip", "lucide-react"],
          data: ["@tanstack/react-query", "@supabase/supabase-js"],
          charts: ["recharts"],
          pdf: ["jspdf", "jspdf-autotable"],
          firebase: ["firebase/app", "firebase/messaging"],
          xlsx: ["xlsx"],
          motion: ["framer-motion"],
          dnd: ["@hello-pangea/dnd"],
          carousel: ["embla-carousel-react"],
          datefns: ["date-fns"],
          forms: ["react-hook-form", "@hookform/resolvers", "zod"],
        },
      },
    },
  },
  server: {
    host: "::",
    port: 8081,
    allowedHosts: true,
    hmr: {
      // Nunca ocultar falhas de compilação/HMR atrás de uma tela branca.
      overlay: true,
    },
  },
  preview: {
    host: "::",
    port: 8081,
    allowedHosts: true,
  },
  plugins: [
    react(),
    // No Windows o plugin regera supabase/functions/mcp/index.ts importando um caminho local
    // (npm:C:\...), o que quebra a função publicada. Lá ele fica desligado.
    process.platform !== "win32" && mcpPlugin(),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
