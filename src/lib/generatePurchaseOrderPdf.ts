import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { resolveTechnicalPdfClient } from './technicalPdfClient';
import { drawQuoteHeader, drawTechnicalParties } from './generateTechnicalPdf';

const fmt = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

export async function generatePurchaseOrderPdf(order: any, items: any[], providedClient?: any, options?: { returnBlob?: boolean }): Promise<Blob | void> {
  const { client, address } = await resolveTechnicalPdfClient(order, providedClient);
  const doc = new jsPDF('p', 'mm', 'a4');
  const M = 14, W = 210;
  const dark: [number, number, number] = [32, 38, 45];
  const teal: [number, number, number] = [0, 150, 109];
  const border: [number, number, number] = [225, 228, 232];
  const ocNum = order.oc_number || 'OC-' + new Date(order.created_at).getFullYear();
  await drawQuoteHeader(doc, { os_number: ocNum, budget_sent_at: order.created_at }, 'ORDEM DE COMPRA / RECIBO');
  let y = drawTechnicalParties(doc, order, client, address);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...dark);
  const saleLines = doc.splitTextToSize(`Pagamento: ${order.payment_method || '-'}   •   Status: ${order.status || 'Pendente'}`, W - M * 2);
  doc.text(saleLines, M, y);
  y += saleLines.length * 4.5 + 8;
  autoTable(doc, {
    startY: y,
    head: [['Código', 'Descrição', 'Qtd', 'Unitário', 'Total']],
    body: items.map(item => [item.technical_products?.code || item.product_code || '-', item.technical_products?.name || item.product_name || '-', String(item.quantity ?? 1), fmt(Number(item.unit_price)), fmt(Number(item.total_price))]),
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 2.6, textColor: dark },
    headStyles: { fontStyle: 'bold', lineWidth: { bottom: 0.3 }, lineColor: border },
    bodyStyles: { lineWidth: { bottom: 0.2 }, lineColor: border },
    columnStyles: { 0: { cellWidth: 20 }, 2: { cellWidth: 12, halign: 'right' }, 3: { cellWidth: 27, halign: 'right' }, 4: { cellWidth: 27, halign: 'right', fontStyle: 'bold' } },
    margin: { left: M, right: M, top: 20, bottom: 30 },
  });
  y = (doc as any).lastAutoTable.finalY + 10;
  if (y > 215) { doc.addPage(); y = 30; }
  const row = (label: string, value: number) => {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...dark);
    doc.text(label, W - M - 40, y, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.text(fmt(value), W - M, y, { align: 'right' });
    y += 7;
  };
  row('Subtotal', items.reduce((sum, item) => sum + Number(item.total_price || 0), 0));
  if (order.discount_value > 0) row(`Desconto (${order.discount_percent || 0}%)`, -Number(order.discount_value));
  if (order.freight_value > 0) row(`Frete (${order.freight_type || 'Geral'})`, Number(order.freight_value));
  doc.setDrawColor(...dark);
  doc.line(W - M - 118, y, W - M, y);
  y += 10;
  doc.setFontSize(15);
  doc.text('TOTAL', W - M - 40, y, { align: 'right' });
  doc.setTextColor(...teal);
  doc.text(fmt(Number(order.total_amount)), W - M, y, { align: 'right' });
  y += 22;
  doc.setDrawColor(...border);
  doc.line(W - M - 74, y, W - M, y);
  doc.setTextColor(...dark);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Assinatura do Responsável', W - M - 37, y + 6, { align: 'center' });
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setDrawColor(...border);
    doc.line(M, 277, W - M, 277);
    doc.setFontSize(7);
    doc.text('MCI Assistência Técnica • www.mci.tv', M, 284);
    doc.text(`Página ${page}/${pages}`, W - M, 284, { align: 'right' });
  }
  if (options?.returnBlob) return doc.output('blob');
  doc.save(`${ocNum}.pdf`);
}
