export interface TechnicalPdfClient {
  name?: string;
  address?: string;
  address_number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  cep?: string;
  crm_client_id?: string;
  [key: string]: unknown;
}

export function requireTechnicalClientAddress(client: TechnicalPdfClient): string {
  const street = String(client.address || '').trim();
  if (!street) {
    throw new Error('Cadastre o endereço do cliente no Suporte Técnico antes de exportar a OS.');
  }
  const locality = [client.city, client.state].filter(Boolean).join(' - ');
  const postalCode = String(client.zip_code || client.cep || '').trim();
  return [street, client.address_number, client.complement, client.neighborhood, locality, postalCode ? `CEP ${postalCode}` : ''].filter(Boolean).join(', ');
}

export async function resolveTechnicalPdfClient(os: any, provided?: TechnicalPdfClient, options?: { requireAddress?: boolean }) {
  let client: TechnicalPdfClient = provided || {};
  if (os.client_id) {
    const { supabase } = await import('@/integrations/supabase/client');
    const { data, error } = await supabase.from('technical_clients').select('*').eq('id', os.client_id).maybeSingle();
    if (error) throw new Error('Não foi possível consultar o endereço do cliente. Tente novamente.');
    client = { ...client, ...(data || {}) };
    if (!String(client.address || '').trim() && client.crm_client_id) {
      const { data: crm, error: crmError } = await supabase.from('clients').select('address,address_number,complement,neighborhood,city,state,cep').eq('id', String(client.crm_client_id)).maybeSingle();
      if (crmError) throw new Error('Não foi possível consultar o endereço do cliente. Tente novamente.');
      if (crm) client = { ...client, ...crm };
    }
  }
  const address = options?.requireAddress === false && !String(client.address || '').trim()
    ? '' : requireTechnicalClientAddress(client);
  return { client, address };
}