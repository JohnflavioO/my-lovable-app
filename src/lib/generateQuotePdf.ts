export async function generateQuotePdf(quote: any, items: any[], client: any, options?: { returnBlob?: boolean }): Promise<Blob | void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF('p', 'mm', 'a4');
  const W = 210;
  const margin = 12;
  const cw = W - margin * 2;
  let y = margin;

  const fmt = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const resetTextSpacing = () => {
    const pdfDoc = doc as any;
    if (typeof pdfDoc.setCharSpace === 'function') pdfDoc.setCharSpace(0);
  };

  const normalizeCellText = (value: any) => {
    let text = String(value || '').replace(/\s+/g, ' ').trim();
    text = text.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').replace(/\s+-\s+/g, ' - ');
    text = text.replace(/B\s+L\s+A\s+I\s+R/gi, 'BLAIR');
    text = text.replace(/C\s+G/gi, 'CG');
    text = text.replace(/K\s+I\s+T\s+D\s+E\s+V\s+I\s+A\s+G\s+E\s+M/gi, 'KIT DE VIAGEM');
    return text;
  };

  // Load logo (optimized PNG, pre-resized to 400px)
  try {
    const logoImg = new Image();
    logoImg.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      logoImg.onload = () => resolve();
      logoImg.onerror = () => reject(new Error('logo'));
      logoImg.src = '/mci-logo-quote.png';
    });
    const lw = logoImg.naturalWidth;
    const lh = logoImg.naturalHeight;
    // Use PNG format to preserve transparency (no black background)
    const canvas = document.createElement('canvas');
    canvas.width = lw;
    canvas.height = lh;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(logoImg, 0, 0, lw, lh);
    const logoData = canvas.toDataURL('image/png');
    // Maintain aspect ratio: 28mm wide
    const logoW = 28;
    const logoH = logoW * (lh / lw);
    doc.addImage(logoData, 'PNG', margin, y, logoW, logoH);
  } catch { /* logo not available, skip */ }

  // Header bar
  doc.setFillColor(0, 150, 136);
  doc.rect(0, 0, W, 10, 'F');
  doc.setFontSize(9);
  doc.setTextColor(255);
  doc.setFont('helvetica', 'bold');
  doc.text('ORDEM DE COMPRA / ORÇAMENTO', W / 2, 7, { align: 'center' });

  y = 14;
  const locStartX = margin + 32;

  const locations = [
    { title: 'CEARÁ', lines: ['Rua Senador Pompeu, 1547', 'Centro - CEP: 60.025-001', 'Tel.: +55 (85) 3254-4700', 'CNPJ: 05.502.390/0001-11'] },
    { title: 'SANTA CATARINA', lines: ['Rua Odílio Garcia, 211', 'Sala B, Box 10 - Cordeiro', 'CEP: 88310-180', 'CNPJ: 05.502.390/0002-00'] },
    { title: 'SÃO PAULO', lines: ['Av. Imperatriz Leopoldina, 1718', '2º andar - Vila Leopoldina', 'CEP: 05305-003', 'CNPJ: 05.502.390/0003-83'] },
    { title: 'MIAMI', lines: ['8123 NW 29th St Doral, FL', '+1 (786) 925-6661', 'MCI IMP & EXP CORP'] },
  ];

  const locWidth = (cw - 28) / 4;
  doc.setFontSize(6.5);
  locations.forEach((loc, i) => {
    const x = locStartX + i * locWidth;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 128, 128);
    doc.text(loc.title, x, y + 2);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80);
    loc.lines.forEach((line, li) => {
      doc.text(line, x, y + 5 + li * 2.8);
    });
  });

  y += 22;

  // Brands bar
  doc.setFontSize(5.5);
  doc.setTextColor(120);
  const brands = 'Aputure • DZOFILM • Caligri • SECCED • Amaran • Miliboo • Dearkol • 7artisans • CREAM SOURCE • DopChoice • Astera • Kupo';
  doc.text(brands, W / 2, y, { align: 'center' });
  y += 3;
  doc.setDrawColor(200);
  doc.line(margin, y, W - margin, y);
  y += 5;

  // Quote info section - Layout optimization
  const infoY = y;
  doc.setFontSize(9);
  doc.setTextColor(0);
  doc.setFont('helvetica', 'bold');
  doc.text(`Orçamento: ${quote.quote_number}`, margin, infoY);

  // Reseller badge next to quote number
  if (quote.is_reseller) {
    const qnWidth = doc.getTextWidth(`Orçamento: ${quote.quote_number}  `);
    const badgeX = margin + qnWidth;
    const badgeText = 'REVENDA';
    doc.setFontSize(7);
    const badgeW = doc.getTextWidth(badgeText) + 6;
    doc.setFillColor(139, 92, 246); // purple
    doc.roundedRect(badgeX, infoY - 3.5, badgeW, 5, 1.5, 1.5, 'F');
    doc.setTextColor(255);
    doc.setFont('helvetica', 'bold');
    doc.text(badgeText, badgeX + 3, infoY);
    doc.setFontSize(9);
    doc.setTextColor(0);
  }

  // Demonstração badge next to quote number
  if (quote.is_demonstration) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    const qnFullWidth = doc.getTextWidth(`Orçamento: ${quote.quote_number}  `);
    let demoX = margin + qnFullWidth;
    if (quote.is_reseller) {
      doc.setFontSize(7);
      demoX += doc.getTextWidth('REVENDA') + 10;
    }
    const demoText = 'DEMONSTRAÇÃO';
    doc.setFontSize(7);
    const demoW = doc.getTextWidth(demoText) + 6;
    doc.setFillColor(245, 158, 11); // amber-500
    doc.roundedRect(demoX, infoY - 3.5, demoW, 5, 1.5, 1.5, 'F');
    doc.setTextColor(255);
    doc.setFont('helvetica', 'bold');
    doc.text(demoText, demoX + 3, infoY);
    doc.setFontSize(9);
    doc.setTextColor(0);
  }

  doc.text(`Data: ${quote.quote_date ? quote.quote_date.split('-').reverse().join('/') : '-'}`, W - margin, infoY, { align: 'right' });
  
  if (quote.proposal_validity) {
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80);
    doc.text(`Validade da Proposta: ${quote.proposal_validity}`, W - margin, infoY + 4, { align: 'right' });
    y += 4; // Add extra margin when validity is present
  }

  // Client Data - Two Column Layout to save space
  y += 6; // Increased from 5 to 6 for better breathing room
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5); // Slightly smaller to be more compact
  doc.setTextColor(0);
  
  const midX = W / 2;
  let leftY = y;
  let rightY = y;

  if (client) {
    // Column 1: Identification
    doc.setFont('helvetica', 'bold');
    const clientLabel = `Cliente: ${client?.company_name || client?.name || quote.client_name || ''}`;
    const clientCol1Width = (W / 2) - margin - 4;
    const clientLines = doc.splitTextToSize(clientLabel, clientCol1Width);
    doc.text(clientLines, margin, leftY);
    leftY += clientLines.length * 3.5;
    doc.setFont('helvetica', 'normal');
    if (client.cpf_cnpj) { 
      let idText = `CPF/CNPJ: ${client.cpf_cnpj}`;
      if (quote.is_reseller && client.contrib_icms) {
        idText += `  |  IE: ${client.contrib_icms}`;
      }
      doc.text(idText, margin, leftY); 
      leftY += 3.5; 
    }
    if (client.email) { doc.text(`Email: ${client.email}`, margin, leftY); leftY += 3.5; }
    if (client.phone) { doc.text(`Tel: ${client.phone}`, margin, leftY); leftY += 3.5; }
    
    // Column 2: Address & Salesperson
    const addrParts = [
      client.address,
      client.address_number ? `nº ${client.address_number}` : '',
      client.complement ? `(${client.complement})` : ''
    ].filter(Boolean).join(', ');
    
    if (addrParts) { 
      const addrLines = doc.splitTextToSize(`Endereço: ${addrParts}`, (W / 2) - margin);
      doc.text(addrLines, midX, rightY); 
      rightY += (addrLines.length * 3.5); 
    }
    
    const neighborhood = client.neighborhood;
    const cityState = [client.city, client.state].filter(Boolean).join(' - ');
    const zipCode = client.cep || client.zip_code;
    const zipCodeStr = zipCode ? `CEP: ${zipCode}` : '';
    const secondLine = [neighborhood, cityState, zipCodeStr].filter(Boolean).join(', ');
    
    if (secondLine) { 
      const cityLines = doc.splitTextToSize(secondLine, (W / 2) - margin);
      doc.text(cityLines, midX, rightY); 
      rightY += (cityLines.length * 3.5); 
    }
  }
  
  if (quote.salesperson) { 
    doc.text(`Vendedor: ${quote.salesperson}`, midX, rightY); 
    rightY += 3.5; 
  }

  y = Math.max(leftY, rightY) + 2;

  // Endereço de entrega alternativo (se preenchido no orçamento)
  if (quote.use_alt_shipping_address) {
    const shipAddr = [
      quote.shipping_address,
      quote.shipping_address_number ? `nº ${quote.shipping_address_number}` : '',
      quote.shipping_complement ? `(${quote.shipping_complement})` : '',
    ].filter(Boolean).join(', ');
    const shipCityState = [quote.shipping_city, quote.shipping_state].filter(Boolean).join(' - ');
    const shipSecond = [quote.shipping_neighborhood, shipCityState, quote.shipping_cep ? `CEP: ${quote.shipping_cep}` : '']
      .filter(Boolean).join(', ');

    const hasAny = shipAddr || shipSecond || quote.shipping_recipient || quote.shipping_phone || quote.shipping_notes;
    if (hasAny) {
      // Faixa de destaque
      doc.setFillColor(240, 249, 245);
      doc.setDrawColor(21, 175, 161);
      const boxTop = y;
      const boxWidth = W - margin * 2;
      // calcula altura provisória (ajusta depois via retângulo antes do texto)
      let innerY = boxTop + 4;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(21, 120, 100);
      // placeholder — desenharemos o retângulo após medir
      const lines: string[] = [];
      const pushLine = (s: string) => { if (s) lines.push(s); };
      if (quote.shipping_recipient) pushLine(`Destinatário: ${quote.shipping_recipient}`);
      if (shipAddr) pushLine(`Endereço: ${shipAddr}`);
      if (shipSecond) pushLine(shipSecond);
      if (quote.shipping_phone) pushLine(`Tel: ${quote.shipping_phone}`);
      if (quote.shipping_notes) pushLine(`Obs: ${quote.shipping_notes}`);

      const contentWidth = boxWidth - 6;
      const wrapped: string[] = [];
      lines.forEach(l => {
        const parts = doc.splitTextToSize(l, contentWidth);
        parts.forEach((p: string) => wrapped.push(p));
      });
      const boxHeight = 5 + wrapped.length * 3.5 + 2;

      doc.rect(margin, boxTop, boxWidth, boxHeight, 'FD');

      doc.setTextColor(21, 120, 100);
      doc.setFont('helvetica', 'bold');
      doc.text('ENDEREÇO DE ENTREGA', margin + 3, boxTop + 4);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0);
      let ly = boxTop + 8;
      wrapped.forEach(l => { doc.text(l, margin + 3, ly); ly += 3.5; });

      y = boxTop + boxHeight + 3;
      doc.setDrawColor(0);
    }
  }


  // Items table header - fixed positions prevent column overlap
  const cols = [
    { label: '#', w: 6 },
    { label: 'Foto', w: 10 },
    { label: 'Código', w: 13 },
    { label: 'Modelo / Descrição', w: 52 },
    { label: 'Marca', w: 16 },
    { label: 'Qtd', w: 7 },
    { label: 'Unit.', w: 19 },
    { label: 'Desc.', w: 8 },
    { label: 'V. Unit c/ Desc.', w: 24 },
    { label: 'Total', w: 31 }, 
  ];
  const colX = cols.reduce<number[]>((acc, col, idx) => {
    acc[idx] = idx === 0 ? margin + 1 : acc[idx - 1] + cols[idx - 1].w;
    return acc;
  }, []);
  const colRight = (idx: number) => (idx === cols.length - 1 ? W - margin - 1 : colX[idx] + cols[idx].w - 2);

  const checkPage = (needed: number) => {
    if (y + needed > 275) { 
      doc.addPage(); 
      y = margin + 12; 
    }
  };

  const headerH = 8;
  doc.setFillColor(0, 150, 136);
  doc.rect(margin, y, cw, headerH, 'F');
  doc.setTextColor(255);
  doc.setFontSize(7.2); 
  doc.setFont('helvetica', 'bold');
  resetTextSpacing();

  cols.forEach((col, idx) => {
    const isLast = idx === cols.length - 1;
    doc.text(col.label, isLast ? colRight(idx) : colX[idx], y + 5.5, { align: isLast ? 'right' : 'left' });
  });
  y += headerH + 4;

  // Preload item images with robust fallbacks so 100% of items with an image URL render.
  // Strategy per item:
  //   1) fetch → blob → dataURL (bypasses canvas taint; works with proper CORS headers)
  //   2) <img crossOrigin="anonymous"> → canvas (works when server sends CORS)
  //   3) <img> without CORS → canvas (fails on taint but tried as last resort)
  // Each attempt has a hard timeout so one slow image can't block the whole export.
  const itemImages: Record<number, string> = {};
  const IMG_TIMEOUT_MS = 8000;
  const MAX_SIZE = 60;
  const withTimeout = <T,>(p: Promise<T>, ms: number) =>
    new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout')), ms);
      p.then(v => { clearTimeout(t); resolve(v); }).catch(e => { clearTimeout(t); reject(e); });
    });

  const encodeFromImage = (img: HTMLImageElement): string => {
    let w = img.naturalWidth || MAX_SIZE;
    let h = img.naturalHeight || MAX_SIZE;
    if (w > MAX_SIZE || h > MAX_SIZE) {
      const ratio = Math.min(MAX_SIZE / w, MAX_SIZE / h);
      w = Math.round(w * ratio);
      h = Math.round(h * ratio);
    }
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx2 = c.getContext('2d')!;
    // White background so JPEG doesn't turn transparency into black
    ctx2.fillStyle = '#ffffff';
    ctx2.fillRect(0, 0, w, h);
    ctx2.drawImage(img, 0, 0, w, h);
    return c.toDataURL('image/jpeg', 0.55);
  };

  const loadImageEl = (src: string, useCors: boolean) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      if (useCors) img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('img-load'));
      // cache-buster only when needed for CORS retries handled separately
      img.src = src;
    });

  const fetchAsDataUrl = async (src: string): Promise<string | null> => {
    try {
      const resp = await fetch(src, { mode: 'cors', credentials: 'omit', cache: 'force-cache' });
      if (!resp.ok) return null;
      const blob = await resp.blob();
      if (!blob.type.startsWith('image/')) return null;
      const dataUrl: string = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result || ''));
        fr.onerror = () => reject(new Error('fr'));
        fr.readAsDataURL(blob);
      });
      // Re-encode + resize through canvas for smaller PDF
      const img = await loadImageEl(dataUrl, false);
      return encodeFromImage(img);
    } catch {
      return null;
    }
  };

  await Promise.all(
    items.map(async (item: any, i: number) => {
      const rawUrl: string | undefined = item.image_url;
      if (!rawUrl) return;
      const src = String(rawUrl).trim();
      if (!src) return;

      try {
        // Attempt 1: fetch → dataURL
        let data = await withTimeout(fetchAsDataUrl(src), IMG_TIMEOUT_MS).catch(() => null);

        // Attempt 2: <img crossOrigin="anonymous">
        if (!data) {
          try {
            const img = await withTimeout(loadImageEl(src, true), IMG_TIMEOUT_MS);
            data = encodeFromImage(img);
          } catch { /* fall through */ }
        }

        // Attempt 3: last-resort <img> without CORS (may taint canvas → will throw)
        if (!data) {
          try {
            const img = await withTimeout(loadImageEl(src, false), IMG_TIMEOUT_MS);
            data = encodeFromImage(img);
          } catch { /* skip */ }
        }

        if (data) itemImages[i] = data;
      } catch { /* skip */ }
    })
  );


  const wrapCellText = (text: string, maxWidth: number, maxLines: number) => {
    const words = normalizeCellText(text).split(' ').filter(Boolean);
    const lines: string[] = [];
    let current = '';

    const pushLongWord = (word: string) => {
      let chunk = '';
      Array.from(word).forEach((char) => {
        const candidate = chunk + char;
        if (doc.getTextWidth(candidate) <= maxWidth) {
          chunk = candidate;
        } else {
          if (chunk && lines.length < maxLines) lines.push(chunk);
          chunk = char;
        }
      });
      if (chunk && lines.length < maxLines) current = chunk;
    };

    for (const word of words) {
      if (lines.length >= maxLines) break;
      const candidate = current ? `${current} ${word}` : word;
      if (doc.getTextWidth(candidate) <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        if (lines.length >= maxLines) {
          current = '';
          break;
        }
        if (doc.getTextWidth(word) > maxWidth) {
          pushLongWord(word);
        } else {
          current = word;
        }
      }
    }
    
    if (current && lines.length < maxLines) {
      lines.push(current);
    }

    // Add ellipsis ONLY if we actually truncated text
    if (lines.length === maxLines && words.length > lines.join(' ').split(' ').length) {
      const lastLine = lines[maxLines - 1];
      if (lastLine.length > 3) {
        lines[maxLines - 1] = lastLine.substring(0, lastLine.length - 3) + '...';
      }
    }

    return lines;
  };

  // Items
  doc.setTextColor(30);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  const baseRowHeight = 10;
  
  items.forEach((item: any, i: number) => {
    const model = normalizeCellText(item.model || item.description || '');
    const specs = item.specifications ? `(${normalizeCellText(item.specifications)})` : '';
    const isExpanded = item.description_layout === 'expanded';

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.6);
    resetTextSpacing();

    const modelMaxLines = isExpanded ? 7 : (specs ? 2 : 3);
    const splitModel = wrapCellText(model, cols[3].w - 3, modelMaxLines);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.1);
    const specsMaxLines = isExpanded ? 6 : 1;
    const splitSpecs = specs ? wrapCellText(specs, cols[3].w - 3, specsMaxLines) : [];

    const hasBadges = item.is_presale || !!item.transfer_status;
    const totalLines = Math.max(1, splitModel.length + splitSpecs.length) + (hasBadges ? 1 : 0);
    const lineHeight = 3.6;
    const contentHeight = (totalLines * lineHeight) + 4;
    const rowHeight = Math.max(baseRowHeight, contentHeight);

    checkPage(rowHeight + 2);
    
    const bg = i % 2 === 0;
    if (bg) { 
      doc.setFillColor(245, 245, 245); 
      doc.rect(margin, y - 5, cw, rowHeight, 'F'); 
    }
    
    // 1. Column #
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.1);
    doc.setTextColor(30);
    resetTextSpacing();
    doc.text(String(item.item_number || i + 1), colX[0], y);

    // 2. Column Foto
    if (itemImages[i]) {
      try {
        doc.addImage(itemImages[i], 'JPEG', colX[1], y - 4, 10, 10);
      } catch { /* skip */ }
    }

    // 3. Column Código
    const codeLines = wrapCellText(item.product_code || '', cols[2].w - 2, 1);
    doc.text(codeLines, colX[2], y);

    // 4. Column Modelo / Descrição (Multi-line)
    const descX = colX[3];
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.6);
    resetTextSpacing();
    doc.text(splitModel, descX, y);
    
    if (splitSpecs.length > 0) {
      doc.setFont('helvetica', 'normal'); 
      doc.setFontSize(7.1);
      doc.setTextColor(80);
      doc.text(splitSpecs, descX, y + (splitModel.length * 3.6));
      doc.setTextColor(30);
    }

    // Badges (Pré-venda / Transferência)
    {
      const badges: { text: string; fill: [number, number, number] }[] = [];
      if (item.is_presale) badges.push({ text: 'PRÉ-VENDA', fill: [126, 34, 206] });
      if (item.transfer_status) {
        const transferLabels: Record<string, string> = { sc_sp: 'SC -> SP', sc_ce: 'SC -> CE' };
        const lbl = transferLabels[item.transfer_status] || String(item.transfer_status).toUpperCase();
        badges.push({ text: `EM TRANSFERENCIA ${lbl}`, fill: [234, 88, 12] }); // orange-600
      }
      if (badges.length) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.2);
        resetTextSpacing();
        const padX = 1.4;
        const badgeH = 3.2;
        const badgeY = y + (splitModel.length * 3.6) + (splitSpecs.length * 3.6) - 2.4;
        let bx = descX;
        badges.forEach((b) => {
          const tw = doc.getTextWidth(b.text);
          const badgeW = tw + padX * 2;
          doc.setFillColor(b.fill[0], b.fill[1], b.fill[2]);
          doc.roundedRect(bx, badgeY, badgeW, badgeH, 0.6, 0.6, 'F');
          doc.setTextColor(255, 255, 255);
          doc.text(b.text, bx + padX, badgeY + 2.3);
          bx += badgeW + 1.2;
        });
        doc.setTextColor(30);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.1);
      }
    }

    // Other Columns
    const isGift = item.is_gift === true;
    const unitPrice = parseFloat(item.unit_price) || 0;
    const discPct = parseFloat(item.discount_percent) || 0;
    const priceWithDisc = unitPrice * (1 - discPct / 100);
    
    const remainingValues = [
      item.brand || '',
      String(item.quantity || 1),
      isGift ? 'BRINDE' : fmt(unitPrice),
      isGift ? '-' : (discPct > 0 ? `${Number(discPct.toFixed(2))}%` : ''),
      isGift ? 'BRINDE' : fmt(priceWithDisc),
      isGift ? 'BRINDE' : fmt(parseFloat(item.line_total || item.total_price) || 0),
    ];

    remainingValues.forEach((val, ci) => {
      const colIdx = ci + 4;
      const isLast = colIdx === cols.length - 1;
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.0);
      resetTextSpacing();
      if (isGift && (ci === 2 || ci === 4 || ci === 5)) {
        doc.setTextColor(0, 150, 100);
        doc.setFont('helvetica', 'bold');
      } else {
        doc.setTextColor(30);
      }

      const textVal = normalizeCellText(val);
      const alignRight = colIdx >= 6;
      const x = alignRight ? colRight(colIdx) : colX[colIdx];
      const maxW = cols[colIdx].w - 2;
      const safeText = doc.getTextWidth(textVal) > maxW ? wrapCellText(textVal, maxW, 1)[0] || '' : textVal;
      doc.text(safeText, x, y, { align: alignRight || isLast ? 'right' : 'left' });
    });

    y += rowHeight;
  });

  y += 2;
  doc.setDrawColor(200);
  doc.line(margin, y, W - margin, y);
  y += 3;

  // Subtotal, Frete, Total
  const shippingCost = parseFloat(quote.shipping_cost) || 0;
  const totalWithShipping = parseFloat(quote.total_amount) || 0;
  const grandTotal = totalWithShipping;
  
  // The user wants to remove the discount from the bottom and only show Shipping and Total
  
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60);

  if (shippingCost > 0) {
    const subtotalWithoutShipping = grandTotal - shippingCost;
    doc.text(`Subtotal: ${fmt(subtotalWithoutShipping)}`, W - margin, y, { align: 'right' });
    y += 3.5;
    doc.text(`Frete: ${fmt(shippingCost)}`, W - margin, y, { align: 'right' });
    y += 4;
  }

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 128, 128);
  doc.text(`TOTAL: ${fmt(grandTotal)}`, W - margin, y, { align: 'right' });
  y += 5;

  // Payment/Shipping info
  checkPage(30);
  doc.setFontSize(7);
  doc.setTextColor(60);
  doc.setFont('helvetica', 'normal');
  const shippingLabels: Record<string, string> = {
    correios: 'Correios', mao_propria: 'Mão Própria', retirada: 'Retirada', transportadora: 'Transportadora',
  };
  const paymentMethodLabels: Record<string, string> = {
    pix: 'PIX', cartao: 'Cartão de Crédito', boleto: 'Boleto', parceria: 'Parceria',
  };
  const fmtDate = (d?: string | null) => (d ? d.split('-').reverse().join('/') : '');
  const describePayment = (method?: string | null, installments?: number | null, date?: string | null, value?: number | null) => {
    if (!method) return '';
    const label = paymentMethodLabels[method] || method;
    const parts: string[] = [label];
    if ((method === 'cartao' || method === 'boleto') && installments && installments > 1) {
      parts.push(`${installments}x`);
    }
    if (method === 'pix' && date) parts.push(`em ${fmtDate(date)}`);
    if (value && value > 0) parts.push(`(${fmt(value)})`);
    return parts.join(' ');
  };

  if (quote.is_split_payment) {
    doc.setFont('helvetica', 'bold');
    doc.text('Forma de Pagamento: Pagamento Dividido', margin, y); y += 3;
    doc.setFont('helvetica', 'normal');
    const p1 = describePayment(quote.split_method_1, quote.split_installments_1, quote.split_date_1, quote.split_value_1);
    const p2 = describePayment(quote.split_method_2, quote.split_installments_2, quote.split_date_2, quote.split_value_2);
    if (p1) { doc.text(`  • 1º Pagamento: ${p1}`, margin, y); y += 3; }
    if (p2) { doc.text(`  • 2º Pagamento: ${p2}`, margin, y); y += 3; }
  } else if (quote.payment_method) {
    const pdesc = describePayment(quote.payment_method, quote.installments, quote.payment_date, null);
    doc.setFont('helvetica', 'bold');
    doc.text(`Forma de Pagamento: `, margin, y);
    const lblW = doc.getTextWidth('Forma de Pagamento: ');
    doc.setFont('helvetica', 'normal');
    doc.text(pdesc, margin + lblW, y);
    y += 3;
  }
  if (quote.payment_terms) {
    const ptLines = doc.splitTextToSize(`Condições: ${quote.payment_terms}`, cw);
    doc.text(ptLines, margin, y); y += ptLines.length * 3;
  }
  if (quote.shipping_deadline) { doc.text(`Prazo de Envio: ${quote.shipping_deadline}`, margin, y); y += 3; }
  if (quote.shipping_method) { doc.text(`Forma de Envio: ${shippingLabels[quote.shipping_method] || quote.shipping_method}`, margin, y); y += 3; }
  if (quote.proposal_validity) { doc.text(`Validade da Proposta: ${quote.proposal_validity}`, margin, y); y += 3; }
  y += 1;

  // Notes
  if (quote.notes) {
    checkPage(10);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(0);
    doc.text('Observações:', margin, y);
    y += 3;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60);
    const noteLines = doc.splitTextToSize(quote.notes, cw);
    doc.text(noteLines, margin, y);
    y += noteLines.length * 3 + 2;
  }

  // Bank details + Signature side by side
  checkPage(18);
  y += 1;
  doc.setDrawColor(200);
  doc.line(margin, y, W - margin, y);
  y += 3;

  // Left: Bank details
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(0, 128, 128);
  doc.text('DADOS BANCÁRIOS', margin, y);
  y += 3;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(50);
  doc.text('ITAÚ - Ag: 0366 | Cc: 71016-8 | Multicomercial e Importadora EIRELI | Pix (CNPJ): 05.502.390/0001-11', margin, y);
  y += 5;

  // Signature lines
  const sigX = margin;
  const sigW = 65;
  doc.setDrawColor(100);
  doc.line(sigX, y, sigX + sigW, y);
  doc.setFontSize(6);
  doc.setTextColor(60);
  doc.text('Data: ___/___/______', sigX, y + 3);

  const sigX2 = W - margin - sigW;
  doc.line(sigX2, y, sigX2 + sigW, y);
  doc.text('Aprovação do Cliente', sigX2 + sigW / 2, y + 3, { align: 'center' });

  // Confidentiality footer
  y += 7;
  doc.setFontSize(5);
  doc.setTextColor(130);
  doc.setFont('helvetica', 'italic');
  const confText = 'O documento é confidencial e de propriedade da empresa. Não pode ser copiado, mesmo que em parte sem permissão por escrito da mesma.';
  doc.text(confText, W / 2, y, { align: 'center', maxWidth: cw });
  if (options?.returnBlob) {
    return doc.output('blob');
  }

  const clientName = client?.company_name || client?.name || '';
  const sanitized = clientName.replace(/[\/\\?%*:|"<>]/g, '').trim().substring(0, 30);
  const fileName = sanitized ? `${quote.quote_number} ${sanitized}.pdf` : `${quote.quote_number}.pdf`;
  doc.save(fileName);
}
