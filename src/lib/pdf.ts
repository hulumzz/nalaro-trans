import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';

async function getBase64ImageFromUrl(imageUrl: string): Promise<string> {
  const res = await fetch(imageUrl);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result as string), false);
    reader.addEventListener("error", (err) => reject(err));
    reader.readAsDataURL(blob);
  });
}

export async function generateInvoicePDF(invoice: any, client: any, project: any, settings: any) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  try {
    const logoData = await getBase64ImageFromUrl('/android-chrome-192x192.png');
    doc.addImage(logoData, 'PNG', 14, 15, 12, 12);
  } catch (e) {
    console.warn("Failed to load logo", e);
  }

  // Setup basic layout
  doc.setFontSize(20);
  doc.text('INVOICE', 30, 23);
  
  doc.setFontSize(10);
  doc.text(`No: ${invoice.invoiceNumber}`, 14, 40);
  doc.text(`Tanggal: ${invoice.issueDate}`, 14, 45);
  doc.text(`Jatuh Tempo: ${invoice.dueDate}`, 14, 50);

  doc.text('Diterbitkan Oleh:', 14, 65);
  doc.setFont('helvetica', 'bold');
  doc.text('Nalaro', 14, 70);
  doc.setFont('helvetica', 'normal');
  doc.text('Muhamad Khoirul Ulum', 14, 75);

  doc.text('Ditagihkan Kepada:', 120, 65);
  doc.setFont('helvetica', 'bold');
  doc.text(client.name || '', 120, 70);
  doc.setFont('helvetica', 'normal');
  doc.text(client.picName || '', 120, 75);

  const tableData = (invoice.items || []).map((item: any) => [
    item.description,
    item.quantity,
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(item.unitPrice),
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(item.total)
  ]);

  autoTable(doc, {
    startY: 90,
    head: [['Item', 'Qty', 'Harga', 'Total']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [234, 88, 12] } // orange-600
  });

  const finalY = (doc as any).lastAutoTable.finalY || 100;

  doc.text(`Subtotal: ${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(invoice.subtotal)}`, 140, finalY + 10);
  doc.text(`Total: ${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(invoice.grandTotal)}`, 140, finalY + 15);

  // QR Code
  try {
    const qrUrl = `https://e-invoice.nalaro.web.id/verif/${invoice.publicToken || 'demo-token'}`;
    const qrDataUrl = await QRCode.toDataURL(qrUrl, { margin: 1 });
    doc.addImage(qrDataUrl, 'PNG', 14, finalY + 25, 25, 25);
    doc.setFontSize(8);
    doc.text('Verify this document', 14, finalY + 55);
  } catch(e) {
    console.warn("Failed to generate QR", e);
  }

  doc.setFontSize(10);
  doc.text('Catatan: PPN tidak dipungut.', 14, finalY + 65);
  doc.text('Dokumen ini merupakan invoice komersial dan bukan Faktur Pajak.', 14, finalY + 70);

  doc.save(`Invoice_${invoice.invoiceNumber}.pdf`);
}

export async function generateReceiptPDF(receipt: any, client: any, project: any, settings: any) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  try {
    const logoData = await getBase64ImageFromUrl('/android-chrome-192x192.png');
    doc.addImage(logoData, 'PNG', 14, 15, 12, 12);
  } catch (e) {
    console.warn("Failed to load logo", e);
  }

  doc.setFontSize(20);
  doc.text('PAYMENT RECEIPT', 30, 23);
  
  doc.setFontSize(10);
  doc.text(`No: ${receipt.receiptNumber}`, 14, 40);
  doc.text(`Tanggal: ${receipt.paymentDate}`, 14, 45);
  doc.text(`Related Invoice: ${receipt.relatedInvoice}`, 14, 50);

  doc.text('Diterima Dari:', 14, 65);
  doc.setFont('helvetica', 'bold');
  doc.text(client.name || '', 14, 70);
  doc.setFont('helvetica', 'normal');

  doc.text('Jumlah:', 14, 90);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(receipt.amount), 14, 98);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Metode Pembayaran: ${receipt.paymentMethod || '-'}`, 14, 110);
  
  // QR Code
  try {
    const qrUrl = `https://e-invoice.nalaro.web.id/verif/${receipt.publicToken || 'demo-token'}`;
    const qrDataUrl = await QRCode.toDataURL(qrUrl, { margin: 1 });
    doc.addImage(qrDataUrl, 'PNG', 120, 90, 30, 30);
    doc.setFontSize(8);
    doc.text('Payment verified', 120, 125);
  } catch(e) {
    console.warn("Failed to generate QR", e);
  }

  doc.setFontSize(10);
  doc.text('ISSUED DIGITALLY BY', 14, 140);
  doc.setFont('helvetica', 'bold');
  doc.text('Nalaro - Muhamad Khoirul Ulum', 14, 145);

  doc.save(`Receipt_${receipt.receiptNumber}.pdf`);
}
