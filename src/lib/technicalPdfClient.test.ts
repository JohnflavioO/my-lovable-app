import { describe, expect, it, vi } from 'vitest';
import { requireTechnicalClientAddress, resolveTechnicalPdfClient } from './technicalPdfClient';

const { lookup } = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (table: string) => ({ select: () => ({ eq: () => ({ maybeSingle: () => lookup(table) }) }) }) },
}));

describe('endereço obrigatório na exportação de OS', () => {
  it('inclui rua, cidade, estado e CEP do cliente', () => {
    expect(requireTechnicalClientAddress({ address: 'Rua Teste, 123', city: 'São Paulo', state: 'SP', zip_code: '01000-000' }))
      .toBe('Rua Teste, 123, São Paulo - SP, CEP 01000-000');
  });
  it('impede exportação sem endereço cadastrado', () => {
    expect(() => requireTechnicalClientAddress({ address: ' ', city: 'São Paulo' })).toThrow('Cadastre o endereço');
  });
  it('preserva número, complemento e bairro do endereço comercial', () => {
    expect(requireTechnicalClientAddress({ address: 'Rua Comercial', address_number: '90', complement: 'Sala 2', neighborhood: 'Centro' }))
      .toBe('Rua Comercial, 90, Sala 2, Centro');
  });
  it('consulta o endereço para chamadas que recebem somente a OS', async () => {
    lookup.mockResolvedValueOnce({ data: { address: 'Rua Cliente, 45' }, error: null });
    expect((await resolveTechnicalPdfClient({ client_id: 'cliente-1' })).address).toBe('Rua Cliente, 45');
    expect(lookup).toHaveBeenLastCalledWith('technical_clients');
  });
  it('usa o endereço do cadastro comercial vinculado quando necessário', async () => {
    lookup.mockResolvedValueOnce({ data: { address: '', crm_client_id: 'crm-1' }, error: null })
      .mockResolvedValueOnce({ data: { address: 'Rua Comercial, 90', cep: '02000-000' }, error: null });
    expect((await resolveTechnicalPdfClient({ client_id: 'cliente-2' })).address).toBe('Rua Comercial, 90, CEP 02000-000');
  });
  it('não exporta silenciosamente quando a consulta falha', async () => {
    lookup.mockResolvedValueOnce({ data: null, error: { message: 'falha' } });
    await expect(resolveTechnicalPdfClient({ client_id: 'cliente-3' })).rejects.toThrow('Não foi possível consultar');
  });
  it('permite mostrar cadastro sem endereço na tela, mas bloqueia exportação', async () => {
    lookup.mockResolvedValue({ data: { name: 'Cliente', address: '' }, error: null });
    expect((await resolveTechnicalPdfClient({ client_id: 'cliente-4' }, undefined, { requireAddress: false })).address).toBe('');
    await expect(resolveTechnicalPdfClient({ client_id: 'cliente-4' })).rejects.toThrow('Cadastre o endereço');
  });
  it('resolve o endereço de ordens de compra com o mesmo vínculo de cliente', async () => {
    lookup.mockResolvedValueOnce({ data: { address: 'Rua Compra', city: 'Campinas', state: 'SP', zip_code: '13000-000' }, error: null });
    expect((await resolveTechnicalPdfClient({ client_id: 'cliente-compra' })).address).toBe('Rua Compra, Campinas - SP, CEP 13000-000');
  });
});