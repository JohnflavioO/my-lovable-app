// Ações do dono (CRM autenticado): enviar, cancelar, reenviar, obter link.
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';
import { getSignatureProvider } from '../_shared/signature-providers/registry.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function sendResendEmail(to: string, subject: string, html: string) {
  const key = Deno.env.get('RESEND_API_KEY');
  const lovableKey = Deno.env.get('LOVABLE_API_KEY');
  if (!key || !lovableKey) {
    console.warn('[email] RESEND_API_KEY ou LOVABLE_API_KEY ausente — pulando envio');
    return { sent: false, reason: 'email_provider_not_configured' };
  }
  const from = Deno.env.get('SIGNATURE_EMAIL_FROM') ?? 'MCI Contratos <onboarding@resend.dev>';
  const resp = await fetch('https://connector-gateway.lovable.dev/resend/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${lovableKey}`,
      'X-Connection-Api-Key': key,
    },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    console.error(`[email] Resend erro ${resp.status}: ${text}`);
    return { sent: false, reason: `resend_${resp.status}` };
  }
  await resp.json().catch(() => null);
  return { sent: true };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Não autenticado' }, 401);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const svc = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) return json({ error: 'Sessão inválida' }, 401);
  const user = userData.user;

  let payload: any;
  try { payload = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
  const action = String(payload.action ?? '');

  try {
    if (action === 'send') {
      const contractId = String(payload.contractId ?? '');
      const signer = payload.signer ?? {};
      const pdfBase64 = String(payload.pdfBase64 ?? '');
      const validityDays = Math.max(1, Math.min(90, Number(payload.validityDays ?? 15)));

      if (!contractId || !pdfBase64) return json({ error: 'Dados incompletos' }, 400);
      if (!signer.name || !signer.document || !signer.email) {
        return json({ error: 'Signatário incompleto (nome, CPF, e-mail obrigatórios)' }, 400);
      }
      const { data: contract, error: cErr } = await supabase
        .from('generated_contracts')
        .select('id,company_id')
        .eq('id', contractId)
        .maybeSingle();
      if (cErr || !contract) return json({ error: 'Contrato não encontrado ou sem acesso' }, 404);

      const { data: active } = await svc.from('contract_signature_requests')
        .select('id').eq('contract_id', contractId)
        .in('status', ['ready_to_send','sent','viewed','awaiting_signature','signed'])
        .maybeSingle();
      if (active) return json({ error: 'Já existe uma solicitação ativa. Cancele-a antes de enviar outra.' }, 409);

      const provider = getSignatureProvider('mci_native');
      const expiresAt = new Date(Date.now() + validityDays * 86400_000).toISOString();
      const result = await provider.createSignatureRequest({
        contractId,
        companyId: contract.company_id,
        createdBy: user.id,
        signer: {
          name: String(signer.name).trim(),
          document: String(signer.document).replace(/\D/g, ''),
          email: String(signer.email).trim(),
          phone: signer.phone ? String(signer.phone) : null,
        },
        originalPdfBase64: pdfBase64,
        expiresAt,
      });

      const emailResult = await sendResendEmail(
        String(signer.email).trim(),
        'Contrato para sua assinatura eletrônica — MCI',
        `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px;color:#111">
          <h2 style="color:#0f2b26">Olá, ${String(signer.name).split(' ')[0]}!</h2>
          <p>Você recebeu um contrato da <strong>MCI</strong> para assinatura eletrônica.</p>
          <p style="margin:24px 0">
            <a href="${result.publicUrl}" style="background:#0f2b26;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none">Abrir contrato</a>
          </p>
          <p style="color:#555;font-size:12px">Este link expira em ${validityDays} dias. Se não reconhece esta solicitação, ignore este e-mail.</p>
        </div>`
      );

      return json({
        ok: true,
        requestId: result.requestId,
        publicUrl: result.publicUrl,
        emailSent: emailResult.sent,
        emailReason: emailResult.reason ?? null,
      });
    }

    if (action === 'cancel') {
      const requestId = String(payload.requestId ?? '');
      const { data: reqRow } = await supabase.from('contract_signature_requests')
        .select('id').eq('id', requestId).maybeSingle();
      if (!reqRow) return json({ error: 'Solicitação não encontrada ou sem acesso' }, 404);
      const provider = getSignatureProvider('mci_native');
      await provider.cancelSignatureRequest(requestId, payload.reason);
      return json({ ok: true });
    }

    if (action === 'resend') {
      const requestId = String(payload.requestId ?? '');
      const { data: reqRow } = await supabase.from('contract_signature_requests')
        .select('*').eq('id', requestId).maybeSingle();
      if (!reqRow) return json({ error: 'Solicitação não encontrada' }, 404);
      if (!['sent','viewed','awaiting_signature'].includes(reqRow.status)) {
        return json({ error: 'Solicitação não está aguardando assinatura' }, 400);
      }
      const publicUrl = String(payload.publicUrl ?? '');
      if (!publicUrl) return json({ error: 'URL pública ausente' }, 400);

      const emailResult = await sendResendEmail(
        reqRow.signer_email,
        'Lembrete: contrato aguardando sua assinatura — MCI',
        `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px;color:#111">
          <h2 style="color:#0f2b26">Lembrete de assinatura</h2>
          <p>Seu contrato ainda aguarda assinatura eletrônica.</p>
          <p><a href="${publicUrl}" style="background:#0f2b26;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none">Abrir contrato</a></p>
        </div>`
      );
      await svc.from('contract_signature_events').insert({
        signature_request_id: requestId,
        event_type: 'invitation_sent',
        metadata: { resend: true },
      });
      return json({ ok: true, emailSent: emailResult.sent, emailReason: emailResult.reason ?? null });
    }

    return json({ error: `Ação desconhecida: ${action}` }, 400);
  } catch (e: any) {
    console.error('[contract-signature-owner] erro', e);
    return json({ error: e?.message ?? 'Erro interno' }, 500);
  }
});
