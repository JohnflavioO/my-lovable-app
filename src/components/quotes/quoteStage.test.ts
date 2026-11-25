import { describe, expect, it } from 'vitest';
import { getQuoteStage, sellerInitials } from './quoteStage';

describe('getQuoteStage', () => {
  it('treats anything not approved/rejected and not billed as negotiation', () => {
    for (const status of ['draft', 'sent', 'negociacao', 'pre_venda', 'contato_feito', null]) {
      expect(getQuoteStage({ status }).key).toBe('negotiation');
    }
  });

  it('marks approved quotes not yet billed as approved', () => {
    expect(getQuoteStage({ status: 'approved', payment_status: 'pendente' }).key).toBe('approved');
  });

  it('billing wins over status once the quote was sent to billing', () => {
    expect(getQuoteStage({ status: 'approved', payment_status: 'em_andamento', billing_sent_at: '2026-11-20' }).key).toBe('billing');
    expect(getQuoteStage({ status: 'approved', payment_status: 'faturado', billing_sent_at: '2026-11-20' }).key).toBe('billing');
  });

  it('billed and settled quotes are settled', () => {
    expect(getQuoteStage({ status: 'approved', payment_status: 'liquidado', billing_sent_at: '2026-11-20' }).key).toBe('settled');
  });

  it('settled payment without billing does not skip the billing step', () => {
    expect(getQuoteStage({ status: 'approved', payment_status: 'liquidado' }).key).toBe('approved');
  });

  it('rejected quotes are outside the progress', () => {
    const stage = getQuoteStage({ status: 'rejected' });
    expect(stage.key).toBe('rejected');
    expect(stage.step).toBe(0);
  });
});

describe('sellerInitials', () => {
  it('uses first and last name', () => {
    expect(sellerInitials('John Flavio')).toBe('JF');
    expect(sellerInitials('Ana Maria de Souza')).toBe('AS');
  });
  it('handles single names and blanks', () => {
    expect(sellerInitials('JOHN')).toBe('JO');
    expect(sellerInitials('  ')).toBe('?');
    expect(sellerInitials(undefined)).toBe('?');
  });
});
