// Stub Clicksign provider — placeholder para integração futura.
// Implementa a interface SignatureProvider; nenhum método real ainda.
// Quando ativado, substitui o provider nativo sem tocar no módulo de contratos.

import type {
  SignatureProvider,
  CreateSignatureRequestInput,
  CreateSignatureRequestResult,
  SignatureStatus,
  WebhookInput,
} from './types.ts';

export class ClicksignStubProvider implements SignatureProvider {
  readonly name = 'clicksign';

  async createSignatureRequest(_input: CreateSignatureRequestInput): Promise<CreateSignatureRequestResult> {
    throw new Error('Provider clicksign ainda não configurado. Configure a CLICKSIGN_API_TOKEN e implemente a integração.');
  }
  async getSignatureStatus(_requestId: string): Promise<SignatureStatus> {
    throw new Error('Provider clicksign ainda não configurado.');
  }
  async cancelSignatureRequest(_requestId: string, _reason?: string): Promise<void> {
    throw new Error('Provider clicksign ainda não configurado.');
  }
  async downloadSignedDocument(_requestId: string): Promise<Uint8Array> {
    throw new Error('Provider clicksign ainda não configurado.');
  }
  async processWebhook(_input: WebhookInput): Promise<{ handled: boolean; requestId?: string }> {
    return { handled: false };
  }
}
