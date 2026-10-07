import QRCode from 'qrcode';
import { resolveTechnicalPdfClient } from './technicalPdfClient';

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const formatDate = (d?: string | Date) => {
  if (!d) return new Date().toLocaleDateString('pt-BR');
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(dt.getTime())) return String(d);
  return dt.toLocaleDateString('pt-BR');
};

const COMPANY = {
  name: 'MCI Assistência Técnica',
  legal: 'Multi Comercial Importadora',
  cnpj: '05.502.390/0003-83',
  address: 'Av. Imperatriz Leopoldina, 1718 - 2º andar - Vila Leopoldina - São Paulo/SP - CEP 05305-003',
  phone: '+55 (11) 2365-1756',
  email: 'jonathan@mcistore.com.br',
};

async function loadLogoDataUrl(): Promise<string | null> {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('logo'));
      img.src = '/mci-logo-quote.png';
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(img, 0, 0);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

async function drawHeader(doc: any, title: string) {
  const W = 210;
  const margin = 12;
  const logo = await loadLogoDataUrl();
  if (logo) {
    const logoH = 14;
    const logoW = 30;
    try { doc.addImage(logo, 'PNG', margin, 10, logoW, logoH); } catch {}
  }
  // Company block right
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 128, 128);
  doc.text(COMPANY.name, W - margin, 13, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(70);
  doc.text(COMPANY.address, W - margin, 17, { align: 'right' });
  doc.text(`CNPJ: ${COMPANY.cnpj}   ·   Tel: ${COMPANY.phone}`, W - margin, 20.5, { align: 'right' });
  doc.text(COMPANY.email, W - margin, 24, { align: 'right' });

  // Title bar
  doc.setFillColor(0, 150, 136);
  doc.rect(0, 30, W, 9, 'F');
  doc.setTextColor(255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(title, W / 2, 36.5, { align: 'center' });
  doc.setTextColor(0);
}

function drawSectionTitle(doc: any, y: number, text: string) {
  const W = 210, margin = 12;
  doc.setFillColor(238, 246, 245);
  doc.setDrawColor(0, 150, 136);
  doc.setLineWidth(0.2);
  doc.rect(margin, y, W - margin * 2, 6, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(0, 110, 100);
  doc.text(text.toUpperCase(), margin + 2, y + 4);
  doc.setTextColor(0);
  return y + 8;
}

function labelValueGrid(
  doc: any,
  startY: number,
  rows: Array<Array<[string, string]>>
): number {
  const W = 210, margin = 12;
  const colW = (W - margin * 2) / 2;
  let y = startY;
  rows.forEach((row) => {
    row.forEach(([label, value], idx) => {
      const x = margin + idx * colW;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(90);
      doc.text(`${label}:`, x + 1, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(20);
      const lines = doc.splitTextToSize(String(value || '-'), colW - 4 - doc.getTextWidth(`${label}: `));
      doc.text(lines, x + 1 + doc.getTextWidth(`${label}: `), y);
    });
    y += 5;
  });
  return y + 2;
}

function drawFooter(doc: any, technicianName?: string) {
  const W = 210;
  const H = 297;
  const margin = 12;
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(200);
    doc.line(margin, H - 18, W - margin, H - 18);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text(`${COMPANY.legal} · CNPJ ${COMPANY.cnpj} · ${COMPANY.phone}`, margin, H - 14);
    if (technicianName) {
      doc.text(`Técnico responsável: ${technicianName}`, margin, H - 10);
    }
    doc.text(`Página ${i}/${pageCount}`, W - margin, H - 10, { align: 'right' });
  }
}

/* ===================== ORÇAMENTO (modelo MCI Assistência Técnica) ===================== */

const M = 14;                 // margem
const PW = 210;               // largura A4
const PH = 297;
const CW = PW - M * 2;        // largura útil
const TEAL: [number, number, number] = [0, 150, 109];
const BLUE: [number, number, number] = [0, 116, 190];
const GRAY_TXT: [number, number, number] = [90, 96, 104];
const DARK: [number, number, number] = [32, 38, 45];
const BORDER: [number, number, number] = [225, 228, 232];

const BRANDS = 'Aputure • Amaran • Cream Source • Astera';

function sectionLabel(doc: any, x: number, y: number, text: string) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...GRAY_TXT);
  doc.text(text.toUpperCase(), x, y, { charSpace: 0.3 });
  doc.setTextColor(0);
}

function card(doc: any, x: number, y: number, w: number, h: number) {
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y, w, h, 2, 2, 'S');
}

export async function drawQuoteHeader(doc: any, os: any, title = 'ORÇAMENTO') {
  const logo = await loadLogoDataUrl();
  if (logo) {
    try { doc.addImage(logo, 'PNG', M, 12, 26, 13); } catch {}
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(...DARK);
  doc.text('ASSISTÊNCIA TÉCNICA', M + 30, 20);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...GRAY_TXT);
  doc.text(BRANDS, M + 30, 25.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...DARK);
  doc.setFontSize(title.length > 20 ? 10 : 15);
  doc.text(title, PW - M, 19, { align: 'right' });
  doc.setFont('courier', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GRAY_TXT);
  doc.text(`#${os.os_number || ''}`, PW - M, 24.5, { align: 'right' });
  doc.text(formatDate(os.budget_sent_at || os.updated_at || new Date()), PW - M, 29.5, { align: 'right' });

  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.line(M, 34, PW - M, 34);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0);
}

function drawQuoteFooter(doc: any, os: any) {
  const top = PH - 46;
  doc.setPage(doc.getNumberOfPages());
  doc.setDrawColor(120, 220, 205);
  doc.setLineWidth(0.5);
  doc.line(M, top, PW - M, top);
  doc.setLineWidth(0.3);
  card(doc, M + 2, top + 5, CW - 4, 24);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...GRAY_TXT);
  doc.text('Técnico Responsável', M + 7, top + 11);
  doc.setFontSize(10.5);
  doc.setTextColor(...BLUE);
  doc.text(os.technician_name || COMPANY.name, M + 7, top + 17.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...GRAY_TXT);
  doc.text(os.technician_email || COMPANY.email, PW / 2 + 2, top + 15);
  doc.setTextColor(...TEAL);
  doc.setFont('helvetica', 'bold');
  doc.text(os.technician_phone || COMPANY.phone, PW - M - 7, top + 15, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(140);
  doc.text(`${COMPANY.name} • www.mci.tv`, M + 7, top + 25.5);
  doc.text('Garantia de 1 ano em toda manutenção e peças', PW - M - 7, top + 25.5, { align: 'right' });
  doc.setTextColor(0);
}

export function drawTechnicalParties(doc: any, os: any, client: any, address: string, y = 44) {
  const colW = (CW - 8) / 2;
  sectionLabel(doc, M, y, 'Prestador de Serviço');
  sectionLabel(doc, M + colW + 8, y, 'Dados do Cliente');
  y += 4;

  const providerLines = [
    COMPANY.legal,
    `CNPJ: ${COMPANY.cnpj}`,
    'Av. Imperatriz Leopoldina, 1718 - Vila Leopoldina',
    'São Paulo-SP, 05305-003',
    '2º andar',
  ];
  const clientName = client.name || os.client_name || '-';
  const clientContact = [
    client.cpf_cnpj || os.client_document || '',
    (client.is_revenda && client.contrib_icms) ? `IE: ${client.contrib_icms}` : '',
    client.email || os.client_email || '',
    client.phone || client.whatsapp || os.client_phone || '',
  ].filter(Boolean);
  doc.setFontSize(7.5);
  const clientAddress = doc.splitTextToSize(`Endereço: ${address}`, colW - 10);
  doc.setFontSize(9);
  const contactLines = clientContact.flatMap(l => doc.splitTextToSize(String(l), colW - 10));
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  const nameLines = doc.splitTextToSize(String(clientName), colW - 10);
  const cardH = Math.max(40, 14 + nameLines.length * 4.8 + contactLines.length * 4.8 + clientAddress.length * 3.8);
  card(doc, M, y, colW, cardH);
  card(doc, M + colW + 8, y, colW, cardH);

  // Prestador
  let py = y + 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...DARK);
  doc.text(providerLines[0], M + 5, py);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GRAY_TXT);
  py += 6;
  providerLines.slice(1).forEach((l) => {
    const ls = doc.splitTextToSize(l, colW - 10);
    doc.text(ls, M + 5, py);
    py += ls.length * 4.6;
  });

  // Cliente
  let cy = y + 8;
  const cx = M + colW + 8 + 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...DARK);
  doc.text(nameLines, cx, cy);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GRAY_TXT);
  cy += nameLines.length * 4.8 + 1.2;
  contactLines.forEach((l: string) => { doc.text(l, cx, cy); cy += 4.8; });
  doc.setFontSize(7.5);
  clientAddress.forEach((l: string) => {
    doc.text(l, cx, cy);
    cy += 3.8;
  });

  y += cardH + 6;

  return y;
}

export async function generateTechnicalQuotePdf(
  os: any,
  parts: any[],
  options?: { returnBlob?: boolean; client?: any }
): Promise<Blob | void> {
  const { client, address } = await resolveTechnicalPdfClient(os, options?.client);
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF('p', 'mm', 'a4');
  const validDays = Number(os.budget_valid_days || 10);
  const version = Number(os.budget_version || 1);

  await drawQuoteHeader(doc, os);
  let y = 44;

  y = drawTechnicalParties(doc, os, client, address, y);

  /* ---------- Equipamento ---------- */
  sectionLabel(doc, M, y, 'Equipamento');
  y += 4;
  const equipTitle = os.equipment || '-';
  const defect = os.reported_defect || '-';
  const accessories = Array.isArray(os.accessories)
    ? os.accessories.join(', ')
    : (os.accessories || 'Nenhum');
  doc.setFontSize(9.5);
  const defectLines = doc.splitTextToSize(defect, CW - 12);
  const accLines = doc.splitTextToSize(accessories, CW - 12);
  const eqH = 40 + defectLines.length * 4.8 + accLines.length * 4.4;
  card(doc, M, y, CW, eqH);

  let ey = y + 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...DARK);
  doc.text(equipTitle, M + 5, ey);
  // Badge tipo de serviço
  const badge = String(os.service_type || os.os_type || 'Orçamento').toUpperCase();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(191, 132, 20);
  doc.text(badge, PW - M - 5, ey - 0.5, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GRAY_TXT);
  ey += 5.5;
  doc.text(`Série: ${os.serial || '-'}`, M + 5, ey);

  ey += 6;
  sectionLabel(doc, M + 5, ey, 'Defeito Relatado');
  ey += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...DARK);
  doc.text(defectLines, M + 5, ey);
  ey += defectLines.length * 4.8 + 2;

  doc.setDrawColor(...BORDER);
  doc.line(M + 5, ey, PW - M - 5, ey);
  ey += 5;
  sectionLabel(doc, M + 5, ey, 'Acessórios');
  ey += 4.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GRAY_TXT);
  doc.text(accLines, M + 5, ey);

  y += eqH + 8;

  /* ---------- Relatório técnico ---------- */
  const report = os.technical_diagnosis || '-';
  sectionLabel(doc, M, y, 'Relatório Técnico');
  y += 4;
  doc.setFontSize(9.5);
  const repLines = doc.splitTextToSize(report, CW - 12);
  if (y > PH - 55) { doc.addPage(); y = 30; }
  let remaining = [...repLines];
  do {
    const repH = PH - y - 30;
    const capacity = Math.max(1, Math.floor((repH - 12) / 4.9));
    card(doc, M, y, CW, repH);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...DARK);
    doc.text(remaining.splice(0, capacity), M + 6, y + 7, { lineHeightFactor: 1.45 });
    if (remaining.length) { doc.addPage(); y = 30; }
  } while (remaining.length);

  /* ---------- Peças e serviços ---------- */
  const partsValue = (parts || []).length
    ? (parts || []).reduce((s: number, p: any) => s + Number(p.total_price || 0), 0)
    : Number(os.parts_value || 0);
  const laborValue = Number(os.labor_value || 0);
  const shippingValue = Number(os.shipping_value || 0);
  const shippingLabel = os.shipping_method || 'Frete';
  const discountPercent = Number(os.discount_percent || 0);
  const scope = os.discount_scope === 'total' ? 'total' : 'parts';
  const discountBase = scope === 'total' ? partsValue + laborValue + shippingValue : partsValue;
  const discountValue = (discountBase * discountPercent) / 100;
  const total = Math.max(0, partsValue + laborValue + shippingValue - discountValue);


  const rows: any[] = (parts || []).map((p: any) => [
    p.code || p.product_code || '',
    p.product_name || '-',
    String(p.quantity ?? 1),
    fmt(Number(p.unit_price || 0)),
    fmt(Number(p.total_price || 0)),
  ]);
  const repair = os.repair_description || '';
  if (repair) {
    rows.push([
      '',
      { content: repair, colSpan: 4, styles: { fontStyle: 'italic', textColor: GRAY_TXT } },
    ]);
  }
  if (laborValue > 0) rows.push(['', 'Mão de Obra Especializada', '1', fmt(laborValue), fmt(laborValue)]);
  if (shippingValue > 0) rows.push(['', `Frete: ${shippingLabel}`, '1', fmt(shippingValue), fmt(shippingValue)]);

  /* ---------- Peças e serviços ---------- */
  // Page 1 ends after technical report. Move parts and services to page 2.
  doc.addPage();
  y = 25;
  sectionLabel(doc, M, y, 'Peças e Serviços');
  y += 5;

  autoTable(doc, {
    startY: y,
    head: [['Código', 'Descrição', 'Qtd', 'Unitário', 'Total']],
    body: rows.length ? rows : [['', 'Nenhum item lançado', '', '', '']],
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: { top: 2.6, bottom: 2.6, left: 1, right: 1 }, textColor: DARK },
    headStyles: {
      fontStyle: 'bold', fontSize: 8.5, textColor: DARK,
      lineWidth: { bottom: 0.3 }, lineColor: BORDER,
    },
    bodyStyles: { lineWidth: { bottom: 0.2 }, lineColor: BORDER },
    columnStyles: {
      0: { cellWidth: 16, fontSize: 7.5, textColor: GRAY_TXT },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 11, halign: 'right' },
      3: { cellWidth: 24, halign: 'right' },
      4: { cellWidth: 26, halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: M, right: M },
    pageBreak: 'auto',
  });

  y = (doc as any).lastAutoTable.finalY + 8;
  if (y > PH - 110) { doc.addPage(); y = 30; }

  /* ---------- Totais ---------- */
  const rightX = PW - M;
  const totRow = (label: string, val: string, color?: [number, number, number]) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...(color || GRAY_TXT));
    doc.text(label, rightX - 32, y, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...(color || DARK));
    doc.text(val, rightX, y, { align: 'right' });
    y += 6.4;
  };
  totRow('Subtotal Peças', fmt(partsValue));
  if (discountPercent) {
    totRow(
      `Desconto ${discountPercent}% (${scope === 'total' ? 'sobre o total' : 'sobre peças'})`,
      `- ${fmt(discountValue)}`,
      [214, 69, 69]
    );
  }
  totRow('Mão de Obra', fmt(laborValue));
  totRow(`Frete (${shippingLabel})`, fmt(shippingValue));

  doc.setDrawColor(...DARK);
  doc.setLineWidth(0.7);
  doc.line(rightX - 118, y - 2, rightX, y - 2);
  doc.setLineWidth(0.3);
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...DARK);
  doc.text('TOTAL', rightX - 40, y, { align: 'right' });
  doc.setTextColor(...TEAL);
  doc.text(fmt(total), rightX, y, { align: 'right' });
  doc.setTextColor(0);
  y += 16;

  /* ---------- Condições + assinatura ---------- */
  if (y > PH - 70) { doc.addPage(); y = 40; }
  doc.setDrawColor(...BORDER);
  doc.line(M, y, PW - M, y);
  y += 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...DARK);
  doc.text('Condições:', M, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...GRAY_TXT);
  doc.text(`Validade deste orçamento é de ${validDays} dias.`, M + 18, y);
  const warranty = os.warranty || 'Toda manutenção e peças possuem garantia de 1 ano, exceto por mau uso.';
  const wLines = doc.splitTextToSize(warranty, 78);
  doc.setFontSize(8);
  doc.text(wLines, M, y + 6);

  const sigW = 74;
  const sigX = PW - M - sigW;
  doc.setDrawColor(190);
  doc.line(sigX, y + 6, PW - M, y + 6);
  doc.setFontSize(9.5);
  doc.setTextColor(...DARK);
  doc.text('Assinatura do Responsável', sigX + sigW / 2, y + 12, { align: 'center' });
  doc.setTextColor(0);

  drawQuoteFooter(doc, os);

  const blob = doc.output('blob');
  if (options?.returnBlob) return blob;
  doc.save(`orcamento-tecnico-${os.os_number}-v${version}.pdf`);
}



/**
 * PDF de Termo de Entrada / Recibo de Equipamento
 */
export async function generateEquipmentReceiptPdf(
  os: any,
  options?: { returnBlob?: boolean; client?: any }
): Promise<Blob | void> {
  const { client, address } = await resolveTechnicalPdfClient(os, options?.client);
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF('p', 'mm', 'a4');
  await drawQuoteHeader(doc, { ...os, budget_sent_at: os.entry_date || os.created_at }, 'ORDEM DE SERVIÇO');
  let y = drawTechnicalParties(doc, os, client, address);
  const section = (title: string, text: string) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const lines: string[] = doc.splitTextToSize(text, CW - 12);
    while (lines.length) {
      if (y > 240) { doc.addPage(); y = 30; }
      const count = Math.max(1, Math.floor((265 - y - 18) / 4.5));
      const chunk = lines.splice(0, count);
      sectionLabel(doc, M, y, title);
      y += 4;
      const height = chunk.length * 4.5 + 12;
      card(doc, M, y, CW, height);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...DARK);
      doc.text(chunk, M + 6, y + 7);
      y += height + 8;
    }
  };
  section('Equipamento', [os.equipment, `Marca: ${os.brand || '-'} • Modelo: ${os.model || '-'}`, `Série: ${os.serial || '-'}`, `Estado físico: ${os.physical_condition || '-'}`, `Acessórios: ${Array.isArray(os.accessories) ? os.accessories.join(', ') : os.accessories || 'Nenhum'}`].filter(Boolean).join('\n'));
  section('Defeito relatado', os.reported_defect || '-');
  if (os.technical_diagnosis) section('Relatório técnico', os.technical_diagnosis);
  section('Condições de recebimento', [
    'O equipamento foi recebido apenas para avaliação técnica. Os defeitos apontados são de responsabilidade do cliente.',
    'O prazo para diagnóstico é de até 5 dias úteis. Após avaliação, será enviado orçamento para aprovação.',
    'Não nos responsabilizamos por dados armazenados em cartões de memória, discos ou similares.',
    'Equipamentos não retirados após 90 dias do aviso de conclusão estarão sujeitos a taxa de armazenagem.',
    'A garantia dos serviços é de 90 dias sobre os itens efetivamente reparados.',
  ].join('\n'));
  if (y > 218) { doc.addPage(); y = 30; }
  sectionLabel(doc, M, y, 'Acompanhe sua OS online');
  y += 5;
  const trackingUrl = `${window.location.origin}/rastreamento/os/${os.public_token || ''}`;
  const qr = await QRCode.toDataURL(trackingUrl, { margin: 1, width: 220 });
  doc.addImage(qr, 'PNG', M, y, 25, 25);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...BLUE);
  doc.text(doc.splitTextToSize(trackingUrl, CW - 34), M + 32, y + 8);
  y += 38;
  doc.setDrawColor(...BORDER);
  doc.line(M, y, M + 80, y);
  doc.line(PW - M - 80, y, PW - M, y);
  doc.setFontSize(8);
  doc.setTextColor(...GRAY_TXT);
  doc.text('Assinatura do Cliente', M, y + 5);
  doc.text('Responsável Técnico', PW - M, y + 5, { align: 'right' });
  drawFooter(doc, os.technician_name);
  const blob = doc.output('blob');
  if (options?.returnBlob) return blob;
  doc.save(`termo-entrada-${os.os_number}.pdf`);
}
