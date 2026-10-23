// js/invoice-pdf.js — Genera el PDF de una factura con el diseño "facturas" de Canva
// ==========================================================
// La plantilla (img/factura/plantilla-factura.pdf) es la página de Canva sin los datos
// variables (la crea tools/factura/build_template.py). Aquí se escriben encima los datos
// de la factura con las mismas coordenadas, tipografía (Montserrat) y colores del diseño.
// Necesita PDFLib (js/vendor/pdf-lib) y fontkit (js/vendor/fontkit) cargados antes.
//
// DazentyInvoicePdf.generate(data) → Promise<Uint8Array>
//   data = {
//     number, issueDate: 'YYYY-MM-DD',
//     client: { name, phone, address },
//     items: [{ description, quantity, unit_price }],
//     taxRate,                       // 0 = factura sin IVA
//     paymentMethod, statusLabel,
//     extraLabel, extraValue,        // fila opcional bajo "Estado" (p. ej. Hosting)
//     contactPhone,
//   }
// ==========================================================

(function (global) {
  const PLANTILLA_URL = '/img/factura/plantilla-factura.pdf?v=20261023';
  const FONT_URLS = {
    regular: '/fonts/montserrat-regular.ttf',
    bold: '/fonts/montserrat-bold.ttf',
    boldItalic: '/fonts/montserrat-bolditalic.ttf',
  };
  const MAX_ITEMS = 7;
  const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio',
    'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  // Posiciones medidas sobre el PDF exportado de Canva (origen arriba a la izquierda, en puntos)
  const L = {
    pageRight: 536.6,
    numberY: 119.0,
    dateY: 135.0,
    clientX: 131.3,
    clientY: [244.4, 260.9, 277.3],
    clientMaxW: 400,
    firstRowY: 386.0,
    rowPitch: 38.3,
    rowLineGap: 15,
    rowsSpace: 112,          // alto disponible para filas extra antes de chocar con "Información de pago"
    descX: 59.8,
    descMaxW: 175,
    priceCenterX: 276.9,
    qtyCenterX: 394.1,
    totalRightX: 528.3,
    tableLineX: [61.5, 536.3],
    sumLabelX: 395.8,
    sumRightX: 530.2,
    subtotalGap: 21.9,
    sumPitch: 15,
    boxGap: 31.8,
    box: { x: 367.3, w: 169.4, h: 28 },
    contactX: 59.8,
    contactOffsets: [27.5, 42.4, 56.2, 70.7],
    payValueX: 209.3,
    payY: [712.7, 728.7, 743.7],
    payLabelX: 61.0,
    payValueMaxW: 170,
    bottomLineY: 747.6,
    bottomLineRight: 315.8,
  };
  const DARK = [0x24 / 255, 0x24 / 255, 0x24 / 255];

  let assetsPromise = null;
  function loadAssets() {
    if (!assetsPromise) {
      const get = url => fetch(url).then(r => {
        if (!r.ok) throw new Error(`No se pudo cargar ${url}`);
        return r.arrayBuffer();
      });
      assetsPromise = Promise.all([
        get(PLANTILLA_URL), get(FONT_URLS.regular), get(FONT_URLS.bold), get(FONT_URLS.boldItalic),
      ]).catch(err => { assetsPromise = null; throw err; });
    }
    return assetsPromise;
  }

  function money(n) {
    const v = Math.round((Number(n) || 0) * 100) / 100;
    const decimals = Number.isInteger(v) ? 0 : 2;
    return new Intl.NumberFormat('es-ES', {
      useGrouping: 'always', minimumFractionDigits: decimals, maximumFractionDigits: decimals,
    }).format(v) + '€';
  }

  function qty(n) {
    const v = Number(n) || 0;
    return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(v);
  }

  function longDate(iso) {
    const [y, m, d] = String(iso || '').split('-').map(Number);
    if (!y || !m || !d) return '';
    return `${d} de ${MONTHS[m - 1]} del ${y}`;
  }

  function invoiceNumberLabel(number) {
    const clean = String(number || '').replace(/^\s*n[º°o]?\.?\s*/i, '').trim();
    return clean ? `Nº${clean}` : '';
  }

  // Recorta el texto con "…" para que no pase de maxW
  function fit(text, font, size, maxW) {
    let t = String(text || '');
    if (font.widthOfTextAtSize(t, size) <= maxW) return t;
    while (t.length > 1 && font.widthOfTextAtSize(t + '…', size) > maxW) t = t.slice(0, -1);
    return t.trimEnd() + '…';
  }

  // Parte el texto en líneas de como mucho maxW (máximo maxLines; la última se recorta)
  function wrap(text, font, size, maxW, maxLines) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = '';
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (!cur || font.widthOfTextAtSize(next, size) <= maxW) cur = next;
      else { lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    if (lines.length > maxLines) {
      const rest = lines.splice(maxLines - 1).join(' ');
      lines.push(fit(rest, font, size, maxW));
    }
    return lines.map(l => fit(l, font, size, maxW));
  }

  async function generate(data) {
    const { PDFDocument, rgb } = global.PDFLib;
    const items = (data.items || []).filter(it => String(it.description || '').trim());
    if (!items.length) throw new Error('La factura no tiene líneas');
    if (items.length > MAX_ITEMS) throw new Error(`El diseño admite como mucho ${MAX_ITEMS} líneas por factura`);

    const [plantilla, fReg, fBold, fBoldIt] = await loadAssets();
    const pdf = await PDFDocument.load(plantilla);
    pdf.registerFontkit(global.fontkit);
    const reg = await pdf.embedFont(fReg, { subset: true });
    const bold = await pdf.embedFont(fBold, { subset: true });
    const boldIt = await pdf.embedFont(fBoldIt, { subset: true });
    const page = pdf.getPage(0);
    // La MediaBox de Canva no empieza en y=0: se mide desde su borde superior real
    const mediaBox = page.getMediaBox();
    const H = mediaBox.y + mediaBox.height;
    const dark = rgb(...DARK);
    const black = rgb(0, 0, 0);
    const white = rgb(1, 1, 1);

    const text = (t, x, y, font, size, color = dark) =>
      t && page.drawText(t, { x, y: H - y, font, size, color });
    const textRight = (t, right, y, font, size, color) =>
      text(t, right - font.widthOfTextAtSize(t, size), y, font, size, color);
    const textCenter = (t, cx, y, font, size, color) =>
      text(t, cx - font.widthOfTextAtSize(t, size) / 2, y, font, size, color);
    const hLine = (x1, x2, y, thickness) =>
      page.drawLine({ start: { x: x1, y: H - y }, end: { x: x2, y: H - y }, thickness, color: dark });

    // Cabecera: "Factura: Nº001" y "Fecha: 5 de Marzo del 2026" alineados a la derecha
    const dateStr = longDate(data.issueDate);
    const dateLeft = L.pageRight - bold.widthOfTextAtSize(dateStr, 10);
    textRight(dateStr, L.pageRight, L.dateY, bold, 10);
    textRight('Fecha:', dateLeft - 3, L.dateY, reg, 10);
    const numStr = invoiceNumberLabel(data.number);
    const numLeft = L.pageRight - 2 - bold.widthOfTextAtSize(numStr, 10);
    textRight(numStr, L.pageRight - 2, L.numberY, bold, 10);
    text('Factura:', Math.min(dateLeft - 2, numLeft - 8 - reg.widthOfTextAtSize('Factura:', 10)), L.numberY, reg, 10);

    // Información del cliente
    const client = data.client || {};
    [client.name, client.phone, client.address].forEach((v, i) =>
      text(fit(v, reg, 10, L.clientMaxW), L.clientX, L.clientY[i], reg, 10));

    // Líneas de la tabla (se juntan si hay más de las que caben con el espaciado del diseño)
    const taxRate = Number(data.taxRate) || 0;
    const extraSum = taxRate > 0 ? L.sumPitch : 0;
    const pitch = items.length > 1
      ? Math.min(L.rowPitch, (L.rowsSpace - extraSum) / (items.length - 1))
      : L.rowPitch;
    let subtotal = 0;
    let lineY = 0;
    items.forEach((it, i) => {
      const y = L.firstRowY + i * pitch;
      const q = Number(it.quantity) || 0;
      const price = Number(it.unit_price) || 0;
      const lineTotal = Math.round(q * price * 100) / 100;
      subtotal += lineTotal;
      text(fit(it.description, reg, 10, L.descMaxW), L.descX, y, reg, 10, black);
      textCenter(money(price), L.priceCenterX, y, reg, 10, black);
      textCenter(qty(q), L.qtyCenterX, y, reg, 10, black);
      textRight(money(lineTotal), L.totalRightX, y, reg, 10, black);
      lineY = y + L.rowLineGap;
      hLine(L.tableLineX[0], L.tableLineX[1], lineY, 0.75);
    });
    subtotal = Math.round(subtotal * 100) / 100;
    const taxAmount = Math.round(subtotal * taxRate) / 100;
    const total = Math.round((subtotal + taxAmount) * 100) / 100;

    // Sub-total, IVA (solo si se añade) y caja TOTAL
    let sumY = lineY + L.subtotalGap;
    text('Sub-total', L.sumLabelX, sumY, reg, 10, black);
    textRight(money(subtotal), L.sumRightX, sumY, reg, 10, black);
    if (taxRate > 0) {
      sumY += L.sumPitch;
      text(`IVA (${qty(taxRate)}%)`, L.sumLabelX, sumY, reg, 10, black);
      textRight(money(taxAmount), L.sumRightX, sumY, reg, 10, black);
    }
    const boxTop = sumY + L.boxGap;
    page.drawRectangle({ x: L.box.x, y: H - boxTop - L.box.h, width: L.box.w, height: L.box.h, color: dark });
    text('TOTAL', 385.9, boxTop + 19.3, bold, 16.47, white);
    textRight(money(total), 528.9, boxTop + 19.0, boldIt, 14, white);

    // Contacto (a la altura de la caja TOTAL, como en el diseño)
    const contactTop = boxTop - 2.2;
    text('CONTACTO', L.contactX, contactTop, bold, 16);
    ['@dazen.ty', 'designerazenty@gmail.com', 'www.dazenty.com', data.contactPhone || '676 448 762']
      .forEach((v, i) => text(v, L.contactX, contactTop + L.contactOffsets[i], reg, 10));

    // Información de pago
    text(String(data.paymentMethod || '').toUpperCase(), L.payValueX, L.payY[0], reg, 10);
    text(String(data.statusLabel || '').toUpperCase(), L.payValueX, L.payY[1], reg, 10);
    let bottomLineY = L.bottomLineY;
    if (String(data.extraValue || '').trim()) {
      const label = `${String(data.extraLabel || 'Hosting').trim().replace(/:$/, '')}:`;
      text(fit(label, bold, 10, L.payValueX - L.payLabelX - 6), L.payLabelX, L.payY[2], bold, 10);
      const lines = wrap(String(data.extraValue).toUpperCase(), reg, 10, L.payValueMaxW, 2);
      lines.forEach((l, i) => text(l, L.payValueX, L.payY[2] + i * 12, reg, 10));
      bottomLineY = L.payY[2] + (lines.length - 1) * 12 + 18;
    }
    hLine(0, L.bottomLineRight, bottomLineY, 2.25);

    pdf.setTitle(`Factura ${numStr}`.trim());
    pdf.setAuthor('Dazenty');
    pdf.setCreator('Dazenty OS');
    return pdf.save();
  }

  global.DazentyInvoicePdf = { generate, money, longDate, invoiceNumberLabel, MAX_ITEMS };
})(typeof window !== 'undefined' ? window : globalThis);
