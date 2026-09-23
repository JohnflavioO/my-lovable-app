import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { DetailedComparison } from '@/hooks/useDetailedComparison';

const verdictLabel: Record<string, string> = {
  igual: 'Igual',
  proximo: 'Próximo',
  mci_superior: 'MCI superior',
  pesquisado_superior: 'Externo superior',
  nao_comparavel: 'Não comparável',
  indisponivel: 'Indisponível',
};

export function generateComparisonPdf(cmp: DetailedComparison) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  let y = 40;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Comparativo técnico de equipamentos', 40, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')} — MCI CRM`, 40, y + 10);
  y += 24;

  // Header cards
  const boxW = (W - 100) / 2;
  const drawBox = (x: number, title: string, brand?: string, model?: string, extra?: string) => {
    doc.setDrawColor(220);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x, y, boxW, 70, 6, 6, 'FD');
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(title, x + 12, y + 16);
    doc.setFontSize(12);
    doc.setTextColor(20);
    doc.setFont('helvetica', 'bold');
    doc.text(brand || '—', x + 12, y + 34, { maxWidth: boxW - 24 });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(model || '', x + 12, y + 50, { maxWidth: boxW - 24 });
    if (extra) {
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(extra, x + 12, y + 62, { maxWidth: boxW - 24 });
    }
  };
  drawBox(40, 'PESQUISADO', cmp.left?.brand, cmp.left?.model, cmp.left?.url);
  drawBox(60 + boxW, 'CATÁLOGO MCI', cmp.right?.brand, cmp.right?.model,
    [cmp.right?.sku && `SKU ${cmp.right.sku}`, cmp.right?.code].filter(Boolean).join(' • '));
  y += 84;

  // Score
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(20);
  doc.text(`Compatibilidade: ${cmp.compatibility ?? 0}%`, 40, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text(`Classificação: ${cmp.tier ?? '—'}   •   Confiança: ${cmp.confidenceOverall ?? '—'}`, 40, y + 14);
  y += 30;

  if (cmp.summary) {
    doc.setFontSize(10);
    doc.setTextColor(40);
    const lines = doc.splitTextToSize(cmp.summary, W - 80);
    doc.text(lines, 40, y);
    y += lines.length * 12 + 6;
  }

  // Rows table
  const rows = (cmp.rows ?? []).map((r) => [
    r.label,
    `${r.left?.value || '—'}${r.left?.confidence ? `\n(${r.left.confidence})` : ''}`,
    `${r.right?.value || '—'}${r.right?.confidence ? `\n(${r.right.confidence})` : ''}`,
    verdictLabel[r.verdict] ?? r.verdict ?? '',
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Atributo', 'Pesquisado', 'MCI', 'Veredito']],
    body: rows,
    styles: { fontSize: 8, cellPadding: 4, valign: 'top' },
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 130, fontStyle: 'bold' },
      1: { cellWidth: 160 },
      2: { cellWidth: 160 },
      3: { cellWidth: 65 },
    },
    margin: { left: 40, right: 40 },
  });

  y = (doc as any).lastAutoTable.finalY + 16;

  const section = (title: string, items?: string[]) => {
    if (!items || items.length === 0) return;
    if (y > 760) { doc.addPage(); y = 40; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(20);
    doc.text(title, 40, y);
    y += 12;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(60);
    for (const it of items) {
      const lines = doc.splitTextToSize(`• ${it}`, W - 80);
      if (y + lines.length * 11 > 780) { doc.addPage(); y = 40; }
      doc.text(lines, 40, y);
      y += lines.length * 11 + 2;
    }
    y += 6;
  };

  section('Semelhanças', cmp.similarities);
  section('Vantagens do MCI', cmp.mciAdvantages);
  section('Pontos de atenção', cmp.attentionPoints);

  if (cmp.conclusion) {
    if (y > 740) { doc.addPage(); y = 40; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Conclusão', 40, y);
    y += 12;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(40);
    const lines = doc.splitTextToSize(cmp.conclusion, W - 80);
    doc.text(lines, 40, y);
    y += lines.length * 11 + 6;
  }

  if (cmp.scoring?.breakdown?.length) {
    if (y > 640) { doc.addPage(); y = 40; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Pontuação detalhada', 40, y);
    y += 8;
    autoTable(doc, {
      startY: y + 4,
      head: [['Atributo', 'Peso %', 'Nota (0-100)', 'Observação']],
      body: cmp.scoring.breakdown.map((b) => [b.attribute, String(b.weight), String(b.score), b.note ?? '']),
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [30, 41, 59], textColor: 255 },
      columnStyles: { 0: { cellWidth: 140, fontStyle: 'bold' }, 1: { cellWidth: 50, halign: 'right' }, 2: { cellWidth: 60, halign: 'right' } },
      margin: { left: 40, right: 40 },
    });
  }

  const fname = `comparativo-${(cmp.right?.brand || 'mci').toString().replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.pdf`;
  doc.save(fname);
}
