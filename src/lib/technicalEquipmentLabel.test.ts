import { describe, expect, it } from 'vitest';
import { technicalEquipmentLabel } from './technicalEquipmentLabel';

describe('nome do equipamento no orçamento técnico', () => {
  it('prioriza Modelo mesmo quando Equipamento tem outro nome', () => {
    expect(technicalEquipmentLabel({ model: 'LS 600d Pro', equipment: 'Iluminador' })).toBe('LS 600d Pro');
  });
  it('usa Modelo sem exigir que Equipamento seja preenchido', () => {
    expect(technicalEquipmentLabel({ model: 'LS 600d Pro', equipment: null })).toBe('LS 600d Pro');
  });
  it('preserva Equipamento nas OS antigas sem Modelo', () => {
    expect(technicalEquipmentLabel({ model: '  ', equipment: 'LS 600d Pro' })).toBe('LS 600d Pro');
  });
});