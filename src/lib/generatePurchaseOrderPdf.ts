import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const COMPANY = {
  name: 'MCI Assistência Técnica',
  legal: 'Multi Comercial Importadora',
  cnpj: '05.502.390/0003-83',
  address: 'Av. Imperatriz Leopoldina, 1718 - 2º andar - Vila Leopoldina - São Paulo/SP - CEP 05305-003',
  phone: '(11) 2365-1756',
  email: 'jonathan@mcistore.com.br',
};

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const formatDate = (d?: string | Date) => {
  if (!d) return new Date().toLocaleDateString('pt-BR');
  const dt = typeof d === 'string' ? new Date(d) : d;
  return dt.toLocaleDateString('pt-BR');
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
    canvas.getContext('2d')!.drawImage(img, 0, 0);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

export async function generatePurchaseOrderPdf(order: any, items: any[], client?: any) {
  const doc = new jsPDF('p', 'mm', 'a4');
  const W = 210;
  const M = 12;
  const DARK = [32, 38, 45] as [number, number, number];
  const TEAL = [0, 150, 136] as [number, number, number];
  const GRAY = [100, 110, 120] as [number, number, number];

  // Header
  const logo = await loadLogoDataUrl();
  if (logo) {
    doc.addImage(logo, 'PNG', M, 10, 30, 14);
  }

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...TEAL);
  doc.text(COMPANY.name, W - M, 13, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(70);
  doc.text(COMPANY.address, W - M, 17, { align: 'right' });
  doc.text(`CNPJ: ${COMPANY.cnpj}   ·   Tel: ${COMPANY.phone}`, W - M, 20.5, { align: 'right' });
  doc.text(COMPANY.email, W - M, 24, { align: 'right' });

  // Title bar
  doc.setFillColor(...TEAL);
  doc.rect(0, 30, W, 9, 'F');
  doc.setTextColor(255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  const ocNum = order.oc_number || 'OC-' + new Date(order.created_at).getFullYear() + '-????';
  doc.text(`ORDEM DE COMPRA / RECIBO DE VENDA - ${ocNum}`, W / 2, 36.5, { align: 'center' });

  let y = 48;

  // Data section
  doc.setTextColor(...DARK);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('DADOS DO CLIENTE', M, y);
  doc.text('DADOS DA VENDA', W / 2 + 4, y);
  
  doc.setDrawColor(200);
  doc.setLineWidth(0.1);
  doc.line(M, y + 2, W - M, y + 2);
  
  y += 7;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  
  // Client column
  const cName = client?.name || order.client_name || '-';
  const cDoc = client?.cpf_cnpj || '-';
  const cEmail = client?.email || '-';
  
  doc.text(`Nome: ${cName}`, M, y);
  doc.text(`Documento: ${cDoc}`, M, y + 5);
  doc.text(`E-mail: ${cEmail}`, M, y + 10);

  // Order column
  const date = formatDate(order.created_at);
  const payment = (order.payment_method || 'PIX').toUpperCase();
  const status = (order.status || 'Pendente').toUpperCase();
  
  doc.text(`Data: ${date}`, W / 2 + 4, y);
  doc.text(`Pagamento: ${payment}`, W / 2 + 4, y + 5);
  doc.text(`Status: ${status}`, W / 2 + 4, y + 10);

  y += 20;

  // Items Table
  const rows = items.map(it => [
    it.technical_products?.code || it.product_code || '-',
    it.technical_products?.name || it.product_name || '-',
    it.quantity.toString(),
    fmt(Number(it.unit_price)),
    fmt(Number(it.total_price))
  ]);

  autoTable(doc, {
    startY: y,
    head: [['CÓDIGO', 'DESCRIÇÃO DO PRODUTO', 'QTD', 'UNITÁRIO', 'TOTAL']],
    body: rows,
    theme: 'striped',
    headStyles: { fillColor: TEAL, fontSize: 8, fontStyle: 'bold' },
    styles: { fontSize: 8, cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: 25 },
      2: { halign: 'center', cellWidth: 15 },
      3: { halign: 'right', cellWidth: 30 },
      4: { halign: 'right', cellWidth: 30 },
    }
  });

  const finalY = (doc as any).lastAutoTable.finalY;
  y = finalY + 10;

  // Totals
  const rightX = W - M;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...GRAY);
  
  const subtotal = items.reduce((s, i) => s + Number(i.total_price), 0);
  doc.text('Subtotal:', rightX - 35, y, { align: 'right' });
  doc.text(fmt(subtotal), rightX, y, { align: 'right' });
  
  y += 5;
  if (order.discount_value > 0) {
    doc.text(`Desconto (${order.discount_percent}%):`, rightX - 35, y, { align: 'right' });
    doc.text(`- ${fmt(order.discount_value)}`, rightX, y, { align: 'right' });
    y += 5;
  }
  
  if (order.freight_value > 0) {
    doc.text(`Frete (${order.freight_type || 'Geral'}):`, rightX - 35, y, { align: 'right' });
    doc.text(fmt(order.freight_value), rightX, y, { align: 'right' });
    y += 5;
  }

  y += 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...DARK);
  doc.text('TOTAL:', rightX - 35, y, { align: 'right' });
  doc.setTextColor(...TEAL);
  doc.text(fmt(Number(order.total_amount)), rightX, y, { align: 'right' });

  // Footer
  const H = 297;
  doc.setFontSize(7);
  doc.setTextColor(150);
  doc.setFont('helvetica', 'normal');
  doc.text('MCI Assistência Técnica • www.mci.tv', W / 2, H - 15, { align: 'center' });
  doc.text('Obrigado pela preferência!', W / 2, H - 10, { align: 'center' });

  doc.save(`${ocNum}.pdf`);
}
