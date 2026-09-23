// Recuperação de browser — simples, previsível e sem app-shell.
// Regra: o CRM nunca deve depender de Service Worker para carregar a UI.
// Mantemos apenas o Firebase Messaging SW. A limpeza automática nunca recarrega
// a página: reload durante o bootstrap tornava o preview instável em iframes.

const CACHE_VERSION = "v2026-08-03-no-preview-reload";
const CHUNK_RETRY_KEY = "__mci_chunk_retry_done";

const isLovablePreviewRuntime = () => {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return window.self !== window.top
    || host.startsWith("id-preview--")
    || host.includes("-preview--")
    || host.endsWith(".lovableproject.com")
    || host.endsWith(".lovableproject-dev.com")
    || host.endsWith(".beta.lovable.dev");
};

const isFirebaseMessagingWorker = (scriptURL: string) => {
  try {
    return new URL(scriptURL).pathname === "/firebase-messaging-sw.js";
  } catch {
    return scriptURL.endsWith("/firebase-messaging-sw.js");
  }
};

const isLegacyAppCache = (name: string) =>
  /(^|-)precache-v\d+-|(^|-)runtime-|(^|-)googleAnalytics-|workbox|vite-pwa|mci.*(?:app|shell|asset)/i.test(name);

const clearLegacyAppCaches = async () => {
  if (!("caches" in window)) return 0;
  const names = await caches.keys();
  const legacyNames = names.filter(isLegacyAppCache);
  await Promise.allSettled(legacyNames.map((name) => caches.delete(name)));
  return legacyNames.length;
};

const createMemoryStorage = (): Storage => {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => store.delete(key),
    setItem: (key: string, value: string) => store.set(key, String(value)),
  } as Storage;
};

const ensureSafeStorage = (name: "localStorage" | "sessionStorage") => {
  if (typeof window === "undefined") return undefined;
  try {
    const storage = window[name];
    const testKey = `__mci_storage_test_${Date.now()}`;
    storage.setItem(testKey, "1");
    storage.removeItem(testKey);
    return storage;
  } catch {
    const fallback = createMemoryStorage();
    try {
      Object.defineProperty(window, name, { configurable: true, value: fallback });
    } catch {
      // Navegador bloqueou a redefinição; seguimos com o fallback local.
    }
    return fallback;
  }
};

export const installBrowserSafetyGuards = () => {
  ensureSafeStorage("localStorage");
  ensureSafeStorage("sessionStorage");

  // Executa fora do caminho crítico: o React monta imediatamente, enquanto
  // caches/SWs antigos são removidos em paralelo.
  if (typeof window !== "undefined") {
    window.setTimeout(() => {
      void removeLegacyServiceWorkers();
    }, 0);
  }
};

export const isLikelyChunkLoadError = (error: unknown) => {
  const message = error instanceof Error ? `${error.name} ${error.message} ${error.stack ?? ""}` : String(error);
  return /ChunkLoadError|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk|Failed to load module script|Expected a JavaScript module script/i.test(message);
};

export const clearBrowserCachesAndWorkers = async () => {
  let clearedCaches = 0;
  let unregisteredWorkers = 0;

  try {
    clearedCaches = await clearLegacyAppCaches();
  } catch (error) {
    console.warn("[Recovery] Não foi possível limpar caches:", error);
  }

  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      const removable = registrations.filter((registration) => {
        const worker = registration.active || registration.waiting || registration.installing;
        const url = worker?.scriptURL ?? "";
        return url !== "" && !isFirebaseMessagingWorker(url);
      });
      await Promise.all(removable.map((registration) => registration.unregister()));
      unregisteredWorkers = removable.length;
    }
  } catch (error) {
    console.warn("[Recovery] Não foi possível remover service workers:", error);
  }

  return { clearedCaches, unregisteredWorkers };
};

export const removeLegacyServiceWorkers = async () => {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return { removedWorkers: 0, clearedCaches: 0 };
  }

  let removedWorkers = 0;
  let clearedCaches = 0;

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    const legacyRegistrations = registrations.filter((registration) => {
      const worker = registration.active || registration.waiting || registration.installing;
      const scriptURL = worker?.scriptURL ?? "";
      return scriptURL !== "" && !isFirebaseMessagingWorker(scriptURL);
    });

    if (legacyRegistrations.length === 0) {
      return { removedWorkers, clearedCaches };
    }

    // Nunca atualizar/ativar um worker legado durante o bootstrap. O antigo
    // kill-switch navegava novamente para a URL temporária do preview e
    // reutilizava __lovable_load_id, fazendo o host rejeitar a página.
    const removals = await Promise.allSettled(
      legacyRegistrations.map((registration) => registration.unregister()),
    );
    removedWorkers = removals.filter((result) => result.status === "fulfilled" && result.value).length;
    clearedCaches = await clearLegacyAppCaches();

    console.warn("[Recovery] Service Worker legado removido sem recarregar a página.", {
      removedWorkers,
      clearedCaches,
    });

  } catch (error) {
    console.warn("[Recovery] Falha ao remover Service Worker legado:", error);
  }

  return { removedWorkers, clearedCaches };
};

export const reloadWithCacheBust = () => {
  // O preview usa __lovable_load_id temporário e não pode ser recarregado
  // automaticamente: repetir essa navegação pode ser rejeitado pelo host.
  if (isLovablePreviewRuntime()) {
    return;
  }
  const url = new URL(window.location.href);
  url.searchParams.set("__mci_cache", CACHE_VERSION);
  window.location.replace(url.toString());
};

// Mantido apenas por compatibilidade: não faz mais limpeza automática nem reload.
export const runOneTimeCacheRefresh = () => {};

export const clearLocalAppStateAndReload = async () => {
  try { window.localStorage.clear(); } catch { /* storage bloqueado */ }
  try { window.sessionStorage.clear(); } catch { /* storage bloqueado */ }
  await clearBrowserCachesAndWorkers();
  reloadWithCacheBust();
};

// Permite no máximo uma tentativa de recarregar por sessão em erro de chunk.
export const shouldRetryChunkLoad = () => {
  try {
    if (window.sessionStorage.getItem(CHUNK_RETRY_KEY) === CACHE_VERSION) return false;
    window.sessionStorage.setItem(CHUNK_RETRY_KEY, CACHE_VERSION);
    return true;
  } catch {
    return false;
  }
};
