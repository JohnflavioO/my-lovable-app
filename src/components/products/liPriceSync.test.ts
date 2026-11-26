import { describe, expect, it } from 'vitest';
import { categoryPath, hasPromo, linkTrust, namesCompatible, promoPercent, rowStatus, targetPrice, unavailableReason } from './liPriceSync';

const snap = (over: Partial<Parameters<typeof targetPrice>[0]> = {}) => ({
  product_id: 'p', preco_cheio: 1699, preco_promocional: 1199, sob_consulta: false, error: null, ...over,
});

describe('preço vindo da loja', () => {
  it('modo final usa o Por quando há promoção', () => {
    expect(targetPrice(snap(), 'final')).toBe(1199);
    expect(promoPercent(snap())).toBe(29);
  });
  it('modo cheio usa sempre o De', () => {
    expect(targetPrice(snap(), 'list')).toBe(1699);
    expect(targetPrice(snap({ preco_promocional: null }), 'list')).toBe(1699);
    expect(rowStatus(snap(), 1699, 'list')).toBe('same');
    expect(rowStatus(snap(), 1199, 'list')).toBe('change');
    expect(targetPrice(snap({ preco_cheio: null }), 'list')).toBeNull();
    expect(targetPrice(snap({ sob_consulta: true }), 'list')).toBeNull();
    expect(targetPrice(snap({ error: 'http_404' }), 'list')).toBeNull();
  });
  it('promoção inválida (zero ou maior que o De) é ignorada', () => {
    expect(hasPromo(snap({ preco_promocional: 0 }))).toBe(false);
    expect(hasPromo(snap({ preco_promocional: 1800 }))).toBe(false);
    expect(targetPrice(snap({ preco_promocional: null }), 'final')).toBe(1699);
  });
  it('sem preço, sob consulta ou erro não gera valor', () => {
    expect(targetPrice(snap({ preco_cheio: null }), 'final')).toBeNull();
    expect(targetPrice(snap({ sob_consulta: true }), 'final')).toBeNull();
    expect(targetPrice(snap({ error: 'http_404' }), 'final')).toBeNull();
    expect(unavailableReason(snap({ error: 'http_404' }))).toBe('Não existe mais na loja');
  });
});

describe('situação da linha', () => {
  it('igual, mudança normal e variação suspeita', () => {
    expect(rowStatus(snap(), 1199, 'final')).toBe('same');
    expect(rowStatus(snap(), 1399, 'final')).toBe('change');
    expect(rowStatus(snap({ preco_cheio: 7368, preco_promocional: null }), 1894, 'final')).toBe('suspicious');
    expect(rowStatus(snap({ preco_cheio: null }), 100, 'final')).toBe('unavailable');
  });
  it('produto sem preço no CRM é mudança normal', () => {
    expect(rowStatus(snap(), 0, 'final')).toBe('change');
  });
});

describe('caminho da categoria', () => {
  it('monta pai › filho', () => {
    const m = new Map([
      ['1', { nome: 'Iluminação', parent_id: null }],
      ['2', { nome: 'LED', parent_id: '1' }],
    ]);
    expect(categoryPath('2', m)).toBe('Iluminação › LED');
    expect(categoryPath('9', m)).toBe('Categoria 9');
  });
});

describe('conferência de identidade CRM × loja (casos reais)', () => {
  it('mesmo produto: código e nome batem', () => {
    expect(namesCompatible('Aputure Dual Head Yoke NOVA P600c', 'Aputure Dual Head Yoke NOVA P600c')).toBe(true);
    expect(namesCompatible('145M tripé robusto KUPO 3 seções com pino metálico', '145M tripé robusto KUPO 3 seções com pino metálico (PRÉ-VENDA)')).toBe(true);
    expect(linkTrust({ confirmed: false, codeMatches: true, crmName: 'Aputure Dual Head Yoke NOVA P600c', storeName: 'Aputure Dual Head Yoke NOVA P600c' })).toBe('verified');
  });
  it('modelo diferente é barrado mesmo com nome parecido', () => {
    expect(namesCompatible('Amaran RAY 60C', 'amaran Ray 660c (Pré-Venda)')).toBe(false);
    expect(namesCompatible('Bateria Pocket PB-M98S', 'Swit BIVO-98 - Bateria B-mount Bi-voltagem de 98Wh')).toBe(false);
    expect(namesCompatible('PB15-ACCCSE-SET', 'Astera PixelBrick - mini luz LED RGBMA multiuso sem fio (PRÉ-VENDA)')).toBe(false);
    expect(namesCompatible('DZOFilm Kit de 3 lentes Pictor T2.8 Super35 Zoom', 'Lente 20-55mm T2.8 Pictor Zoom Super 35 Dzofilm (PL Mount e EF Mount) (PRÉ-VENDA)')).toBe(false);
  });
  it('código reaproveitado para outro item exige confirmação', () => {
    expect(linkTrust({ confirmed: false, codeMatches: true, crmName: 'MC PRO 8-Light Kit', storeName: 'Pacote de acessórios: Aputure MC Kit para 8 luzes' })).toBe('check');
  });
  it('sem código igual sempre exige confirmação; confirmado por pessoa vale', () => {
    expect(linkTrust({ confirmed: false, codeMatches: false, crmName: 'Amaran RAY 60C', storeName: 'amaran Ray 60c - Luz COB ultracompacta' })).toBe('check');
    expect(linkTrust({ confirmed: true, codeMatches: false, crmName: 'x', storeName: 'y' })).toBe('confirmed');
  });
});
