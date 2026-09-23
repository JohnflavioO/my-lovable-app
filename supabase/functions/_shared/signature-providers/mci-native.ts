// Implementação nativa do CRM MCI para assinatura eletrônica.
// Faz o "trabalho pesado" (upload, hash, token) mas fica atrás da interface SignatureProvider.

import { createClient } from 'npm:@supabase/supabase-js@2.45.0';
import type {
  SignatureProvider,
  CreateSignatureRequestInput,
  CreateSignatureRequestResult,
  SignatureStatus,
  WebhookInput,
} from './types.ts';

const ORIGINALS_BUCKET = 'contract-originals';

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/^data:.*;base64,/, '');
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomTokenBase64Url(byteLen = 32): string {
  const bytes = new Uint8Array(byteLen);
  crypto.getRandomValues(bytes);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hashTokenHex(token: string): Promise<string> {
  const enc = new TextEncoder().encode(token);
  return sha256Hex(enc);
}

function getServiceClient() {
  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

function publicSignUrl(token: string): string {
  const site =
    Deno.env.get('PUBLIC_SITE_URL') ??
    'https://mcicrm.online';
  return `${site.replace(/\/$/, '')}/assinar-contrato/${token}`;
}

export class MciNativeSignatureProvider implements SignatureProvider {
  readonly name = 'mci_native';

  async createSignatureRequest(input: CreateSignatureRequestInput): Promise<CreateSignatureRequestResult> {
    const svc = getServiceClient();
    const pdfBytes = base64ToBytes(input.originalPdfBase64);
    if (pdfBytes.length < 200) throw new Error('PDF original inválido');
    const originalHash = await sha256Hex(pdfBytes);

    const requestId = crypto.randomUUID();
    const path = `${input.contractId}/${requestId}/original.pdf`;

    const { error: upErr } = await svc.storage
      .from(ORIGINALS_BUCKET)
      .upload(path, pdfBytes, { contentType: 'application/pdf', upsert: false });
    if (upErr) throw new Error(`Falha ao salvar PDF: ${upErr.message}`);

    const token = randomTokenBase64Url(32);
    const tokenHash = await hashTokenHex(token);

    const { error: insErr } = await svc.from('contract_signature_requests').insert({
      id: requestId,
      contract_id: input.contractId,
      company_id: input.companyId,
      created_by: input.createdBy,
      provider: this.name,
      provider_request_id: requestId,
      signer_name: input.signer.name,
      signer_document: input.signer.document,
      signer_email: input.signer.email.toLowerCase().trim(),
      signer_phone: input.signer.phone ?? null,
      status: 'sent',
      public_token_hash: tokenHash,
      expires_at: input.expiresAt,
      sent_at: new Date().toISOString(),
      original_document_url: path,
      original_document_hash: originalHash,
    });
    if (insErr) throw new Error(`Falha ao criar solicitação: ${insErr.message}`);

    await svc.from('contract_signature_events').insert([
      { signature_request_id: requestId, event_type: 'request_created' },
      { signature_request_id: requestId, event_type: 'invitation_sent' },
    ]);

    await svc.from('generated_contracts')
      .update({ signature_status: 'sent' })
      .eq('id', input.contractId);

    return {
      requestId,
      publicToken: token,
      publicUrl: publicSignUrl(token),
      originalHash,
    };
  }

  async getSignatureStatus(requestId: string): Promise<SignatureStatus> {
    const svc = getServiceClient();
    const { data, error } = await svc
      .from('contract_signature_requests')
      .select('id,status,signed_document_url,evidence_document_url')
      .eq('id', requestId)
      .maybeSingle();
    if (error || !data) throw new Error('Solicitação não encontrada');
    return {
      requestId: data.id,
      status: data.status,
      signedUrl: data.signed_document_url,
      evidenceUrl: data.evidence_document_url,
    };
  }

  async cancelSignatureRequest(requestId: string, reason?: string): Promise<void> {
    const svc = getServiceClient();
    const { data: req } = await svc
      .from('contract_signature_requests')
      .select('contract_id,status')
      .eq('id', requestId).maybeSingle();
    if (!req) throw new Error('Solicitação não encontrada');
    if (['signed', 'cancelled', 'refused', 'expired'].includes(req.status)) {
      throw new Error('Solicitação já finalizada');
    }
    await svc.from('contract_signature_requests').update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
    }).eq('id', requestId);
    await svc.from('contract_signature_events').insert({
      signature_request_id: requestId,
      event_type: 'request_cancelled',
      metadata: reason ? { reason } : {},
    });
    if (req.contract_id) {
      await svc.from('generated_contracts')
        .update({ signature_status: 'cancelled' })
        .eq('id', req.contract_id);
    }
  }

  async downloadSignedDocument(requestId: string): Promise<Uint8Array> {
    const svc = getServiceClient();
    const { data: req } = await svc
      .from('contract_signature_requests')
      .select('signed_document_url')
      .eq('id', requestId).maybeSingle();
    if (!req?.signed_document_url) throw new Error('Documento assinado indisponível');
    const { data, error } = await svc.storage
      .from('contract-signed').download(req.signed_document_url);
    if (error || !data) throw new Error('Falha ao baixar documento assinado');
    return new Uint8Array(await data.arrayBuffer());
  }

  async processWebhook(_input: WebhookInput): Promise<{ handled: boolean; requestId?: string }> {
    // Provider nativo não recebe webhooks externos — assinatura acontece dentro do próprio CRM.
    return { handled: false };
  }
}
