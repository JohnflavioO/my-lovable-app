// Identifica quem está chamando uma Edge Function.
// - "service": chamada interna (cron / outra função) com a chave de serviço,
//   enviada em `apikey` (chaves opacas sb_secret_) ou como Bearer (JWT legado),
//   ou agendamento do banco com o header `x-cron-secret` (conferido no Vault).
// - "user": usuário logado com token válido.
// - null: qualquer outra coisa (chave pública anon, token inválido, sem header).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export type Caller = { kind: "service" } | { kind: "user"; userId: string };

function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function identifyCaller(req: Request): Promise<Caller | null> {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const apikey = req.headers.get("apikey") ?? "";
  const auth = req.headers.get("Authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (safeEqual(apikey, serviceKey) || safeEqual(bearer, serviceKey)) {
    return { kind: "service" };
  }

  // Agendamentos do banco (pg_cron) enviam um segredo próprio guardado no Vault.
  // A conferência é feita pelo próprio banco (verify_cron_secret), então o valor
  // nunca precisa ser copiado para fora dele.
  const cronHeader = req.headers.get("x-cron-secret") ?? "";
  if (cronHeader && serviceKey) {
    const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceKey);
    const { data: ok } = await admin.rpc("verify_cron_secret", { p_secret: cronHeader });
    if (ok === true) return { kind: "service" };
  }
  if (!bearer) return null;

  const client = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: auth } } },
  );
  const { data, error } = await client.auth.getUser(bearer);
  if (error || !data?.user) return null;
  return { kind: "user", userId: data.user.id };
}
