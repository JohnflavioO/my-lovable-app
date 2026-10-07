import { describe, expect, it } from 'vitest';
import { generateTechnicalQuotePdf, generateEquipmentReceiptPdf } from './generateTechnicalPdf';
import { generatePurchaseOrderPdf } from './generatePurchaseOrderPdf';

describe('endereço obrigatório em todos os documentos técnicos', () => {
  it('bloqueia orçamento sem endereço do cliente', async () => {
    await expect(generateTechnicalQuotePdf({}, [], { client: { address: '' }, returnBlob: true }))
      .rejects.toThrow('Cadastre o endereço do cliente');
  });
  it('bloqueia ordem de serviço sem endereço do cliente', async () => {
    await expect(generateEquipmentReceiptPdf({}, { client: { address: '' }, returnBlob: true }))
      .rejects.toThrow('Cadastre o endereço do cliente');
  });
  it('bloqueia ordem de compra e recibo sem endereço do cliente', async () => {
    await expect(generatePurchaseOrderPdf({}, [], { address: '' }, { returnBlob: true }))
      .rejects.toThrow('Cadastre o endereço do cliente');
  });
});