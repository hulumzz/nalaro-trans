import { jsPDF } from 'jspdf';
import autoTable, { type UserOptions } from 'jspdf-autotable/es';
import QRCode from 'qrcode';
import { documentPaymentInformation } from './payment';
import { verificationUrl } from './verification';

const INK: [number, number, number] = [32, 33, 30];
const MUTED: [number, number, number] = [112, 114, 106];
const LINE: [number, number, number] = [220, 220, 214];
const PAPER: [number, number, number] = [242, 242, 239];
const FLARE: [number, number, number] = [255, 91, 46];
const LEFT = 14, RIGHT = 196, WIDTH = 182, TOP = 35, BOTTOM = 279;
const money = (value: unknown = 0) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value) || 0);
const text = (value: unknown) => String(value ?? '').trim() || '—';
const safeFileName = (value: string) => value.replace(/[\\/:*?"<>|\x00-\x1F]/g, '-');
const date = (value: any) => {
  if (!value) return '—';
  const parsed = value.seconds ? new Date(value.seconds * 1000) : new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? value + 'T00:00:00Z' : value);
  return Number.isNaN(parsed.getTime()) ? text(value) : new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(parsed);
};

async function imageFromUrl(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('Gambar dokumen tidak dapat dimuat.');
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Gambar dokumen tidak dapat dibaca.'));
    reader.readAsDataURL(blob);
  });
}
/** Keep a four-module quiet zone, high error correction and a small centre mark. */
export async function verificationQr(url: string, logo?: string) {
  const canvas = document.createElement('canvas');
  await QRCode.toCanvas(canvas, url, { errorCorrectionLevel: 'H', margin: 4, width: 600, color: { dark: '#20211e', light: '#ffffff' } });
  if (logo) {
    try {
      const image = new Image();
      image.src = logo;
      await image.decode();
      const context = canvas.getContext('2d')!;
      const box = canvas.width * 0.16, mark = canvas.width * 0.12;
      context.fillStyle = '#ffffff';
      context.fillRect((canvas.width - box) / 2, (canvas.height - box) / 2, box, box);
      context.fillStyle = '#20211e';
      context.fillRect((canvas.width - mark) / 2, (canvas.height - mark) / 2, mark, mark);
      const icon = mark * 0.82;
      context.drawImage(image, (canvas.width - icon) / 2, (canvas.height - icon) / 2, icon, icon);
    } catch { /* A plain QR remains usable when the logo is unavailable. */ }
  }
  return canvas.toDataURL('image/png');
}

class LayoutOverflow extends Error {}
type Assets = { logo: string; url: string; qr: string };

/** Every successful export is exactly one A4 page; no content is silently clipped. */
class DocumentLayout {
  doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  y = TOP;
  constructor(private title: string, private assets: Assets, private settings: any, number: string, private scale: number) {
    this.doc.setProperties({ title: `${title} ${number}`, author: settings.businessName || 'Nalaro' });
    const doc = this.doc;
    doc.setFillColor(...PAPER); doc.rect(0, 0, 210, 27, 'F');
    if (assets.logo) {
      doc.setFillColor(...INK); doc.roundedRect(LEFT, 6, 15, 15, 2, 2, 'F');
      doc.addImage(assets.logo, 'PNG', LEFT + 1.5, 7.5, 12, 12);
    }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.setTextColor(...INK);
    doc.text('NALARO', assets.logo ? 33 : LEFT, 15);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...MUTED);
    doc.text(settings.website || 'nalaro.web.id', assets.logo ? 33 : LEFT, 20);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.setTextColor(...FLARE);
    doc.text(title, RIGHT, 17, { align: 'right' });
  }
  font(size: number) { return Math.max(7, size * this.scale); }
  ensure(height: number) { if (this.y + height > BOTTOM) throw new LayoutOverflow(); }
  table(options: UserOptions) {
    this.ensure(8);
    autoTable(this.doc, {
      startY: this.y, theme: 'plain',
      margin: { top: TOP, bottom: 18, left: LEFT, right: LEFT },
      styles: { font: 'helvetica', fontSize: this.font(9), textColor: INK, overflow: 'linebreak', cellPadding: { top: 1.4 * this.scale, right: 3, bottom: 1.4 * this.scale, left: 0 }, lineColor: LINE },
      headStyles: { fontSize: 7, fontStyle: 'normal', textColor: MUTED, fillColor: [255, 255, 255], cellPadding: { top: 0.8 * this.scale, right: 3, bottom: 0.8 * this.scale, left: 0 } },
      rowPageBreak: 'avoid',
      ...options,
      willDrawPage: () => { if (this.doc.getCurrentPageInfo().pageNumber > 1) throw new LayoutOverflow(); },
    });
    this.y = (this.doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 2.5 * this.scale;
    this.ensure(0);
  }
  fields(fields: [string, unknown][], widths?: number[]) {
    this.table({ head: [fields.map(([label]) => label.toUpperCase())], body: [fields.map(([, value]) => text(value))], bodyStyles: { fontStyle: 'bold' }, columnStyles: widths ? Object.fromEntries(widths.map((width, index) => [index, { cellWidth: width }])) : {} });
  }
  rule() {
    this.ensure(4); this.doc.setDrawColor(...LINE); this.doc.line(LEFT, this.y, RIGHT, this.y); this.y += 3 * this.scale;
  }
  summary(rows: string[][], notes?: string) {
    const start = this.y;
    this.table({
      tableWidth: 80, margin: { top: TOP, bottom: 18, left: 116, right: LEFT },
      body: rows,
      styles: { font: 'helvetica', fontSize: this.font(8.5), textColor: INK, overflow: 'linebreak', cellPadding: { top: 1.4 * this.scale, bottom: 1.4 * this.scale, left: 3, right: 3 } },
      columnStyles: { 0: { cellWidth: 34 }, 1: { cellWidth: 46, halign: 'right' } },
      didParseCell: (data) => {
        if (Array.isArray(data.row.raw) && data.row.raw[0] === 'Total') { data.cell.styles.fontStyle = 'bold'; data.cell.styles.fontSize = this.font(11); data.cell.styles.fillColor = PAPER; data.cell.styles.textColor = FLARE; }
      },
    });
    const end = this.y;
    if (notes) {
      this.y = start;
      this.table({ tableWidth: 94, head: [['NOTES']], body: [[notes]], columnStyles: { 0: { cellWidth: 94 } } });
      this.y = Math.max(this.y, end);
    }
  }
  async paymentAndVerification(record: any, isReceipt: boolean) {
    const payment = documentPaymentInformation(record, this.settings);
    const cash = payment.kind === 'cash';
    const lines = cash ? [] : (payment.lines || []).filter(Boolean).map(String);
    const image = cash ? '' : String(payment.qrisImage || '');
    let imageInfo: ReturnType<jsPDF['getImageProperties']> | undefined;
    let imageWidth = 0, imageHeight = 0;
    if (image) {
      try {
        imageInfo = this.doc.getImageProperties(image);
        const factor = Math.min(42 / imageInfo.width, 55 / imageInfo.height);
        imageWidth = imageInfo.width * factor; imageHeight = imageInfo.height * factor;
      } catch { throw new Error('Gambar QRIS tidak valid. Unggah ulang PNG/JPG di Pengaturan.'); }
    }
    // Account information, the original payment image and verification share one row.
    const infoWidth = image ? 94 : this.assets.qr ? 140 : WIDTH;
    this.doc.setFont('helvetica', 'normal'); this.doc.setFontSize(this.font(8.5));
    const infoLines: string[] = this.doc.splitTextToSize(lines.join('\n'), infoWidth);
    const lineHeight = this.font(8.5) * 0.3528 * 1.3;
    this.doc.setFontSize(7);
    const hostLines: string[] = this.assets.url ? this.doc.splitTextToSize(new URL(this.assets.url).host, 34) : [];
    const height = Math.max(24 + infoLines.length * lineHeight, image ? imageHeight + 16 : 0, this.assets.qr ? 43 + hostLines.length * 3 : 0);
    this.ensure(height + 5);
    const y = Math.max(this.y + 5, BOTTOM - height);
    this.doc.setDrawColor(...LINE); this.doc.line(LEFT, y, RIGHT, y);
    this.doc.setFont('helvetica', 'bold'); this.doc.setFontSize(7); this.doc.setTextColor(...MUTED);
    this.doc.text(isReceipt ? 'PAYMENT DETAILS' : 'PAYMENT METHOD', LEFT, y + 6);
    this.doc.setFontSize(this.font(9)); this.doc.setTextColor(...INK);
    this.doc.text(payment.method || 'Bank Transfer', LEFT, y + 12);
    this.doc.setFont('helvetica', 'normal'); this.doc.setFontSize(this.font(8.5));
    if (infoLines.length) this.doc.text(infoLines, LEFT, y + 18, { lineHeightFactor: 1.3 });
    if (image && imageInfo) {
      const x = 114;
      this.doc.setFont('helvetica', 'bold'); this.doc.setFontSize(7); this.doc.setTextColor(...MUTED);
      this.doc.text('QRIS PAYMENT', x, y + 6);
      this.doc.addImage(image, imageInfo.fileType, x + (44 - imageWidth) / 2, y + 10, imageWidth, imageHeight);
    }
    if (this.assets.qr) {
      const x = 162;
      this.doc.setFont('helvetica', 'bold'); this.doc.setFontSize(7); this.doc.setTextColor(...MUTED);
      this.doc.text('VERIFY DOCUMENT', x, y + 6);
      this.doc.addImage(this.assets.qr, 'PNG', x + 2, y + 10, 30, 30);
      this.doc.link(x + 2, y + 10, 30, 30, { url: this.assets.url });
      this.doc.setFont('helvetica', 'normal'); this.doc.setFontSize(7);
      this.doc.text(hostLines, x, y + 44);
      this.doc.link(x, y + 41, 34, Math.max(4, hostLines.length * 3), { url: this.assets.url });
    }
    this.y = y + height;
    this.ensure(0);
  }
  finish(isInvoice: boolean) {
    if (this.doc.getNumberOfPages() !== 1) throw new LayoutOverflow();
    this.doc.setDrawColor(...LINE); this.doc.line(LEFT, 283, RIGHT, 283);
    this.doc.setFont('helvetica', 'normal'); this.doc.setFontSize(7); this.doc.setTextColor(...MUTED);
    if (isInvoice) this.doc.text('Commercial invoice. Not a tax invoice.', LEFT, 289);
    else this.doc.text(this.settings.businessName || 'Nalaro', LEFT, 289);
    const contact = this.settings.email || this.settings.website || 'nalaro.web.id';
    this.doc.text(contact, RIGHT, 289, { align: 'right' });
    return this.doc;
  }
}

async function fitDocument(title: string, record: any, settings: any, number: string, render: (layout: DocumentLayout) => Promise<void>) {
  const config = settings || {};
  let logo = '';
  try { logo = await imageFromUrl('/android-chrome-192x192.png'); } catch { /* The wordmark and a plain QR remain available. */ }
  const url = verificationUrl(record.publicToken, config);
  const assets = { logo, url, qr: url ? await verificationQr(url, logo) : '' };
  for (const scale of [1, 0.94, 0.88, 0.82]) {
    const layout = new DocumentLayout(title, assets, config, number, scale);
    try { await render(layout); return layout.finish(title === 'INVOICE'); }
    catch (error) { if (!(error instanceof LayoutOverflow)) throw error; }
  }
  throw new Error('Isi dokumen terlalu panjang untuk satu halaman A4. Ringkas detail item atau catatan, lalu unduh kembali.');
}

export async function buildInvoicePDF(invoice: any, client: any, project: any, settings: any = {}) {
  return fitDocument('INVOICE', invoice, settings, invoice.invoiceNumber, async (layout) => {
    layout.fields([['Invoice no.', invoice.invoiceNumber], ['Issue date', date(invoice.issueDate)], ['Due date', date(invoice.dueDate)]], [90, 46, 46]);
    layout.rule();
    layout.fields([
      ['From', [settings?.businessName || 'Nalaro', settings?.ownerName || 'Muhamad Khoirul Ulum', settings?.address, settings?.email].filter(Boolean).join('\n')],
      ['Bill to', [client?.name || invoice.clientName, client?.picName, client?.address, client?.email].filter(Boolean).join('\n')],
    ], [91, 91]);
    const projectFields: [string, unknown][] = [['Project', project?.name || invoice.projectName]];
    if (project?.projectNumber) projectFields.push(['Project ref.', project.projectNumber]);
    layout.fields(projectFields, projectFields.length === 2 ? [132, 50] : [WIDTH]);
    layout.table({
      head: [['DESCRIPTION', 'QTY', 'UNIT PRICE', 'AMOUNT']],
      body: (invoice.items || []).map((item: any) => [
        [item.description || 'Service', item.details].filter(Boolean).join('\n'), String(item.quantity ?? 1), money(item.unitPrice), money(item.total ?? Number(item.quantity ?? 1) * Number(item.unitPrice || 0)),
      ]),
      styles: { font: 'helvetica', fontSize: layout.font(8.5), textColor: INK, overflow: 'linebreak', cellPadding: 2.5, lineColor: LINE, lineWidth: 0.1 },
      headStyles: { fillColor: PAPER, textColor: MUTED, fontStyle: 'bold', fontSize: 7 },
      columnStyles: { 0: { cellWidth: 86 }, 1: { cellWidth: 16, halign: 'center' }, 2: { cellWidth: 40, halign: 'right' }, 3: { cellWidth: 40, halign: 'right' } },
    });
    const rows = [['Subtotal', money(invoice.subtotal)]];
    if (Number(invoice.discount) > 0) rows.push(['Discount', money(invoice.discount)]);
    rows.push(['VAT', 'Not charged'], ['Total', money(invoice.grandTotal)]);
    if (Number(invoice.paidAmount) > 0) rows.push(['Amount paid', money(invoice.paidAmount)], ['Balance due', money(invoice.outstandingAmount ?? Number(invoice.grandTotal) - Number(invoice.paidAmount))]);
    layout.summary(rows, invoice.notes);
    await layout.paymentAndVerification(invoice, false);
  });
}

export async function buildReceiptPDF(receipt: any, client: any, project: any, settings: any = {}) {
  return fitDocument('PAYMENT RECEIPT', receipt, settings, receipt.receiptNumber, async (layout) => {
    layout.fields([['Receipt no.', receipt.receiptNumber], ['Payment date', date(receipt.paymentDate)]], [120, 62]);
    layout.rule();
    layout.fields([
      ['Received from', [client?.name || receipt.clientName, client?.picName, client?.address].filter(Boolean).join('\n')],
      ['Received by', [settings?.businessName || 'Nalaro', settings?.ownerName || 'Muhamad Khoirul Ulum'].join('\n')],
    ], [110, 72]);
    layout.fields([['Project', project?.name || receipt.projectName]]);
    const references: [string, unknown][] = [];
    if (receipt.relatedInvoice) references.push(['Invoice no.', receipt.relatedInvoice]);
    if (receipt.paymentReference) references.push(['Payment reference', receipt.paymentReference]);
    if (references.length) layout.fields(references, references.length === 2 ? [91, 91] : [WIDTH]);
    layout.table({ head: [['AMOUNT RECEIVED']], body: [[money(receipt.amount)]], headStyles: { fillColor: PAPER, textColor: MUTED, fontSize: 7, cellPadding: 3 }, bodyStyles: { fillColor: PAPER, textColor: FLARE, fontSize: 22, fontStyle: 'bold', cellPadding: 4 } });
    if (receipt.notes) layout.fields([['Notes', receipt.notes]]);
    await layout.paymentAndVerification(receipt, true);
  });
}

export async function generateInvoicePDF(invoice: any, client: any, project: any, settings: any) {
  const doc = await buildInvoicePDF(invoice, client, project, settings);
  await doc.save(safeFileName(invoice.invoiceNumber || 'Nalaro-Invoice') + '.pdf', { returnPromise: true });
}
export async function generateReceiptPDF(receipt: any, client: any, project: any, settings: any) {
  const doc = await buildReceiptPDF(receipt, client, project, settings);
  await doc.save(safeFileName(receipt.receiptNumber || 'Nalaro-Receipt') + '.pdf', { returnPromise: true });
}
