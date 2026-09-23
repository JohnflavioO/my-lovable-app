import type { SignatureProvider } from './types.ts';
import { MciNativeSignatureProvider } from './mci-native.ts';
import { ClicksignStubProvider } from './clicksign-stub.ts';
import { D4SignStubProvider } from './d4sign-stub.ts';
import { DocuSignStubProvider } from './docusign-stub.ts';

const providers: Record<string, SignatureProvider> = {
  mci_native: new MciNativeSignatureProvider(),
  clicksign: new ClicksignStubProvider(),
  d4sign: new D4SignStubProvider(),
  docusign: new DocuSignStubProvider(),
};

export function getSignatureProvider(name?: string | null): SignatureProvider {
  const key = (name ?? 'mci_native').toLowerCase();
  const provider = providers[key];
  if (!provider) throw new Error(`Provider de assinatura não suportado: ${key}`);
  return provider;
}

export function listSignatureProviders(): string[] {
  return Object.keys(providers);
}
