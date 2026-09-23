// Stub DocuSign provider — placeholder para integração futura.

import type {
  SignatureProvider,
  CreateSignatureRequestInput,
  CreateSignatureRequestResult,
  SignatureStatus,
  WebhookInput,
} from './types.ts';

export class DocuSignStubProvider implements SignatureProvider {
  readonly name = 'docusign';

  async createSignatureRequest(_input: CreateSignatureRequestInput): Promise<CreateSignatureRequestResult> {
    throw new Error('Provider docusign ainda não configurado. Configure DOCUSIGN_INTEGRATION_KEY e implemente a integração.');
  }
  async getSignatureStatus(_requestId: string): Promise<SignatureStatus> {
    throw new Error('Provider docusign ainda não configurado.');
  }
  async cancelSignatureRequest(_requestId: string, _reason?: string): Promise<void> {
    throw new Error('Provider docusign ainda não configurado.');
  }
  async downloadSignedDocument(_requestId: string): Promise<Uint8Array> {
    throw new Error('Provider docusign ainda não configurado.');
  }
  async processWebhook(_input: WebhookInput): Promise<{ handled: boolean; requestId?: string }> {
    return { handled: false };
  }
}
