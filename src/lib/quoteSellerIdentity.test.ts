import { describe, expect, it } from 'vitest';
import { resolveQuoteSellerId } from './quoteSellerIdentity';

describe('edição de orçamento pelo gestor', () => {
  it('mantém o comercial original ao salvar sem trocar o vendedor', () => {
    expect(resolveQuoteSellerId({ salesperson: 'Comercial', salesperson_id: 'original' }, 'Comercial', 'catalog-id', 'gestor')).toBe('original');
  });
  it('não atribui ao gestor um orçamento legado sem vínculo de vendedor', () => {
    expect(resolveQuoteSellerId({ salesperson: 'Comercial', salesperson_id: null }, 'Comercial', undefined, 'gestor')).toBeNull();
  });
  it('respeita uma troca explícita de vendedor', () => {
    expect(resolveQuoteSellerId({ salesperson: 'Comercial', salesperson_id: 'original' }, 'Outro', 'outro-id', 'gestor')).toBe('outro-id');
  });
});