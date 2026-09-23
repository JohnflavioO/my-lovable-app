// Rotas públicas da página de assinatura. verify_jwt = false (config.toml).
// Toda operação sensível usa service role internamente. Nunca vaza dados de outras empresas/clientes.

import { createClient } from 'npm:@supabase/supabase-js@2.45.0';
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';
import QRCode from 'npm:qrcode@1.5.3';

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

function svcClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
}

async function sha256Hex(bytes: Uint8Array | string): Promise<string> {
  const data = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function maskCpf(doc: string) {
  const d = (doc || '').replace(/\D/g, '');
  if (d.length !== 11) return '***';
  return `***.***.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}

function maskPhone(phone?: string | null) {
  if (!phone) return null;
  const d = phone.replace(/\D/g, '');
  if (d.length < 4) return '****';
  return `****${d.slice(-4)}`;
}

async function loadRequestByToken(token: string) {
  if (!token || token.length < 20) throw new Error('Token inválido');
  const svc = svcClient();
  const tokenHash = await sha256Hex(token);
  const { data, error } = await svc
    .from('contract_signature_requests')
    .select('*')
    .eq('public_token_hash', tokenHash)
    .maybeSingle();
  if (error || !data) throw new Error('Solicitação não encontrada');
  return { svc, request: data };
}

function isExpired(req: any) {
  return req.expires_at && new Date(req.expires_at).getTime() < Date.now();
}

async function recordEvent(svc: any, req: any, type: string, extra: Record<string, any> = {}, headers: Headers) {
  const ip = headers.get('x-forwarded-for')?.split(',')[0].trim() || null;
  const ua = headers.get('user-agent') || null;
  await svc.from('contract_signature_events').insert({
    signature_request_id: req.id,
    event_type: type as any,
    ip_address: ip,
    user_agent: ua,
    metadata: extra,
  });
  await svc.from('contract_signature_requests')
    .update({ last_ip: ip, last_user_agent: ua })
    .eq('id', req.id);
}

function otpCode6(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(n).padStart(6, '0');
}

// Código público humano-legível: 12 chars base32 (sem I/O/0/1), agrupado 4-4-4.
function generateValidationCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < 12; i++) {
    out += alphabet[bytes[i] % alphabet.length];
    if (i === 3 || i === 7) out += '-';
  }
  return out;
}

function publicValidationUrl(code: string): string {
  const site = Deno.env.get('PUBLIC_SITE_URL') ?? 'https://mcicrm.online';
  return `${site.replace(/\/$/, '')}/validar-assinatura/${code}`;
}

const EVENT_LABEL: Record<string, string> = {
  request_created: 'Solicitação criada',
  invitation_sent: 'Convite enviado',
  link_opened: 'Link aberto pelo signatário',
  identity_confirmed: 'Identidade confirmada',
  verification_code_sent: 'Código de verificação enviado',
  verification_code_validated: 'Código validado',
  document_viewed: 'Documento visualizado',
  terms_accepted: 'Termos aceitos',
  signature_completed: 'Assinatura concluída',
  signature_refused: 'Assinatura recusada',
  request_expired: 'Solicitação expirada',
  request_cancelled: 'Solicitação cancelada',
  document_downloaded: 'Documento baixado',
};

async function buildEvidencePdf(params: {
  request: any;
  events: any[];
  validationCode: string;
  validationUrl: string;
  signedHash: string;
}): Promise<Uint8Array> {
  const { request, events, validationCode, validationUrl, signedHash } = params;

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const green = rgb(0.06, 0.17, 0.15);
  const grey = rgb(0.35, 0.35, 0.35);
  const black = rgb(0.13, 0.13, 0.13);

  let page = pdfDoc.addPage([595, 842]); // A4
  const margin = 48;
  let y = 800;

  // Cabeçalho
  page.drawRectangle({ x: 0, y: 792, width: 595, height: 50, color: green });
  page.drawText('CERTIFICADO DE EVIDÊNCIAS DE ASSINATURA', {
    x: margin, y: 810, size: 14, font: bold, color: rgb(1, 1, 1),
  });
  page.drawText('MCI CRM • Provider: mci_native', {
    x: margin, y: 796, size: 8, font, color: rgb(0.85, 0.9, 0.88),
  });
  y = 770;

  // QR code
  try {
    const qrDataUrl: string = await QRCode.toDataURL(validationUrl, {
      errorCorrectionLevel: 'M', margin: 1, width: 240,
    });
    const b64 = qrDataUrl.replace(/^data:image\/png;base64,/, '');
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const qrImg = await pdfDoc.embedPng(bytes);
    page.drawImage(qrImg, { x: 595 - margin - 110, y: y - 110, width: 110, height: 110 });
  } catch (e) { console.warn('[evidence] qr falhou', e); }

  const drawKV = (label: string, value: string) => {
    page.drawText(label, { x: margin, y, size: 9, font: bold, color: grey });
    page.drawText(value, { x: margin, y: y - 12, size: 10, font, color: black });
    y -= 28;
  };

  drawKV('Código público de validação', validationCode);
  drawKV('URL de validação', validationUrl);
  drawKV('ID da assinatura', request.id);
  drawKV('Contrato', request.contract_id);
  y -= 6;

  page.drawText('SIGNATÁRIO', { x: margin, y, size: 10, font: bold, color: green });
  y -= 16;
  drawKV('Nome', request.signer_name);
  drawKV('CPF (mascarado)', maskCpf(request.signer_document));
  drawKV('E-mail', request.signer_email);
  if (request.signer_phone) drawKV('Telefone', request.signer_phone);
  drawKV('Método de assinatura', request.signature_method ?? '—');
  drawKV('Identidade confirmada em', request.identity_confirmed_at ? new Date(request.identity_confirmed_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—');
  drawKV('Assinado em', request.signed_at ? new Date(request.signed_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—');
  drawKV('IP do signatário', request.last_ip ?? '—');
  drawKV('User-agent', (request.last_user_agent ?? '—').slice(0, 90));

  y -= 6;
  page.drawText('INTEGRIDADE DO DOCUMENTO', { x: margin, y, size: 10, font: bold, color: green });
  y -= 16;
  drawKV('Hash SHA-256 do PDF original', request.original_document_hash ?? '—');
  drawKV('Hash SHA-256 do PDF assinado', signedHash);

  // Timeline
  y -= 4;
  page.drawText('TRILHA DE AUDITORIA', { x: margin, y, size: 10, font: bold, color: green });
  y -= 16;

  const ensureRoom = (needed: number) => {
    if (y - needed < 60) {
      page = pdfDoc.addPage([595, 842]);
      y = 800;
    }
  };

  for (const evt of events) {
    ensureRoom(30);
    const label = EVENT_LABEL[evt.event_type] ?? evt.event_type;
    const ts = evt.created_at ? new Date(evt.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '';
    page.drawCircle({ x: margin + 3, y: y + 3, size: 2.5, color: green });
    page.drawText(label, { x: margin + 14, y, size: 9.5, font: bold, color: black });
    y -= 12;
    const meta = `${ts}${evt.ip_address ? ` • IP ${evt.ip_address}` : ''}`;
    page.drawText(meta, { x: margin + 14, y, size: 8, font, color: grey });
    y -= 14;
  }

  // Rodapé em cada página
  const total = pdfDoc.getPageCount();
  for (let i = 0; i < total; i++) {
    const p = pdfDoc.getPage(i);
    p.drawText(
      `Certificado gerado automaticamente pelo CRM MCI • Valide em ${validationUrl}`,
      { x: margin, y: 24, size: 7, font, color: grey },
    );
    p.drawText(`Página ${i + 1}/${total}`, { x: 595 - margin - 50, y: 24, size: 7, font, color: grey });
  }

  return pdfDoc.save();
}

async function sendResend(to: string, subject: string, html: string) {
  const key = Deno.env.get('RESEND_API_KEY');
  const lovableKey = Deno.env.get('LOVABLE_API_KEY');
  if (!key || !lovableKey) return { sent: false, reason: 'email_provider_not_configured' };
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
  if (!resp.ok) return { sent: false, reason: `resend_${resp.status}` };
  await resp.json().catch(() => null);
  return { sent: true };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let payload: any;
  try { payload = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

  const action = String(payload.action ?? '');
  const token = String(payload.token ?? '');

  try {
    // ------------ fetch ------------
    if (action === 'fetch') {
      const { svc, request } = await loadRequestByToken(token);

      // Marca visualização se ainda não visto
      if (!request.viewed_at && ['sent','ready_to_send'].includes(request.status)) {
        await svc.from('contract_signature_requests').update({
          viewed_at: new Date().toISOString(),
          status: 'viewed',
        }).eq('id', request.id);
        await svc.from('generated_contracts').update({ signature_status: 'viewed' }).eq('id', request.contract_id);
      }
      await recordEvent(svc, request, 'link_opened', {}, req.headers);

      // URL assinada do PDF original (5 min)
      let pdfUrl: string | null = null;
      if (request.original_document_url) {
        const { data: signed } = await svc.storage
          .from('contract-originals')
          .createSignedUrl(request.original_document_url, 300);
        pdfUrl = signed?.signedUrl ?? null;
      }
      let signedPdfUrl: string | null = null;
      if (request.signed_document_url) {
        const { data: s } = await svc.storage
          .from('contract-signed')
          .createSignedUrl(request.signed_document_url, 300);
        signedPdfUrl = s?.signedUrl ?? null;
      }

      // Dados sanitizados do contrato
      const { data: contract } = await svc.from('generated_contracts')
        .select('id,client_name,total_value,created_at,contract_data_json')
        .eq('id', request.contract_id).maybeSingle();

      return json({
        ok: true,
        request: {
          id: request.id,
          status: request.status,
          expired: isExpired(request),
          signer: {
            name: request.signer_name,
            documentMasked: maskCpf(request.signer_document),
            emailHint: request.signer_email.replace(/(.{2}).*(@.*)/, '$1***$2'),
            phoneMasked: maskPhone(request.signer_phone),
          },
          expires_at: request.expires_at,
          signed_at: request.signed_at,
          refused_at: request.refused_at,
          cancelled_at: request.cancelled_at,
          pdfUrl,
          signedPdfUrl,
        },
        contract: contract ? {
          number: (contract.contract_data_json as any)?.number ?? contract.id.slice(0, 8).toUpperCase(),
          title: 'Contrato de Pré-Venda e Entrega Futura',
          client: contract.client_name,
          total_value: contract.total_value,
          created_at: contract.created_at,
        } : null,
      });
    }

    // ------------ confirm identity ------------
    if (action === 'confirm_identity') {
      const { svc, request } = await loadRequestByToken(token);
      if (isExpired(request)) return json({ error: 'Link expirado' }, 410);
      if (['cancelled','refused','signed'].includes(request.status)) {
        return json({ error: 'Solicitação encerrada' }, 409);
      }
      const nameOk = String(payload.name ?? '').trim().toLowerCase() ===
        request.signer_name.trim().toLowerCase();
      const docOk = String(payload.document ?? '').replace(/\D/g, '') === request.signer_document;
      const emailOk = String(payload.email ?? '').trim().toLowerCase() ===
        request.signer_email.trim().toLowerCase();
      if (!nameOk || !docOk || !emailOk) {
        await recordEvent(svc, request, 'identity_confirmed', { success: false }, req.headers);
        return json({ error: 'Os dados não conferem com o signatário' }, 400);
      }
      await svc.from('contract_signature_requests').update({
        identity_confirmed_at: new Date().toISOString(),
        status: 'awaiting_signature',
      }).eq('id', request.id);
      await svc.from('generated_contracts').update({ signature_status: 'awaiting_signature' }).eq('id', request.contract_id);
      await recordEvent(svc, request, 'identity_confirmed', { success: true }, req.headers);
      return json({ ok: true });
    }

    // ------------ request otp ------------
    if (action === 'request_otp') {
      const { svc, request } = await loadRequestByToken(token);
      if (isExpired(request)) return json({ error: 'Link expirado' }, 410);
      if (!request.identity_confirmed_at) return json({ error: 'Confirme sua identidade primeiro' }, 400);

      const code = otpCode6();
      const codeHash = await sha256Hex(code);
      await svc.from('contract_signature_requests').update({
        otp_code_hash: codeHash,
        otp_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        otp_attempts: 0,
      }).eq('id', request.id);

      const em = await sendResend(
        request.signer_email,
        'Seu código de verificação — MCI',
        `<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:24px;color:#111">
          <h2 style="color:#0f2b26">Código de verificação</h2>
          <p>Use este código para confirmar sua assinatura no contrato MCI:</p>
          <div style="font-size:32px;letter-spacing:8px;font-weight:bold;background:#f4f4f4;padding:16px;border-radius:8px;text-align:center">${code}</div>
          <p style="color:#555;font-size:12px;margin-top:16px">Válido por 10 minutos. Não compartilhe este código.</p>
        </div>`
      );
      await recordEvent(svc, request, 'verification_code_sent', { emailSent: em.sent }, req.headers);
      return json({ ok: true, emailSent: em.sent });
    }

    // ------------ verify otp ------------
    if (action === 'verify_otp') {
      const { svc, request } = await loadRequestByToken(token);
      if (isExpired(request)) return json({ error: 'Link expirado' }, 410);
      if (!request.otp_code_hash || !request.otp_expires_at) {
        return json({ error: 'Solicite um novo código' }, 400);
      }
      if (new Date(request.otp_expires_at).getTime() < Date.now()) {
        return json({ error: 'Código expirado. Solicite um novo.' }, 400);
      }
      if ((request.otp_attempts ?? 0) >= 5) {
        return json({ error: 'Muitas tentativas. Solicite um novo código.' }, 429);
      }
      const code = String(payload.code ?? '').trim();
      const hash = await sha256Hex(code);
      if (hash !== request.otp_code_hash) {
        await svc.from('contract_signature_requests')
          .update({ otp_attempts: (request.otp_attempts ?? 0) + 1 })
          .eq('id', request.id);
        return json({ error: 'Código inválido' }, 400);
      }
      await recordEvent(svc, request, 'verification_code_validated', {}, req.headers);
      return json({ ok: true });
    }

    // ------------ refuse ------------
    if (action === 'refuse') {
      const { svc, request } = await loadRequestByToken(token);
      if (isExpired(request)) return json({ error: 'Link expirado' }, 410);
      if (['cancelled','refused','signed'].includes(request.status)) {
        return json({ error: 'Solicitação encerrada' }, 409);
      }
      await svc.from('contract_signature_requests').update({
        status: 'refused',
        refused_at: new Date().toISOString(),
      }).eq('id', request.id);
      await svc.from('generated_contracts').update({ signature_status: 'refused' }).eq('id', request.contract_id);
      await recordEvent(svc, request, 'signature_refused', { reason: payload.reason ?? null }, req.headers);
      // notifica dono
      const { data: contract } = await svc.from('generated_contracts')
        .select('created_by,client_name').eq('id', request.contract_id).maybeSingle();
      if (contract?.created_by) {
        await svc.from('notifications').insert({
          user_id: contract.created_by,
          title: 'Contrato recusado',
          message: `${request.signer_name} recusou a assinatura do contrato de ${contract.client_name}.`,
          type: 'contract_signature',
        });
      }
      return json({ ok: true });
    }

    // ------------ sign ------------
    if (action === 'sign') {
      const { svc, request } = await loadRequestByToken(token);
      if (isExpired(request)) return json({ error: 'Link expirado' }, 410);
      if (request.status === 'signed') return json({ error: 'Já assinado' }, 409);
      if (['cancelled','refused'].includes(request.status)) return json({ error: 'Solicitação encerrada' }, 409);
      if (!request.identity_confirmed_at) return json({ error: 'Confirme sua identidade' }, 400);

      const acceptedTerms = payload.acceptedTerms === true;
      if (!acceptedTerms) return json({ error: 'Aceite dos termos obrigatório' }, 400);

      const signatureImageBase64 = String(payload.signatureImageBase64 ?? '');
      const typedName = String(payload.typedName ?? '').trim();
      const method = payload.method === 'drawn' ? 'drawn' : payload.method === 'typed' ? 'typed' : 'button';
      if (method === 'drawn' && signatureImageBase64.length < 100) return json({ error: 'Assinatura desenhada ausente' }, 400);
      if (method === 'typed' && !typedName) return json({ error: 'Digite seu nome' }, 400);

      // Baixar PDF original
      const { data: origBlob } = await svc.storage
        .from('contract-originals').download(request.original_document_url!);
      if (!origBlob) return json({ error: 'PDF original indisponível' }, 500);
      const origBytes = new Uint8Array(await origBlob.arrayBuffer());

      // Valida hash
      const currHash = await sha256Hex(origBytes);
      if (currHash !== request.original_document_hash) {
        return json({ error: 'Integridade do documento comprometida' }, 500);
      }

      // Selo visual com pdf-lib
      const pdfDoc = await PDFDocument.load(origBytes);
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const page = pdfDoc.getPages()[pdfDoc.getPageCount() - 1];
      const { width } = page.getSize();
      const seal = {
        x: 40, y: 40, w: width - 80, h: 100,
      };
      page.drawRectangle({
        x: seal.x, y: seal.y, width: seal.w, height: seal.h,
        borderColor: rgb(0.06, 0.17, 0.15), borderWidth: 1,
        color: rgb(0.97, 0.98, 0.98),
      });
      page.drawText('ASSINADO ELETRONICAMENTE — MCI', {
        x: seal.x + 12, y: seal.y + seal.h - 18, size: 10, font: boldFont, color: rgb(0.06, 0.17, 0.15),
      });
      const lines = [
        `Signatário: ${request.signer_name}`,
        `CPF: ${maskCpf(request.signer_document)}`,
        `Data/hora: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
        `ID da assinatura: ${request.id}`,
        `Hash SHA-256 do documento original: ${request.original_document_hash?.slice(0, 32)}...`,
      ];
      let yy = seal.y + seal.h - 34;
      for (const line of lines) {
        page.drawText(line, { x: seal.x + 12, y: yy, size: 8, font, color: rgb(0.13, 0.13, 0.13) });
        yy -= 12;
      }

      // Se desenhada, embute imagem no selo
      if (method === 'drawn') {
        try {
          const b64 = signatureImageBase64.replace(/^data:.*;base64,/, '');
          const bin = atob(b64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          const png = await pdfDoc.embedPng(bytes);
          const targetH = 40;
          const targetW = targetH * (png.width / png.height);
          page.drawImage(png, {
            x: seal.x + seal.w - targetW - 12,
            y: seal.y + 12, width: targetW, height: targetH,
          });
        } catch (e) {
          console.warn('[sign] falha ao embutir imagem da assinatura', e);
        }
      } else if (method === 'typed') {
        page.drawText(typedName, {
          x: seal.x + seal.w - 180, y: seal.y + 20, size: 14,
          font: boldFont, color: rgb(0.06, 0.17, 0.15),
        });
      }

      const signedBytes = await pdfDoc.save();
      const signedBytesU8 = new Uint8Array(signedBytes);
      const signedHash = await sha256Hex(signedBytesU8);
      const signedPath = `${request.contract_id}/${request.id}/signed.pdf`;
      const { error: upErr } = await svc.storage.from('contract-signed')
        .upload(signedPath, signedBytesU8, { contentType: 'application/pdf', upsert: true });
      if (upErr) return json({ error: `Falha ao salvar assinado: ${upErr.message}` }, 500);

      // Gera código público único de validação (retry em caso improvável de colisão).
      let validationCode = generateValidationCode();
      for (let i = 0; i < 4; i++) {
        const { data: exists } = await svc
          .from('contract_signature_requests')
          .select('id').eq('validation_code', validationCode).maybeSingle();
        if (!exists) break;
        validationCode = generateValidationCode();
      }

      await svc.from('contract_signature_requests').update({
        status: 'signed',
        signed_at: new Date().toISOString(),
        signed_document_url: signedPath,
        signed_document_hash: signedHash,
        signature_method: method,
        signature_image: method === 'drawn' ? '[stored]' : null,
        terms_accepted_at: new Date().toISOString(),
        validation_code: validationCode,
      }).eq('id', request.id);
      await svc.from('generated_contracts').update({
        signature_status: 'signed',
        signed_file_url: signedPath,
        signed_file_name: 'signed.pdf',
        signed_uploaded_at: new Date().toISOString(),
      }).eq('id', request.contract_id);
      await recordEvent(svc, request, 'terms_accepted', {}, req.headers);
      await recordEvent(svc, request, 'signature_completed', { method }, req.headers);

      // Gera certificado de evidências (PDF com trilha de auditoria + QR).
      try {
        const { data: fullReq } = await svc
          .from('contract_signature_requests').select('*').eq('id', request.id).maybeSingle();
        const { data: evts } = await svc
          .from('contract_signature_events')
          .select('*').eq('signature_request_id', request.id)
          .order('created_at', { ascending: true });
        const validationUrl = publicValidationUrl(validationCode);
        const evBytes = await buildEvidencePdf({
          request: fullReq ?? request,
          events: evts ?? [],
          validationCode,
          validationUrl,
          signedHash,
        });
        const evPath = `${request.contract_id}/${request.id}/evidence.pdf`;
        const { error: evUp } = await svc.storage.from('contract-evidence')
          .upload(evPath, new Uint8Array(evBytes), { contentType: 'application/pdf', upsert: true });
        if (!evUp) {
          await svc.from('contract_signature_requests')
            .update({ evidence_document_url: evPath })
            .eq('id', request.id);
        } else {
          console.warn('[sign] falha ao salvar certificado', evUp);
        }
      } catch (e) {
        console.warn('[sign] falha gerando certificado de evidências', e);
      }

      // Notifica dono
      const { data: contract } = await svc.from('generated_contracts')
        .select('created_by,client_name').eq('id', request.contract_id).maybeSingle();
      if (contract?.created_by) {
        await svc.from('notifications').insert({
          user_id: contract.created_by,
          title: 'Contrato assinado',
          message: `${request.signer_name} assinou o contrato de ${contract.client_name}.`,
          type: 'contract_signature',
        });
      }

      return json({ ok: true, validationCode, validationUrl: publicValidationUrl(validationCode) });
    }

    // ------------ validate (público, por código curto) ------------
    if (action === 'validate') {
      const svc = svcClient();
      const code = String(payload.code ?? '').trim().toUpperCase();
      if (!code || code.length < 8) return json({ error: 'Código inválido' }, 400);
      const { data: reqRow } = await svc
        .from('contract_signature_requests')
        .select('*')
        .eq('validation_code', code)
        .maybeSingle();
      if (!reqRow) return json({ ok: false, error: 'Assinatura não encontrada' }, 404);
      if (reqRow.status !== 'signed') return json({ ok: false, error: 'Assinatura não concluída' }, 409);

      const { data: contract } = await svc.from('generated_contracts')
        .select('id,client_name,total_value,created_at,contract_data_json')
        .eq('id', reqRow.contract_id).maybeSingle();

      const { data: evts } = await svc
        .from('contract_signature_events')
        .select('event_type,created_at,ip_address,metadata')
        .eq('signature_request_id', reqRow.id)
        .order('created_at', { ascending: true });

      let signedPdfUrl: string | null = null;
      if (reqRow.signed_document_url) {
        const { data } = await svc.storage.from('contract-signed')
          .createSignedUrl(reqRow.signed_document_url, 300);
        signedPdfUrl = data?.signedUrl ?? null;
      }
      let evidencePdfUrl: string | null = null;
      if (reqRow.evidence_document_url) {
        const { data } = await svc.storage.from('contract-evidence')
          .createSignedUrl(reqRow.evidence_document_url, 300);
        evidencePdfUrl = data?.signedUrl ?? null;
      }

      return json({
        ok: true,
        signature: {
          id: reqRow.id,
          provider: reqRow.provider,
          signer: {
            name: reqRow.signer_name,
            documentMasked: maskCpf(reqRow.signer_document),
            emailHint: reqRow.signer_email.replace(/(.{2}).*(@.*)/, '$1***$2'),
          },
          signed_at: reqRow.signed_at,
          method: reqRow.signature_method,
          original_hash: reqRow.original_document_hash,
          signed_hash: reqRow.signed_document_hash,
          ip: reqRow.last_ip,
        },
        contract: contract ? {
          number: (contract.contract_data_json as any)?.number ?? contract.id.slice(0, 8).toUpperCase(),
          title: 'Contrato de Pré-Venda e Entrega Futura',
          client: contract.client_name,
          total_value: contract.total_value,
          created_at: contract.created_at,
        } : null,
        events: evts ?? [],
        signedPdfUrl,
        evidencePdfUrl,
      });
    }

    return json({ error: `Ação desconhecida: ${action}` }, 400);
  } catch (e: any) {
    console.error('[contract-signature-public] erro', e);
    return json({ error: e?.message ?? 'Erro interno' }, 500);
  }
});
