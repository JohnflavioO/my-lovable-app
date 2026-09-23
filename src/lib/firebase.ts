import { getApps, initializeApp, SDK_VERSION, type FirebaseApp } from "firebase/app";
import { getMessaging, getToken, isSupported, type Messaging } from "firebase/messaging";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

const firebaseConfig = {
  apiKey: "AIzaSyA7Xg9BQ4kzg6QqGnlxynbp92nSs2jtGeI",
  authDomain: "push-mci-crm.firebaseapp.com",
  projectId: "push-mci-crm",
  storageBucket: "push-mci-crm.firebasestorage.app",
  messagingSenderId: "741697309199",
  appId: "1:741697309199:web:aaf8751a1b31749eaa717a",
  measurementId: "G-39Q3MK7TX4",
};

const VAPID_KEY =
  "BMS4aQERHypWXmwrWRAvU3keQDe9u7M-tEdBinML8tf0HXf8Q4QAyKKJ2RXwTO8ZAk9gFw2esIuEp89UkGsUN6Q";

const DEVICE_ID_KEY = "mci_device_id";
const LAST_TOKEN_ATTEMPT_KEY = "mci_fcm_last_token_attempt";

let app: FirebaseApp | null = null;
let _messaging: Messaging | null = null;

function isLovablePreviewRuntime(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return window.self !== window.top
    || host.startsWith("id-preview--")
    || host.startsWith("preview--")
    || host.includes("-preview--")
    || host.endsWith(".lovableproject.com")
    || host.endsWith(".lovableproject-dev.com")
    || host.endsWith(".beta.lovable.dev");
}

export class FcmError extends Error {
  code: string;
  details?: unknown;
  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

function ensureApp(): FirebaseApp {
  if (!app) app = getApps()[0] ?? initializeApp(firebaseConfig);
  return app;
}

function maskValue(value: string, left = 10, right = 6): string {
  if (!value) return "ausente";
  if (value.length <= left + right) return `${value.slice(0, 4)}…`;
  return `${value.slice(0, left)}…${value.slice(-right)}`;
}

function summarizeStack(stack?: string | null): string | null {
  if (!stack) return null;
  return stack.split("\n").slice(0, 6).join("\n");
}

function swInfo(reg: ServiceWorkerRegistration | null | undefined) {
  if (!reg) return null;
  const worker = reg.active || reg.waiting || reg.installing;
  return {
    scope: reg.scope,
    activeState: reg.active?.state ?? null,
    waitingState: reg.waiting?.state ?? null,
    installingState: reg.installing?.state ?? null,
    scriptURL: worker?.scriptURL ?? null,
  };
}

function isFirebaseMessagingRegistration(reg: ServiceWorkerRegistration | null | undefined): boolean {
  const scriptURL = swInfo(reg)?.scriptURL;
  if (!scriptURL) return false;
  try {
    return new URL(scriptURL).pathname === "/firebase-messaging-sw.js";
  } catch {
    return scriptURL.endsWith("/firebase-messaging-sw.js");
  }
}

async function waitForFirebaseWorkerActivation(
  registration: ServiceWorkerRegistration,
  timeoutMs = 8000
): Promise<ServiceWorkerRegistration> {
  if (isFirebaseMessagingRegistration(registration) && registration.active?.state === "activated") {
    return registration;
  }

  const candidate = registration.installing || registration.waiting || registration.active;
  if (candidate && new URL(candidate.scriptURL).pathname === "/firebase-messaging-sw.js") {
    try {
      candidate.postMessage({ type: "SKIP_WAITING" });
    } catch {
      // segue aguardando statechange
    }
  }

  await new Promise<void>((resolve) => {
    const done = () => resolve();
    const timeout = window.setTimeout(done, timeoutMs);
    const worker = registration.installing || registration.waiting;
    if (!worker) {
      window.clearTimeout(timeout);
      done();
      return;
    }
    worker.addEventListener("statechange", () => {
      if (worker.state === "activated") {
        window.clearTimeout(timeout);
        done();
      }
    });
  });

  return registration;
}

interface TokenAttemptDiagnostics {
  executed: boolean;
  returned: boolean;
  savedInDb: boolean;
  tokenPreview: string | null;
  error: TokenTechnicalError | null;
  timestamp: string;
}

export interface TokenTechnicalError {
  code: string;
  message: string;
  name: string | null;
  stack: string | null;
  stackSummary: string | null;
  timestamp: string;
  vapidKeyMasked: string;
  messagingInitialized: boolean;
  firebaseProjectId: string;
  messagingSenderId: string;
  firebaseSdkVersion: string;
  notificationPermission: NotificationPermission | "unavailable";
  serviceWorkerRegistration: ReturnType<typeof swInfo>;
  serviceWorkerReady: ReturnType<typeof swInfo>;
}

function readLastTokenAttempt(): TokenAttemptDiagnostics | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LAST_TOKEN_ATTEMPT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeLastTokenAttempt(attempt: TokenAttemptDiagnostics) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LAST_TOKEN_ATTEMPT_KEY, JSON.stringify(attempt));
  } catch {
    // diagnóstico não deve quebrar o fluxo principal
  }
}

function clearTokenTechnicalError() {
  const previous = readLastTokenAttempt();
  if (previous) {
    writeLastTokenAttempt({ ...previous, error: null });
  }
}

function buildTokenTechnicalError(
  error: any,
  messagingInitialized: boolean,
  registration: ServiceWorkerRegistration | null,
  readyRegistration: ServiceWorkerRegistration | null,
  fallbackCode = "messaging/get-token-failed"
): TokenTechnicalError {
  const code = typeof error?.code === "string" && error.code ? error.code : fallbackCode;
  const message = error?.message ? String(error.message) : String(error || "Erro desconhecido em getToken().");
  return {
    code,
    message,
    name: error?.name ?? null,
    stack: error?.stack ?? null,
    stackSummary: summarizeStack(error?.stack),
    timestamp: new Date().toISOString(),
    vapidKeyMasked: maskValue(VAPID_KEY),
    messagingInitialized,
    firebaseProjectId: firebaseConfig.projectId,
    messagingSenderId: firebaseConfig.messagingSenderId,
    firebaseSdkVersion: SDK_VERSION,
    notificationPermission: typeof Notification !== "undefined" ? Notification.permission : "unavailable",
    serviceWorkerRegistration: swInfo(registration),
    serviceWorkerReady: swInfo(readyRegistration),
  };
}

function getDeviceId(): string {
  if (typeof window === "undefined") return "ssr";
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id =
      (crypto as any)?.randomUUID?.() ||
      `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

async function getMessagingOrThrow(): Promise<Messaging> {
  if (_messaging) return _messaging;
  if (typeof window === "undefined")
    throw new FcmError("no_window", "Ambiente sem window (SSR).");
  const supported = await isSupported().catch(() => false);
  if (!supported)
    throw new FcmError(
      "unsupported",
      "Este navegador não suporta Firebase Messaging (Push API/Notification API ausente)."
    );
  try {
    _messaging = getMessaging(ensureApp());
    return _messaging;
  } catch (e: any) {
    throw new FcmError(
      "firebase_init_failed",
      `Falha ao inicializar Firebase Messaging: ${e?.message || e}`,
      e
    );
  }
}

async function registerSW(): Promise<ServiceWorkerRegistration> {
  if (isLovablePreviewRuntime()) {
    throw new FcmError(
      "preview_sw_disabled",
      "Notificações push ficam desativadas no preview para não instalar Service Worker no navegador do editor."
    );
  }

  if (!("serviceWorker" in navigator))
    throw new FcmError(
      "no_sw_api",
      "Service Worker API indisponível neste navegador."
    );
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    console.log("[FCM] serviceWorker.getRegistrations ->", registrations.map(swInfo));

    const rootRegistration = await navigator.serviceWorker.getRegistration("/");
    console.log("[FCM] serviceWorker.getRegistration('/') ->", swInfo(rootRegistration));

    if (rootRegistration?.active && isFirebaseMessagingRegistration(rootRegistration)) {
      const ready = await navigator.serviceWorker.ready;
      console.log("[FCM] serviceWorker.ready (reutilizado) ->", swInfo(ready));
      return ready;
    }

    if (rootRegistration?.active && !isFirebaseMessagingRegistration(rootRegistration)) {
      console.warn("[FCM] Conflito de Service Worker no escopo raiz. Registrando firebase-messaging-sw.js sobre o registro atual.", swInfo(rootRegistration));
    }

    // Sequência obrigatória para FCM: register('/firebase-messaging-sw.js') -> ready -> getToken(...registration)
    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    console.log("[FCM] navigator.serviceWorker.register('/firebase-messaging-sw.js') ->", swInfo(registration));

    await waitForFirebaseWorkerActivation(registration);

    const ready = await navigator.serviceWorker.ready;
    console.log("[FCM] navigator.serviceWorker.ready ->", swInfo(ready));

    return registration;
  } catch (e: any) {
    console.error("[FCM] serviceWorker.register FAILED", {
      name: e?.name,
      message: e?.message,
      stack: e?.stack,
      error: e,
    });
    throw new FcmError(
      "sw_register_failed",
      `Falha ao registrar /firebase-messaging-sw.js: ${e?.name || ""} ${e?.message || e}`,
      e
    );
  }
}

async function getCompanyId(userId: string): Promise<string | null> {
  try {
    const { data } = await (supabase as any)
      .from("profiles")
      .select("company_id")
      .eq("user_id", userId)
      .maybeSingle();
    return data?.company_id ?? null;
  } catch {
    return null;
  }
}

export interface FcmDiagnostics {
  windowAvailable: boolean;
  isSecureContext: boolean;
  notificationApi: boolean;
  permission: NotificationPermission | "unavailable";
  serviceWorkerApi: boolean;
  serviceWorkerFileReachable: boolean;
  serviceWorkerRegistered: boolean;
  serviceWorkerReady: boolean;
  serviceWorkerScope: string | null;
  serviceWorkerReadyScope: string | null;
  serviceWorkerState: string | null;
  serviceWorkerRegisterError: string | null;
  firebaseInitialized: boolean;
  messagingSupported: boolean;
  vapidConfigured: boolean;
  vapidKeyMasked: string;
  firebaseProjectId: string;
  messagingSenderId: string;
  firebaseSdkVersion: string;
  getTokenExecuted: boolean;
  tokenReturned: boolean;
  tokenObtained: boolean;
  tokenSavedInDb: boolean;
  tokenPreview: string | null;
  tokenTechnicalError: TokenTechnicalError | null;
  deviceId: string;
  lastTestAt: string | null;
  errors: string[];
}

export async function getFcmDiagnostics(): Promise<FcmDiagnostics> {
  const errors: string[] = [];
  const isPreview = isLovablePreviewRuntime();
  const windowAvailable = typeof window !== "undefined";
  const isSecureContext = windowAvailable ? !!window.isSecureContext : false;
  const notificationApi = windowAvailable && "Notification" in window;
  const permission: NotificationPermission | "unavailable" = notificationApi
    ? Notification.permission
    : "unavailable";
  const serviceWorkerApi = windowAvailable && "serviceWorker" in navigator;

  let serviceWorkerRegistered = false;
  let serviceWorkerReady = false;
  let serviceWorkerScope: string | null = null;
  let serviceWorkerReadyScope: string | null = null;
  let serviceWorkerState: string | null = null;
  let serviceWorkerFileReachable = false;
  let serviceWorkerRegisterError: string | null = null;

  if (isPreview) {
    errors.push("Service Worker desativado no preview do editor para evitar tela branca por cache/controle antigo.");
  } else if (serviceWorkerApi) {
    // 1) Confere que o arquivo é servido na raiz do domínio
    try {
      const resp = await fetch("/firebase-messaging-sw.js", { cache: "no-store" });
      serviceWorkerFileReachable = resp.ok;
      if (!resp.ok) {
        errors.push(`SW file HTTP ${resp.status} em /firebase-messaging-sw.js`);
      } else {
        const ct = resp.headers.get("content-type") || "";
        if (!/javascript/i.test(ct)) {
          errors.push(`SW file servido com content-type inesperado: ${ct}`);
        }
      }
    } catch (e: any) {
      errors.push(`SW fetch: ${e?.message || e}`);
    }

    // 2) Verifica registro existente; se não houver, tenta registrar e captura o erro real
    try {
      let reg = await navigator.serviceWorker.getRegistration("/");
      if (!reg && serviceWorkerFileReachable) {
        try {
          reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
        } catch (e: any) {
          serviceWorkerRegisterError = `${e?.name || "Error"}: ${e?.message || e}`;
          errors.push(`SW register: ${serviceWorkerRegisterError}`);
        }
      }
      serviceWorkerRegistered = isFirebaseMessagingRegistration(reg);
      serviceWorkerScope = reg?.scope ?? null;
      const sw = reg?.active || reg?.installing || reg?.waiting;
      serviceWorkerState = sw?.state ?? null;
      if (reg && !serviceWorkerRegistered) {
        errors.push(`SW conflito: escopo raiz usa ${sw?.scriptURL || "script desconhecido"}, não /firebase-messaging-sw.js`);
      }
      try {
        const ready = await navigator.serviceWorker.ready;
        serviceWorkerReady = isFirebaseMessagingRegistration(ready);
        serviceWorkerReadyScope = ready.scope ?? null;
        if (ready && !serviceWorkerReady) {
          errors.push(`SW ready conflito: ${swInfo(ready)?.scriptURL || "script desconhecido"}`);
        }
      } catch (e: any) {
        errors.push(`SW ready: ${e?.message || e}`);
      }
    } catch (e: any) {
      errors.push(`SW lookup: ${e?.message || e}`);
    }
  } else {
    errors.push("navigator.serviceWorker indisponível (contexto não-seguro ou navegador sem suporte).");
  }

  let firebaseInitialized = false;
  let messagingSupported = false;
  try {
    ensureApp();
    firebaseInitialized = true;
    messagingSupported = await isSupported().catch(() => false);
  } catch (e: any) {
    errors.push(`Firebase init: ${e?.message || e}`);
  }

  const vapidConfigured = !!VAPID_KEY && VAPID_KEY.length > 20;
  const lastAttempt = readLastTokenAttempt();

  const deviceId = getDeviceId();
  let tokenSavedInDb = false;
  let tokenPreview: string | null = null;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await (supabase as any)
        .from("user_push_tokens")
        .select("fcm_token, is_active, device_info, last_seen_at")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .contains("device_info", { device_id: deviceId })
        .maybeSingle();
      if (data?.fcm_token) {
        tokenSavedInDb = true;
        tokenPreview = `${data.fcm_token.slice(0, 16)}…${data.fcm_token.slice(-6)}`;
      }
    }
  } catch (e: any) {
    errors.push(`DB lookup: ${e?.message || e}`);
  }

  const lastTestAt = windowAvailable
    ? localStorage.getItem("mci_fcm_last_test_at")
    : null;

  return {
    windowAvailable,
    isSecureContext,
    notificationApi,
    permission,
    serviceWorkerApi,
    serviceWorkerFileReachable,
    serviceWorkerRegistered,
    serviceWorkerReady,
    serviceWorkerScope,
    serviceWorkerReadyScope,
    serviceWorkerState,
    serviceWorkerRegisterError,
    firebaseInitialized,
    messagingSupported,
    vapidConfigured,
    vapidKeyMasked: maskValue(VAPID_KEY),
    firebaseProjectId: firebaseConfig.projectId,
    messagingSenderId: firebaseConfig.messagingSenderId,
    firebaseSdkVersion: SDK_VERSION,
    getTokenExecuted: !!lastAttempt?.executed,
    tokenReturned: !!lastAttempt?.returned || tokenSavedInDb,
    tokenObtained: !!lastAttempt?.returned || tokenSavedInDb,
    tokenSavedInDb,
    tokenPreview: tokenPreview ?? lastAttempt?.tokenPreview ?? null,
    tokenTechnicalError: lastAttempt?.error ?? null,
    deviceId,
    lastTestAt,
    errors,
  };
}

export function markFcmTestPerformed() {
  if (typeof window !== "undefined") {
    localStorage.setItem("mci_fcm_last_test_at", new Date().toISOString());
  }
}

/**
 * Solicita permissão, registra SW, obtém token FCM e salva em user_push_tokens.
 * Lança FcmError com código específico em qualquer falha — sem mensagens genéricas.
 */
export async function requestNotificationPermission(): Promise<string> {
  if (typeof window === "undefined")
    throw new FcmError("no_window", "Ambiente sem window.");

  if (isLovablePreviewRuntime()) {
    throw new FcmError(
      "preview_sw_disabled",
      "Notificações push ficam desativadas no preview para não instalar Service Worker no navegador do editor."
    );
  }

  if (!("Notification" in window))
    throw new FcmError(
      "no_notification_api",
      "Este navegador não expõe a Notification API."
    );

  if (!window.isSecureContext)
    throw new FcmError(
      "insecure_context",
      "Push exige contexto seguro (HTTPS ou localhost)."
    );

  if (!VAPID_KEY)
    throw new FcmError("vapid_missing", "VAPID Key não configurada no cliente.");

  const messaging = await getMessagingOrThrow();
  console.log("[FCM] Firebase Messaging inicializado.", {
    messagingInitialized: !!messaging,
    firebaseProjectId: firebaseConfig.projectId,
    messagingSenderId: firebaseConfig.messagingSenderId,
    firebaseSdkVersion: SDK_VERSION,
    vapidKeyMasked: maskValue(VAPID_KEY),
  });

  let permission: NotificationPermission;
  try {
    console.log("[FCM] Chamando Notification.requestPermission()…");
    permission = await Notification.requestPermission();
    console.log("[FCM] Notification.requestPermission() ->", permission);
  } catch (e: any) {
    console.error("[FCM] Notification.requestPermission() THREW", {
      name: e?.name,
      message: e?.message,
      error: e,
    });
    throw new FcmError(
      "permission_request_failed",
      `Falha ao solicitar permissão: ${e?.name || ""} ${e?.message || e}`,
      e
    );
  }

  if (permission === "denied")
    throw new FcmError(
      "permission_denied",
      "Permissão bloqueada pelo usuário/navegador. Libere notificações nas permissões do site."
    );
  if (permission !== "granted")
    throw new FcmError(
      "permission_dismissed",
      "Permissão não concedida (usuário fechou o prompt)."
    );

  console.log("[FCM] Registrando/obtendo Service Worker…");
  const registration = await registerSW();

  let token: string | null = null;

  // Diagnóstico pré-getToken
  let readyRegistration: ServiceWorkerRegistration | null = null;
  try {
    readyRegistration = await navigator.serviceWorker.ready;
    console.log("[FCM] Resultado final navigator.serviceWorker.ready ->", swInfo(readyRegistration));
  } catch (e: any) {
    console.error("[FCM] navigator.serviceWorker.ready FAILED", {
      name: e?.name, message: e?.message, stack: e?.stack,
    });
  }

  const pushSub = await registration.pushManager.getSubscription().catch((e) => {
    console.error("[FCM] pushManager.getSubscription FAILED", {
      name: e?.name, message: e?.message,
    });
    return null;
  });

  console.log("[FCM] Pré-getToken diagnostics:", {
    messagingInitialized: !!messaging,
    firebaseProjectId: firebaseConfig.projectId,
    messagingSenderId: firebaseConfig.messagingSenderId,
    firebaseSdkVersion: SDK_VERSION,
    vapidKeyMasked: maskValue(VAPID_KEY),
    vapidKeyLength: VAPID_KEY.length,
    serviceWorkerRegistrationPassedToGetToken: swInfo(registration),
    serviceWorkerReady: swInfo(readyRegistration),
    sameRegistrationAsReady: readyRegistration === registration,
    existingPushSubscription: pushSub
      ? { endpoint: pushSub.endpoint, expirationTime: pushSub.expirationTime }
      : null,
    notificationPermission: Notification.permission,
    isSecureContext: window.isSecureContext,
    location: window.location.origin,
  });

  try {
    console.log("[FCM] Chamando getToken(messaging, { vapidKey, serviceWorkerRegistration })…", {
      messagingInitialized: !!messaging,
      vapidKeyMasked: maskValue(VAPID_KEY),
      serviceWorkerRegistration: swInfo(registration),
      serviceWorkerReady: swInfo(readyRegistration),
    });
    writeLastTokenAttempt({
      executed: true,
      returned: false,
      savedInDb: false,
      tokenPreview: null,
      error: null,
      timestamp: new Date().toISOString(),
    });
    token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    console.log("[FCM] getToken() retornou:", {
      hasToken: !!token,
      length: token?.length ?? 0,
      preview: token ? `${token.slice(0, 16)}…${token.slice(-6)}` : null,
    });
  } catch (e: any) {
    const technicalError = buildTokenTechnicalError(e, !!messaging, registration, readyRegistration);
    writeLastTokenAttempt({
      executed: true,
      returned: false,
      savedInDb: false,
      tokenPreview: null,
      error: technicalError,
      timestamp: technicalError.timestamp,
    });
    console.error("[FCM] getToken() THREW EXCEPTION", {
      errorName: technicalError.name,
      errorCode: technicalError.code,
      errorMessage: technicalError.message,
      errorStack: technicalError.stack,
      errorCause: e?.cause,
      errorCustomData: e?.customData,
      errorServerResponse: e?.serverResponse,
      errorJSON: (() => { try { return JSON.stringify(e, Object.getOwnPropertyNames(e)); } catch { return null; } })(),
      messagingInitialized: technicalError.messagingInitialized,
      firebaseProjectId: technicalError.firebaseProjectId,
      messagingSenderId: technicalError.messagingSenderId,
      firebaseSdkVersion: technicalError.firebaseSdkVersion,
      vapidKeyMasked: technicalError.vapidKeyMasked,
      serviceWorkerRegistrationPassedToGetToken: technicalError.serviceWorkerRegistration,
      serviceWorkerReady: technicalError.serviceWorkerReady,
      rawError: e,
    });
    throw new FcmError(
      technicalError.code,
      `getToken() falhou: ${technicalError.code} — ${technicalError.message}`,
      technicalError
    );
  }

  if (!token) {
    const emptyTokenError = buildTokenTechnicalError(
      { code: "messaging/empty-token", message: "getToken() retornou vazio sem lançar exceção.", name: "EmptyTokenError" },
      !!messaging,
      registration,
      readyRegistration,
      "messaging/empty-token"
    );
    writeLastTokenAttempt({
      executed: true,
      returned: false,
      savedInDb: false,
      tokenPreview: null,
      error: emptyTokenError,
      timestamp: emptyTokenError.timestamp,
    });
    console.error("[FCM] getToken() retornou string VAZIA (sem exceção)", {
      messaging: !!messaging,
      vapidKeyMasked: maskValue(VAPID_KEY),
      serviceWorkerRegistration: swInfo(registration),
      serviceWorkerReady: swInfo(readyRegistration),
      permission: Notification.permission,
      hint: "Provável VAPID Key incompatível com o Sender ID do Firebase project, ou bloqueio do push service.",
    });
    throw new FcmError(
      emptyTokenError.code,
      emptyTokenError.message,
      emptyTokenError
    );
  }

  writeLastTokenAttempt({
    executed: true,
    returned: true,
    savedInDb: false,
    tokenPreview: `${token.slice(0, 16)}…${token.slice(-6)}`,
    error: null,
    timestamp: new Date().toISOString(),
  });

  console.log("[FCM] Salvando token no banco…");
  await saveTokenToDatabase(token);
  writeLastTokenAttempt({
    executed: true,
    returned: true,
    savedInDb: true,
    tokenPreview: `${token.slice(0, 16)}…${token.slice(-6)}`,
    error: null,
    timestamp: new Date().toISOString(),
  });
  clearTokenTechnicalError();
  console.log("[FCM] Token salvo com sucesso.");
  return token;
}

async function saveTokenToDatabase(token: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user)
    throw new FcmError("not_authenticated", "Usuário não autenticado.");

  const company_id = await getCompanyId(user.id);
  const device_id = getDeviceId();
  const device_type = /Mobi|Android/i.test(navigator.userAgent)
    ? "mobile"
    : "desktop";

  const payload = {
    user_id: user.id,
    company_id,
    fcm_token: token,
    device_type,
    browser: navigator.userAgent,
    last_seen_at: new Date().toISOString(),
    is_active: true,
    device_info: {
      device_id,
      platform: navigator.platform,
      language: navigator.language,
      user_agent: navigator.userAgent,
    },
  };

  const { error } = await (supabase as any)
    .from("user_push_tokens")
    .upsert(payload, { onConflict: "user_id,fcm_token" });

  if (error) {
    logger.error("Erro ao salvar token FCM:", error);
    throw new FcmError(
      "db_save_failed",
      `Falha ao salvar token no banco: ${error.message}`,
      error
    );
  }
}
