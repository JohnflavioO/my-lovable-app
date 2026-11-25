
import { describe, it, expect } from 'vitest';
import { parseCurrencyBR, parsePriceInput } from './currency';

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

describe('parsePriceInput - edição rápida de preço', () => {
  it('aceita formato brasileiro', () => {
    expect(parsePriceInput('1.399,90')).toBe(1399.9);
    expect(parsePriceInput('R$ 2.390,00')).toBe(2390);
    expect(parsePriceInput('799')).toBe(799);
    expect(parsePriceInput('45,5')).toBe(45.5);
  });
  it('lê ponto com 1-2 casas como decimal (não como milhar)', () => {
    expect(parsePriceInput('1399.50')).toBe(1399.5);
    expect(parsePriceInput('10.5')).toBe(10.5);
  });
  it('mantém ponto de milhar com 3 dígitos', () => {
    expect(parsePriceInput('1.399')).toBe(1399);
  });
  it('rejeita vazio e texto', () => {
    expect(parsePriceInput('')).toBeNull();
    expect(parsePriceInput('abc')).toBeNull();
    expect(parsePriceInput('-10')).toBeNull();
  });
});
