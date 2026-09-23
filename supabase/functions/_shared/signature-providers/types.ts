// Interface do provedor de assinatura eletrônica.
// Qualquer provedor (mci_native, Clicksign, D4Sign, DocuSign) deve implementar isto.
// O módulo de contratos nunca importa a implementação — apenas essa interface.

export interface CreateSignatureRequestInput {
  contractId: string;
  companyId: string | null;
  createdBy: string;
  signer: {
    name: string;
    document: string;
    email: string;
    phone?: string | null;
  };
  originalPdfBase64: string;
  expiresAt: string; // ISO
}

export interface CreateSignatureRequestResult {
  requestId: string;
  publicToken: string;   // token em claro devolvido apenas nessa hora
  publicUrl: string;     // URL para o cliente assinar
  originalHash: string;
}

export interface SignatureStatus {
  requestId: string;
  status: string;
  signedUrl?: string | null;
  evidenceUrl?: string | null;
}

export interface WebhookInput {
  headers: Record<string, string>;
  body: unknown;
}

export interface SignatureProvider {
  readonly name: string;
  createSignatureRequest(input: CreateSignatureRequestInput): Promise<CreateSignatureRequestResult>;
  getSignatureStatus(requestId: string): Promise<SignatureStatus>;
  cancelSignatureRequest(requestId: string, reason?: string): Promise<void>;
  downloadSignedDocument(requestId: string): Promise<Uint8Array>;
  processWebhook(input: WebhookInput): Promise<{ handled: boolean; requestId?: string }>;
}
