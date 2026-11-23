// Builds the quotation PDF in the browser (works offline, on phones too).
// Standard PDF fonts have no ₹ glyph, so amounts print as "INR 1,35,700.00".
import type { CompanySettings, Partner, Quote } from '../data/types';
import sign1 from '../assets/signatures/sign-1.png';
import sign2 from '../assets/signatures/sign-2.png';

/** Signature images, in the same order as the partners (by their sort order). */
const SIGNATURES = [sign1, sign2];
export const signersOf = (partners: Partner[]) =>
  partners.filter((p) => p.active).sort((a, b) => a.sort - b.sort).map((p) => p.name);

async function imgSize(url: string): Promise<{ url: string; w: number; h: number } | null> {
  try { const img = new Image(); img.src = url; await img.decode(); return { url, w: img.naturalWidth, h: img.naturalHeight }; } catch { return null; }
}
import { lockupSvg } from '../lib/brand';
import { inWords } from '../lib/money';
import { quoteTotals } from '../lib/finance';

const n2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const amt = (paise: number) => n2.format(paise / 100);
const d = (s: string | null) => (s ? new Date(s + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

async function svgToPng(svg: string, width: number, height: number): Promise<string> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = width; c.height = height;
    c.getContext('2d')!.drawImage(img, 0, 0, width, height);
    return c.toDataURL('image/png');
  } finally { URL.revokeObjectURL(url); }
}

export async function buildQuotePdf(q: Quote, co: CompanySettings, signers: string[] = []): Promise<{ blob: Blob; filename: string }> {
  const [{ jsPDF }, at] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  // jspdf-autotable ships ESM + UMD; depending on the bundler the function is at .default or .default.default
  const autoTable = (typeof at.default === 'function' ? at.default : (at.default as unknown as { default: typeof at.default }).default);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const isInv = q.kind === 'invoice';
  const W = 210, M = 16;
  const INK: [number, number, number] = [12, 12, 12];
  const GREY: [number, number, number] = [110, 110, 106];
  const LINE: [number, number, number] = [205, 205, 200];

  // jsPDF ignores charSpace when aligning right, so place tracked text by measuring it
  const rightSpaced = (text: string, y: number, cs: number) => {
    const w = doc.getTextWidth(text) + cs * (text.length - 1);
    doc.text(text, W - M - w, y, { charSpace: cs });
  };

  // ---- header
  const lock = lockupSvg('#0C0C0C');
  const logoW = 66, logoH = (logoW * lock.height) / lock.width;
  try { doc.addImage(await svgToPng(lock.svg, 1400, Math.round((1400 * lock.height) / lock.width)), 'PNG', M - 1, 14, logoW, logoH); } catch { /* logo optional */ }

  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'normal').setFontSize(24);
  rightSpaced(isInv ? 'INVOICE' : 'QUOTATION', 22, 1.2);
  doc.setFontSize(8.5).setTextColor(...GREY);
  const meta = [['No.', q.number ?? 'DRAFT'], [isInv ? 'Invoice date' : 'Date', d(q.issue_date)], [isInv ? 'Due date' : 'Valid until', d(q.valid_until)]];
  meta.forEach(([k, v], i) => {
    doc.setTextColor(...GREY).text(k.toUpperCase(), W - M - 44, 30 + i * 5, { charSpace: 0.4 });
    doc.setTextColor(...INK).text(v, W - M, 30 + i * 5, { align: 'right' });
  });

  doc.setDrawColor(...INK).setLineWidth(0.5).line(M, 47, W - M, 47);

  // ---- parties
  const col = (x: number, label: string, lines: string[]) => {
    doc.setFontSize(7.5).setTextColor(...GREY).text(label.toUpperCase(), x, 55, { charSpace: 0.6 });
    doc.setFontSize(10.5).setTextColor(...INK).setFont('helvetica', 'bold').text(lines[0] || '—', x, 61);
    doc.setFont('helvetica', 'normal').setFontSize(8.8).setTextColor(60, 60, 58);
    let y = 66;
    for (const l of lines.slice(1).flatMap((s) => doc.splitTextToSize(s, 82) as string[])) { doc.text(l, x, y); y += 4.2; }
    return y;
  };
  const cs = q.client_snapshot || {};
  const yA = col(M, 'From', [co.legal_name, co.address, [co.phone, co.email].filter(Boolean).join('  ·  '), co.gstin ? `GSTIN ${co.gstin}` : ''].filter(Boolean));
  const yB = col(W / 2 + 4, isInv ? 'Billed to' : 'Prepared for', [cs.name ?? '', cs.contact_name ? `Attn: ${cs.contact_name}` : '', [cs.address, cs.city].filter(Boolean).join(', '), [cs.phone, cs.email].filter(Boolean).join('  ·  '), cs.gstin ? `GSTIN ${cs.gstin}` : ''].filter(Boolean));
  let y = Math.max(yA, yB) + 4;

  if (q.title) {
    doc.setFontSize(7.5).setTextColor(...GREY).text('PROJECT', M, y, { charSpace: 0.6 });
    doc.setFontSize(15).setTextColor(...INK).text(q.title, M, y + 7);
    y += 13;
  }

  // ---- items
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [['#', 'Item', 'Qty', 'Rate (INR)', 'Amount (INR)']],
    body: q.items.map((it, i) => [
      String(i + 1).padStart(2, '0'),
      { content: `${it.name}${it.description ? `\n${it.description}` : ''}` },
      `${trimQty(it.qty)} ${it.unit}`,
      amt(it.rate),
      amt(Math.round(it.qty * it.rate)),
    ]),
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 9, textColor: INK, cellPadding: { top: 3.4, bottom: 3.4, left: 2.4, right: 2.4 }, lineColor: LINE, valign: 'top' },
    headStyles: { fillColor: INK, textColor: [245, 245, 243], fontSize: 7.5, fontStyle: 'normal', cellPadding: { top: 3, bottom: 3, left: 2.4, right: 2.4 } },
    columnStyles: { 0: { cellWidth: 10, textColor: GREY }, 2: { cellWidth: 24, halign: 'right' }, 3: { cellWidth: 30, halign: 'right' }, 4: { cellWidth: 32, halign: 'right' } },
    didParseCell: (h) => {
      if (h.section === 'head' && h.column.index >= 2) h.cell.styles.halign = 'right';
      if (h.section === 'body') h.cell.styles.lineWidth = { bottom: 0.2, top: 0, left: 0, right: 0 };
    },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  // ---- totals
  const t = quoteTotals(q.items, q.discount, q.tax_pct);
  if (y > 225) { doc.addPage(); y = 24; }
  const tx = W - M - 78;
  const rows: [string, string][] = [['Subtotal', amt(t.subtotal)]];
  if (q.discount) rows.push(['Discount', `- ${amt(q.discount)}`], ['Taxable value', amt(t.taxable)]);
  if (q.tax_pct) rows.push([`GST @ ${trimQty(q.tax_pct)}%`, amt(t.tax_amount)]);
  doc.setFontSize(9);
  rows.forEach(([k, v]) => {
    doc.setTextColor(...GREY).text(k, tx, y);
    doc.setTextColor(...INK).text(v, W - M, y, { align: 'right' });
    y += 6;
  });
  doc.setFillColor(...INK).roundedRect(tx - 4, y - 3, 78 + 4, 13, 1.5, 1.5, 'F');
  doc.setTextColor(245, 245, 243).setFontSize(7.5).text('TOTAL (INR)', tx, y + 4.8, { charSpace: 0.6 });
  doc.setFontSize(13).setFont('helvetica', 'bold').text(amt(t.total), W - M - 3, y + 5.4, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  y += 17;
  // invoices: what's been received and what's left, plus a PAID mark when settled
  if (isInv) {
    const paid = Math.min(q.paid ?? 0, t.total), due = Math.max(0, t.total - paid);
    doc.setFontSize(9);
    for (const [k, v, bold] of [['Amount received', amt(paid), false], ['Balance due', amt(due), true]] as [string, string, boolean][]) {
      doc.setTextColor(...GREY).text(k, tx, y);
      doc.setFont('helvetica', bold ? 'bold' : 'normal').setTextColor(...INK).text(v, W - M, y, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      y += 6;
    }
    if (t.total > 0 && due === 0) {
      doc.setDrawColor(...INK).setLineWidth(0.8).roundedRect(M, y - 34, 46, 17, 2, 2, 'S');
      doc.setFont('helvetica', 'bold').setFontSize(22).setTextColor(...INK);
      const pw = doc.getTextWidth('PAID') + 2 * 3; // charSpace isn't included when centring
      doc.text('PAID', M + 23 - pw / 2, y - 22.5, { charSpace: 2 });
      doc.setFont('helvetica', 'normal');
    }
    y += 3;
  }
  doc.setFontSize(8.3).setTextColor(...GREY);
  const words = doc.splitTextToSize(inWords(t.total), W - 2 * M) as string[];
  doc.text(words, W - M, y, { align: 'right' });
  y += words.length * 4 + 8;

  // ---- notes / terms / bank
  const block = (x: number, width: number, label: string, text: string, y0: number) => {
    if (!text.trim()) return y0;
    doc.setFontSize(7.5).setTextColor(...GREY).text(label.toUpperCase(), x, y0, { charSpace: 0.6 });
    doc.setFontSize(8.6).setTextColor(50, 50, 48);
    const lines = doc.splitTextToSize(text, width) as string[];
    doc.text(lines, x, y0 + 5.5, { lineHeightFactor: 1.45 });
    return y0 + 5.5 + lines.length * 4.4 + 6;
  };
  if (y > 240) { doc.addPage(); y = 24; }
  doc.setDrawColor(...LINE).setLineWidth(0.2).line(M, y - 4, W - M, y - 4);
  y += 2;
  const left = block(M, 100, 'Notes', q.notes, y);
  const left2 = block(M, 100, 'Terms', q.terms || (isInv ? '' : co.quote_terms), left);
  const right = block(W - M - 62, 62, 'Bank details', co.bank_details, y);
  y = Math.max(left2, right) + 8;

  // ---- signatures: both partners sign as authorised signatories
  if (y > 244) { doc.addPage(); y = 30; }
  const sigs = (await Promise.all(SIGNATURES.map(imgSize))).filter((x): x is NonNullable<typeof x> => !!x);
  const colW = 44, gap = 10, boxH = 20;
  const x0 = W - M - (sigs.length * colW + (sigs.length - 1) * gap);
  doc.setFontSize(7.5).setTextColor(...GREY);
  doc.text(`FOR ${co.legal_name.toUpperCase()}`, x0, y, { charSpace: 0.5 });
  const lineY = y + 4 + boxH;
  sigs.forEach((sg, i) => {
    const cx = x0 + i * (colW + gap);
    // fit inside the box, keep the aspect ratio, sit on the line
    const sc = Math.min((colW - 2) / sg.w, boxH / sg.h);
    const w = sg.w * sc, h = sg.h * sc;
    try { doc.addImage(sg.url, 'PNG', cx + (colW - w) / 2, lineY - h + 1.5, w, h); } catch { /* image optional */ }
    doc.setDrawColor(...INK).setLineWidth(0.3).line(cx, lineY + 2, cx + colW, lineY + 2);
    doc.setFontSize(8.6).setTextColor(...INK);
    if (signers[i]) doc.text(signers[i], cx, lineY + 6.5);
    doc.setFontSize(6.8).setTextColor(...GREY).text('AUTHORISED SIGNATORY', cx, lineY + (signers[i] ? 10.5 : 6.5), { charSpace: 0.4 });
  });

  // ---- footer on every page
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...INK).setLineWidth(0.5).line(M, 284, M + 12, 284);
    doc.setFontSize(7).setTextColor(...GREY);
    doc.text([co.legal_name, co.email, co.phone].filter(Boolean).join('   ·   '), M + 16, 285);
    doc.text(`${q.number ?? 'DRAFT'}   ${i} / ${pages}`, W - M, 285, { align: 'right' });
  }

  const safe = (q.number ?? 'draft').replace(/[^\w-]+/g, '-');
  const client = (cs.name ?? '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');
  return { blob: doc.output('blob'), filename: `${isInv ? 'Invoice' : 'Quotation'}-${safe}${client ? '-' + client : ''}.pdf` };
}

const trimQty = (n: number) => String(Math.round(n * 100) / 100);

/** Native share sheet on phones (WhatsApp, Mail…), download elsewhere. */
export async function shareOrDownload(blob: Blob, filename: string, title: string): Promise<'shared' | 'downloaded'> {
  const file = new File([blob], filename, { type: 'application/pdf' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] }) && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)) {
    try { await navigator.share({ files: [file], title }); return 'shared'; } catch (e) { if ((e as Error).name === 'AbortError') return 'shared'; }
  }
  download(blob, filename);
  return 'downloaded';
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
