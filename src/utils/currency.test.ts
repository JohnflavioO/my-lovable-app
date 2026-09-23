
import { describe, it, expect } from 'vitest';
import { parseCurrencyBR } from './currency';

describe('parseCurrencyBR - Precisão Financeira CRM MCI', () => {
  it('deve converter valores com vírgula (centavos)', () => {
    expect(parseCurrencyBR('10.000,00')).toBe(10000);
    expect(parseCurrencyBR('8.735,97')).toBe(8735.97);
    expect(parseCurrencyBR('404,77')).toBe(404.77);
  });

  it('deve converter valores com ponto sendo MILHAR (sem centavos na planilha)', () => {
    // Casos críticos onde o sistema antigo errava (lendo como 10.00 ou 8.73)
    expect(parseCurrencyBR('10.000')).toBe(10000);
    expect(parseCurrencyBR('8.735')).toBe(8735);
    expect(parseCurrencyBR('1.200.500')).toBe(1200500);
  });

  it('deve lidar com espaços e símbolos', () => {
    expect(parseCurrencyBR(' R$ 10.000,00 ')).toBe(10000);
    expect(parseCurrencyBR('10&nbsp;000,00')).toBe(10000);
  });

  it('deve retornar zero para valores inválidos', () => {
    expect(parseCurrencyBR('')).toBe(0);
    expect(parseCurrencyBR(null)).toBe(0);
  });
});
