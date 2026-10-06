import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';

const INK: [number, number, number] = [11, 12, 10];
const MUTED: [number, number, number] = [112, 114, 106];
const LINE: [number, number, number] = [220, 220, 214];
const FLARE: [number, number, number] = [255, 91, 46];

function money(value = 0) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function safeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, '-');
}

async function getBase64ImageFromUrl(imageUrl: string): Promise<string> {
  const res = await fetch(imageUrl);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result as string), false);
    reader.addEventListener('error', reject);
    reader.readAsDataURL(blob);
  });
}

function label(doc: jsPDF, text: string, x: number, y: number) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text(text.toUpperCase(), x, y);
}

function value(doc: jsPDF, text: string, x: number, y: number, size = 10) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(size);
  doc.setTextColor(...INK);
  doc.text(text || '—', x, y);
}

export async function generateInvoicePDF(invoice: any, client: any, project: any, settings: any) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const owner = settings?.ownerName || 'Muhamad Khoirul Ulum';
  const website = settings?.website || 'nalaro.web.id';
  const verifyUrl = 'https://e-invoice.nalaro.web.id/verif/' + (invoice.publicToken || '');

  doc.setFillColor(...INK);
  doc.rect(0, 0, 210, 31, 'F');
  try {
    const logo = await getBase64ImageFromUrl('/android-chrome-192x192.png');
    doc.addImage(logo, 'PNG', 14, 8, 14, 14);
  } catch {}
  doc.setTextColor(245, 245, 242);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text('NALARO', 33, 17);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(170, 171, 166);
  doc.text('PROJECT DESK / E-INVOICE', 33, 22);
  doc.setTextColor(...FLARE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.text('INVOICE', 196, 18, { align: 'right' });

  label(doc, 'Invoice number', 14, 43);
  value(doc, invoice.invoiceNumber || '—', 14, 49, 11);
  label(doc, 'Issued', 118, 43);
  value(doc, invoice.issueDate || '—', 118, 49);
  label(doc, 'Due', 160, 43);
  value(doc, invoice.dueDate || '—', 160, 49);
  doc.setDrawColor(...LINE);
  doc.line(14, 56, 196, 56);

  label(doc, 'Issued by', 14, 66);
  value(doc, settings?.businessName || 'Nalaro', 14, 73);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(owner, 14, 78);
  doc.text(website, 14, 83);

  label(doc, 'Billed to', 112, 66);
  value(doc, client?.name || invoice.clientName || '—', 112, 73);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  if (client?.picName) doc.text(client.picName, 112, 78);
  if (client?.address) doc.text(String(client.address).slice(0, 55), 112, 83);

  doc.setDrawColor(...LINE);
  doc.line(14, 91, 196, 91);
  label(doc, 'Project', 14, 101);
  value(doc, project?.name || invoice.projectName || '—', 14, 108, 12);
  if (project?.projectNumber) {
    label(doc, 'Project ID', 146, 101);
    value(doc, project.projectNumber, 146, 108, 8);
  }

  const tableData = (invoice.items || []).map((item: any) => [
    item.description || 'Service',
    String(item.quantity || 1),
    money(item.unitPrice || 0),
    money(item.total || 0),
  ]);

  autoTable(doc, {
    startY: 118,
    head: [['ITEM', 'QTY', 'PRICE', 'TOTAL']],
    body: tableData,
    theme: 'plain',
    margin: { left: 14, right: 14 },
    styles: {
      font: 'helvetica',
      fontSize: 8.5,
      textColor: INK,
      cellPadding: { top: 4, right: 3, bottom: 4, left: 3 },
      lineColor: LINE,
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: [245, 245, 242],
      textColor: MUTED,
      fontStyle: 'bold',
      fontSize: 7,
    },
    columnStyles: {
      0: { cellWidth: 88 },
      1: { halign: 'center', cellWidth: 18 },
      2: { halign: 'right', cellWidth: 37 },
      3: { halign: 'right', cellWidth: 39 },
    },
  });

  const tableEnd = (doc as any).lastAutoTable?.finalY || 135;
  let y = tableEnd + 11;
  const summaryX = 132;
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.setFont('helvetica', 'normal');
  doc.text('Subtotal', summaryX, y);
  doc.text(money(invoice.subtotal), 196, y, { align: 'right' });
  y += 7;
  doc.text('Diskon', summaryX, y);
  doc.text(money(invoice.discount || 0), 196, y, { align: 'right' });
  y += 7;
  doc.text('PPN', summaryX, y);
  doc.text('Tidak dipungut', 196, y, { align: 'right' });
  y += 6;
  doc.setDrawColor(...LINE);
  doc.line(summaryX, y, 196, y);
  y += 8;
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('TOTAL', summaryX, y);
  doc.setTextColor(...FLARE);
  doc.text(money(invoice.grandTotal), 196, y, { align: 'right' });

  const bottomY = Math.max(y + 18, 204);
  doc.setDrawColor(...LINE);
  doc.line(14, bottomY, 196, bottomY);
  label(doc, 'Payment', 14, bottomY + 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...INK);
  const bank = settings?.bankName
    ? settings.bankName + ' · ' + (settings.accountNumber || '')
    : 'Informasi pembayaran disampaikan oleh Nalaro.';
  doc.text(bank, 14, bottomY + 17);
  if (settings?.accountHolder) {
    doc.setTextColor(...MUTED);
    doc.text('a.n. ' + settings.accountHolder, 14, bottomY + 22);
  }

  try {
    const qr = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 280 });
    doc.addImage(qr, 'PNG', 163, bottomY + 9, 30, 30);
    label(doc, 'Verify document', 163, bottomY + 44);
  } catch {}

  doc.setDrawColor(...LINE);
  doc.line(14, 258, 196, 258);
  label(doc, 'Notes', 14, 267);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text('PPN tidak dipungut. Dokumen ini merupakan invoice/tagihan komersial dan bukan Faktur Pajak.', 14, 273);
  doc.text('Scope pekerjaan mengikuti proposal atau kesepakatan proyek yang telah disetujui.', 14, 278);
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.text('ISSUED DIGITALLY BY NALARO', 14, 288);
  doc.setTextColor(...MUTED);
  doc.setFont('helvetica', 'normal');
  doc.text(owner, 196, 288, { align: 'right' });

  doc.save(safeFileName(invoice.invoiceNumber || 'Nalaro-Invoice') + '.pdf');
}

export async function generateReceiptPDF(receipt: any, client: any, project: any, settings: any) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const owner = settings?.ownerName || 'Muhamad Khoirul Ulum';
  const verifyUrl = 'https://e-invoice.nalaro.web.id/verif/' + (receipt.publicToken || '');

  doc.setFillColor(...INK);
  doc.rect(0, 0, 210, 34, 'F');
  try {
    const logo = await getBase64ImageFromUrl('/android-chrome-192x192.png');
    doc.addImage(logo, 'PNG', 14, 9, 14, 14);
  } catch {}

  doc.setTextColor(245, 245, 242);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text('NALARO', 33, 18);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(170, 171, 166);
  doc.text('PAYMENT RECORD / VERIFIED', 33, 23);

  label(doc, 'Payment receipt', 14, 48);
  value(doc, receipt.receiptNumber || '—', 14, 57, 15);
  doc.setDrawColor(...LINE);
  doc.line(14, 65, 196, 65);

  label(doc, 'Received from', 14, 77);
  value(doc, client?.name || receipt.clientName || '—', 14, 85, 11);
  label(doc, 'Related invoice', 112, 77);
  value(doc, receipt.relatedInvoice || '—', 112, 85, 9);
  label(doc, 'Project', 14, 99);
  value(doc, project?.name || receipt.projectName || '—', 14, 107, 10);
  label(doc, 'Payment date', 112, 99);
  value(doc, receipt.paymentDate || '—', 112, 107, 10);
  label(doc, 'Payment method', 14, 121);
  value(doc, receipt.paymentMethod || '—', 14, 129, 10);
  if (receipt.paymentReference) {
    label(doc, 'Reference', 112, 121);
    value(doc, receipt.paymentReference, 112, 129, 9);
  }

  doc.setFillColor(245, 245, 242);
  doc.rect(14, 145, 182, 35, 'F');
  label(doc, 'Amount received', 20, 155);
  doc.setTextColor(...FLARE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(25);
  doc.text(money(receipt.amount), 20, 171);

  try {
    const qr = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 280 });
    doc.addImage(qr, 'PNG', 14, 197, 34, 34);
    label(doc, 'Verify payment', 14, 237);
  } catch {}

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED);
  doc.setFontSize(8);
  doc.text('Scan QR untuk memeriksa receipt ini pada registry publik Nalaro.', 57, 209);
  doc.text('Receipt diterbitkan setelah pembayaran dicatat oleh Nalaro.', 57, 215);

  doc.setDrawColor(...LINE);
  doc.line(14, 260, 196, 260);
  label(doc, 'Issued digitally by', 14, 270);
  value(doc, 'Nalaro — ' + owner, 14, 278, 9);
  doc.setTextColor(...MUTED);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('This receipt confirms payment recorded by Nalaro.', 14, 287);

  doc.save(safeFileName(receipt.receiptNumber || 'Nalaro-Receipt') + '.pdf');
}
