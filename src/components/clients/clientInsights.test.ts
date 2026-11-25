import { describe, expect, it } from 'vitest';
import {
  buildClientInsights, findPortfolioDuplicate, formatDoc, formatPhone, isIncomplete,
  samePortfolioDuplicates, situationOf, timeAgo, whatsappLink,
} from './clientInsights';

const NOW = new Date('2026-11-25T12:00:00Z').getTime();
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

describe('situação do cliente', () => {
  it('sem orçamento', () => {
    expect(situationOf({ quotes: 0, lastQuoteAt: null, wonValue: 0, hasOpen: false }, NOW)).toBe('no_quote');
  });
  it('inativo quando o último orçamento passou de 90 dias, mesmo se já comprou', () => {
    const m = buildClientInsights([{ client_id: 'a', status: 'approved', total_amount: 100, created_at: daysAgo(120) }], NOW);
    expect(m.get('a')?.situation).toBe('inactive');
  });
  it('cliente quando tem aprovado recente', () => {
    const m = buildClientInsights([
      { client_id: 'a', status: 'approved', total_amount: '1500.5', quote_date: daysAgo(10).slice(0, 10) },
      { client_id: 'a', status: 'sent', total_amount: 99, created_at: daysAgo(5) },
    ], NOW);
    expect(m.get('a')).toMatchObject({ quotes: 2, wonValue: 1500.5, hasOpen: true, situation: 'customer' });
  });
  it('em negociação quando só tem orçamentos em aberto recentes', () => {
    const m = buildClientInsights([{ client_id: 'b', status: 'negociacao', created_at: daysAgo(3) }], NOW);
    expect(m.get('b')?.situation).toBe('negotiating');
  });
});

describe('formatação para exibição', () => {
  it('CPF e CNPJ', () => {
    expect(formatDoc('65566298000147')).toBe('65.566.298/0001-47');
    expect(formatDoc('41.760.916/0001-27')).toBe('41.760.916/0001-27');
    expect(formatDoc('12345678901')).toBe('123.456.789-01');
    expect(formatDoc('ABC')).toBe('ABC');
  });
  it('telefone', () => {
    expect(formatPhone('67993372900')).toBe('(67) 99337-2900');
    expect(formatPhone('1135670150')).toBe('(11) 3567-0150');
    expect(formatPhone('5511958588287')).toBe('(11) 95858-8287');
    expect(formatPhone('123')).toBe('123');
  });
  it('link do WhatsApp com DDI', () => {
    expect(whatsappLink('(11) 95858-8287')).toBe('https://wa.me/5511958588287');
    expect(whatsappLink('5511958588287')).toBe('https://wa.me/5511958588287');
    expect(whatsappLink('123')).toBeNull();
  });
  it('tempo decorrido', () => {
    expect(timeAgo(null, NOW)).toBe('—');
    expect(timeAgo(NOW, NOW)).toBe('hoje');
    expect(timeAgo(NOW - 12 * 86_400_000, NOW)).toBe('há 12 dias');
    expect(timeAgo(NOW - 95 * 86_400_000, NOW)).toBe('há 3 meses');
  });
  it('cadastro incompleto', () => {
    expect(isIncomplete({ phone: '11999998888', email: 'a@b.com' })).toBe(false);
    expect(isIncomplete({ phone: '', email: 'a@b.com' })).toBe(true);
    expect(isIncomplete({ phone: '11999998888', email: '' })).toBe(true);
  });
});

describe('repetidos na carteira', () => {
  const clients = [
    { id: '1', created_by: 'ana', cpf_cnpj: '65.566.298/0001-47' },
    { id: '2', created_by: 'ana', cpf_cnpj: '65566298000147' },
    { id: '3', created_by: 'bruno', cpf_cnpj: '65566298000147' },
    { id: '4', created_by: 'bruno', cpf_cnpj: '' },
    { id: '5', created_by: 'bruno', cpf_cnpj: '' },
  ];
  it('marca só os repetidos dentro da mesma carteira', () => {
    expect([...samePortfolioDuplicates(clients)].sort()).toEqual(['1', '2']);
  });
  it('permite o mesmo documento em carteira de outro vendedor', () => {
    expect(findPortfolioDuplicate(clients, 'carla', '65566298000147')).toBeUndefined();
  });
  it('bloqueia o mesmo documento na mesma carteira, ignorando o próprio cadastro', () => {
    expect(findPortfolioDuplicate(clients, 'bruno', '65.566.298/0001-47')?.id).toBe('3');
    expect(findPortfolioDuplicate(clients, 'bruno', '65566298000147', '3')).toBeUndefined();
  });
  it('ignora documento vazio', () => {
    expect(findPortfolioDuplicate(clients, 'bruno', '')).toBeUndefined();
  });
});
