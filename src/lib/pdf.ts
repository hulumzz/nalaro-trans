import { jsPDF } from 'jspdf';
// Use the package's ESM entry: the 3.x CommonJS default becomes an object in production.
import autoTable, { type UserOptions } from 'jspdf-autotable/es';
import QRCode from 'qrcode';
import { documentPaymentInformation } from './payment';
import { verificationUrl } from './verification';

const INK: [number, number, number] = [32, 33, 30];
const MUTED: [number, number, number] = [112, 114, 106];
const LINE: [number, number, number] = [220, 220, 214];
const PAPER: [number, number, number] = [242, 242, 239];
const FLARE: [number, number, number] = [255, 91, 46];
const LEFT = 14, RIGHT = 196, WIDTH = 182, TOP = 40, BOTTOM = 276;
const money = (value: unknown = 0) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value) || 0);
const text = (value: unknown) => String(value ?? '').trim() || '—';
const safeFileName = (value: string) => value.replace(/[\\/:*?"<>|\x00-\x1F]/g, '-');

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

class DocumentLayout {
  doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  y = TOP;
  headers = new Set<number>();
  constructor(private title: string, private logo: string, private settings: any, private documentNumber: string) {
    this.doc.setProperties({ title: `${title} ${documentNumber}`, author: settings?.businessName || 'Nalaro' });
    this.header();
  }
  header = () => {
    const page = this.doc.getCurrentPageInfo().pageNumber;
    if (this.headers.has(page)) return;
    this.headers.add(page);
    const doc = this.doc;
    doc.setFillColor(...PAPER);
    doc.rect(0, 0, 210, 32, 'F');
    if (this.logo) {
      doc.setFillColor(...INK); doc.roundedRect(LEFT, 7, 16, 16, 2, 2, 'F');
      doc.addImage(this.logo, 'PNG', LEFT + 1.5, 8.5, 13, 13);
    }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.setTextColor(...INK);
    doc.text('NALARO', this.logo ? 34 : LEFT, 17);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...MUTED);
    doc.text('PROJECT DESK / DIGITAL DOCUMENT', this.logo ? 34 : LEFT, 23);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(19); doc.setTextColor(...FLARE);
    doc.text(this.title, RIGHT, 19, { align: 'right' });
  };
  ensure(height: number) {
    if (this.y + height > BOTTOM) { this.doc.addPage(); this.header(); this.y = TOP; }
  }
  table(options: UserOptions) {
    this.ensure(15);
    autoTable(this.doc, {
      startY: this.y,
      theme: 'plain',
      margin: { top: TOP, bottom: 24, left: LEFT, right: LEFT },
      styles: { font: 'helvetica', fontSize: 9, textColor: INK, overflow: 'linebreak', cellPadding: { top: 2, right: 3, bottom: 2, left: 0 }, lineColor: LINE },
      headStyles: { fontSize: 7, fontStyle: 'normal', textColor: MUTED, fillColor: [255, 255, 255], cellPadding: { top: 1, right: 3, bottom: 1, left: 0 } },
      rowPageBreak: 'avoid',
      ...options,
      willDrawPage: () => this.header(),
    });
    this.y = (this.doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 3;
  }
  fields(fields: [string, unknown][], widths?: number[]) {
    this.table({
      head: [fields.map(([label]) => label.toUpperCase())],
      body: [fields.map(([, value]) => text(value))],
      bodyStyles: { fontStyle: 'bold' },
      columnStyles: widths ? Object.fromEntries(widths.map((width, index) => [index, { cellWidth: width }])) : {},
    });
  }
  paragraph(content: unknown, size = 8, color = MUTED) {
    this.doc.setFont('helvetica', 'normal'); this.doc.setFontSize(size);
    const lines: string[] = this.doc.splitTextToSize(text(content), WIDTH);
    const height = size * 0.3528 * 1.45;
    for (const line of lines) {
      this.ensure(height + 2);
      // ensure() may draw a page header, so restore the paragraph style each time.
      this.doc.setFont('helvetica', 'normal'); this.doc.setFontSize(size); this.doc.setTextColor(...color);
      this.doc.text(line, LEFT, this.y + height);
      this.y += height;
    }
    this.y += 3;
  }
  rule() {
    this.ensure(8); this.doc.setDrawColor(...LINE); this.doc.line(LEFT, this.y, RIGHT, this.y); this.y += 4;
  }
  payment(document: any) {
    const payment = documentPaymentInformation(document, this.settings);
    // Cash has no bank, wallet or QRIS payment information.
    if (payment.kind === 'cash') return;
    this.rule();
    this.fields([['Informasi pembayaran', payment.method]]);
    this.paragraph((payment.lines || []).join('\n'), 9, INK);
    if (payment.qrisImage) {
      try {
        const properties = this.doc.getImageProperties(payment.qrisImage);
        const scale = Math.min(50 / properties.width, 60 / properties.height);
        const width = properties.width * scale, height = properties.height * scale;
        const reserved = Math.max(height, 54);
        this.ensure(reserved + 12);
        const placement = { page: this.doc.getCurrentPageInfo().pageNumber, y: this.y };
        this.doc.addImage(payment.qrisImage, properties.fileType, LEFT, this.y, width, height);
        this.y += reserved + 3;
        this.paragraph('QRIS PEMBAYARAN • Masukkan nominal sesuai tagihan.', 7);
        return placement;
      } catch { throw new Error('Gambar QRIS tidak valid. Unggah ulang PNG/JPG di Pengaturan.'); }
    }
  }
  async verification(token: unknown, paired?: { page: number; y: number }) {
    const url = verificationUrl(token, this.settings);
    if (!url) {
      this.paragraph('Dokumen belum memiliki token verifikasi.');
      return;
    }
    const qr = await verificationQr(url, this.logo);
    if (paired) {
      const lastPage = this.doc.getCurrentPageInfo().pageNumber;
      this.doc.setPage(paired.page);
      const x = 111, y = paired.y;
      this.doc.setFont('helvetica', 'bold'); this.doc.setFontSize(8); this.doc.setTextColor(...INK);
      this.doc.text('VERIFIKASI DOKUMEN', x, y + 5);
      this.doc.addImage(qr, 'PNG', x, y + 10, 34, 34);
      this.doc.link(x, y + 10, 34, 34, { url });
      this.doc.setFont('helvetica', 'normal'); this.doc.setFontSize(7); this.doc.setTextColor(...MUTED);
      this.doc.text(this.doc.splitTextToSize('Scan untuk memeriksa dokumen di registry Nalaro.', 46), 150, y + 18);
      const hostLines = this.doc.splitTextToSize(new URL(url).host, 85);
      this.doc.text(hostLines, x, y + 51);
      this.doc.link(x, y + 47, 85, Math.max(5, hostLines.length * 3), { url });
      this.doc.setPage(lastPage);
      return;
    }
    this.ensure(49);
    this.rule();
    const y = this.y;
    this.doc.addImage(qr, 'PNG', LEFT, y, 36, 36);
    this.doc.setFont('helvetica', 'bold'); this.doc.setFontSize(9); this.doc.setTextColor(...INK);
    this.doc.text('VERIFIKASI DOKUMEN', 57, y + 8);
    this.doc.setFont('helvetica', 'normal'); this.doc.setFontSize(8); this.doc.setTextColor(...MUTED);
    this.doc.text(this.doc.splitTextToSize('Scan QR untuk memeriksa dokumen ini pada registry publik Nalaro.', 135), 57, y + 15);
    const host = new URL(url).host;
    this.doc.setTextColor(...INK); this.doc.setFontSize(7);
    const hostLines = this.doc.splitTextToSize(host, 135);
    this.doc.text(hostLines, 57, y + 27);
    this.doc.link(57, y + 23, 135, Math.max(6, hostLines.length * 3), { url });
    this.doc.link(LEFT, y, 36, 36, { url });
    this.y = y + Math.max(40, 27 + hostLines.length * 3);
  }
  finish() {
    const count = this.doc.getNumberOfPages();
    for (let page = 1; page <= count; page++) {
      this.doc.setPage(page); this.header();
      this.doc.setDrawColor(...LINE); this.doc.line(LEFT, 282, RIGHT, 282);
      this.doc.setFont('helvetica', 'normal'); this.doc.setFontSize(7); this.doc.setTextColor(...MUTED);
      this.doc.text('ISSUED DIGITALLY BY NALARO', LEFT, 288);
      this.doc.text(`${page} / ${count}`, RIGHT, 288, { align: 'right' });
    }
    return this.doc;
  }
}

async function createLayout(title: string, settings: any, number: string) {
  let logo = '';
  try { logo = await imageFromUrl('/android-chrome-192x192.png'); } catch { /* Wordmark and plain verification QR are still available. */ }
  return new DocumentLayout(title, logo, settings || {}, number);
}

export async function buildInvoicePDF(invoice: any, client: any, project: any, settings: any = {}) {
  const layout = await createLayout('INVOICE', settings, invoice.invoiceNumber);
  layout.fields([['Nomor invoice', invoice.invoiceNumber], ['Tanggal terbit', invoice.issueDate], ['Jatuh tempo', invoice.dueDate]], [90, 46, 46]);
  layout.rule();
  layout.fields([
    ['Diterbitkan oleh', [settings?.businessName || 'Nalaro', settings?.ownerName || 'Muhamad Khoirul Ulum', settings?.website || 'nalaro.web.id', settings?.address, settings?.email].filter(Boolean).join('\n')],
    ['Ditagihkan kepada', [client?.name || invoice.clientName, client?.picName, client?.address, client?.email].filter(Boolean).join('\n')],
  ], [91, 91]);
  layout.fields([['Proyek', project?.name || invoice.projectName], ['ID proyek', project?.projectNumber]], [132, 50]);
  layout.table({
    head: [['ITEM / DESKRIPSI', 'QTY', 'HARGA', 'TOTAL']],
    body: (invoice.items || []).map((item: any) => [
      [item.description || 'Service', item.details].filter(Boolean).join('\n'),
      String(item.quantity ?? 1), money(item.unitPrice), money(item.total ?? Number(item.quantity ?? 1) * Number(item.unitPrice || 0)),
    ]),
    styles: { font: 'helvetica', fontSize: 8.5, textColor: INK, overflow: 'linebreak', cellPadding: 4, lineColor: LINE, lineWidth: 0.1 },
    headStyles: { fillColor: PAPER, textColor: MUTED, fontStyle: 'bold', fontSize: 7 },
    columnStyles: { 0: { cellWidth: 86 }, 1: { cellWidth: 16, halign: 'center' }, 2: { cellWidth: 40, halign: 'right' }, 3: { cellWidth: 40, halign: 'right' } },
  });
  layout.ensure(33);
  layout.table({
    styles: { font: 'helvetica', fontSize: 8, textColor: INK, overflow: 'linebreak', cellPadding: { top: 1.5, bottom: 1.5, left: 3, right: 3 } },
    tableWidth: 91, margin: { top: TOP, bottom: 24, left: 105, right: LEFT },
    body: [
      ['Subtotal', money(invoice.subtotal)], ['Diskon', money(invoice.discount)], ['PPN', 'Tidak dipungut'],
      ['TOTAL', money(invoice.grandTotal)],
      ...(Number(invoice.paidAmount) > 0 ? [['Sudah dibayar', money(invoice.paidAmount)], ['Sisa tagihan', money(invoice.outstandingAmount ?? Number(invoice.grandTotal) - Number(invoice.paidAmount))]] : []),
    ],
    columnStyles: { 0: { cellWidth: 39 }, 1: { cellWidth: 52, halign: 'right' } },
    didParseCell: (data) => { if (data.row.index === 3) { data.cell.styles.fontStyle = 'bold'; data.cell.styles.fontSize = 11; data.cell.styles.fillColor = PAPER; data.cell.styles.textColor = FLARE; } },
  });
  const paymentQr = layout.payment(invoice);
  layout.rule();
  if (invoice.notes) { layout.fields([['Catatan', invoice.notes]]); }
  layout.paragraph('PPN tidak dipungut. Dokumen ini merupakan invoice/tagihan komersial dan bukan Faktur Pajak.');
  layout.paragraph('Scope pekerjaan mengikuti proposal atau kesepakatan proyek yang telah disetujui.');
  await layout.verification(invoice.publicToken, paymentQr);
  return layout.finish();
}

export async function buildReceiptPDF(receipt: any, client: any, project: any, settings: any = {}) {
  const layout = await createLayout('RECEIPT', settings, receipt.receiptNumber);
  layout.fields([['Nomor receipt', receipt.receiptNumber], ['Tanggal pembayaran', receipt.paymentDate]], [120, 62]);
  layout.rule();
  layout.fields([['Diterima dari', [client?.name || receipt.clientName, client?.picName, client?.address].filter(Boolean).join('\n')], ['Invoice terkait', receipt.relatedInvoice]], [110, 72]);
  layout.fields([['Proyek', project?.name || receipt.projectName]]);
  layout.fields([['Metode pembayaran', receipt.paymentMethod], ['Referensi', receipt.paymentReference]], [91, 91]);
  layout.table({
    head: [['JUMLAH DITERIMA']], body: [[money(receipt.amount)]],
    headStyles: { fillColor: PAPER, textColor: MUTED, fontSize: 7, cellPadding: 5 },
    bodyStyles: { fillColor: PAPER, textColor: FLARE, fontSize: 23, fontStyle: 'bold', cellPadding: 5 },
  });
  const paymentQr = layout.payment(receipt);
  if (receipt.notes) layout.fields([['Catatan', receipt.notes]]);
  layout.rule();
  layout.paragraph('Receipt ini merupakan bukti pembayaran yang telah dicatat oleh Nalaro.');
  layout.fields([['Diterbitkan oleh', (settings?.businessName || 'Nalaro') + ' • ' + (settings?.ownerName || 'Muhamad Khoirul Ulum')]]);
  await layout.verification(receipt.publicToken, paymentQr);
  return layout.finish();
}

export async function generateInvoicePDF(invoice: any, client: any, project: any, settings: any) {
  const doc = await buildInvoicePDF(invoice, client, project, settings);
  await doc.save(safeFileName(invoice.invoiceNumber || 'Nalaro-Invoice') + '.pdf', { returnPromise: true });
}
export async function generateReceiptPDF(receipt: any, client: any, project: any, settings: any) {
  const doc = await buildReceiptPDF(receipt, client, project, settings);
  await doc.save(safeFileName(receipt.receiptNumber || 'Nalaro-Receipt') + '.pdf', { returnPromise: true });
}
