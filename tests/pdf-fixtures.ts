import { buildInvoicePDF, buildReceiptPDF, generateInvoicePDF, generateReceiptPDF, verificationQr } from '../src/lib/pdf';
import { verificationBaseUrl, verificationToken, verificationUrl } from '../src/lib/verification';
import { paymentInformation, documentPaymentInformation } from '../src/lib/payment';
import jsQR from 'jsqr';
import QRCode from 'qrcode';

const token = '12345678901234567890';
const client = { name: 'Pemerintah Desa Contoh', picName: 'Bapak Petugas Administrasi', address: 'Jalan Raya Contoh No. 10, Kecamatan Contoh, Kabupaten Pekalongan' };
const project = { name: 'Pembuatan Website Desa dan Layanan Administrasi Digital', projectNumber: 'NAL/PRJ/2026/123456' };
const settings = { businessName: 'Nalaro', ownerName: 'Muhamad Khoirul Ulum', website: 'nalaro.web.id', bankName: 'BANK CONTOH', accountNumber: '000123456789', accountHolder: 'Penerima Contoh', qrisMerchantName: 'NALARO DEMO', walletName: 'Wallet Contoh', walletNumber: '081234567890', walletHolder: 'Penerima Contoh' };
const invoice = { invoiceNumber: 'NAL/INV/2026/TEST', publicToken: token, issueDate: '2026-10-06', dueDate: '2026-10-20', items: [{ description: 'Website Development', details: 'Desain dan implementasi website desa.', quantity: 1, unitPrice: 2500000, total: 2500000 }], subtotal: 2500000, grandTotal: 2500000, paymentMethod: 'Bank Transfer' };
const receipt = { receiptNumber: 'NAL/RCPT/2026/TEST', relatedInvoice: invoice.invoiceNumber, publicToken: token, paymentDate: '2026-10-06', amount: 2500000, paymentMethod: 'Bank Transfer', paymentReference: 'REF-123456' };

const api = {
  invoice, receipt, client, project, settings,
  async pdf(kind: 'invoice' | 'receipt', method = 'Bank Transfer', long: boolean | 'combined' | 'oversized' = false) {
    const config = { ...settings, qrisImage: await QRCode.toDataURL('DEMO PAYMENT - NOT A REAL QRIS', { margin: 4, width: 400 }) };
    const record: any = { ...(kind === 'invoice' ? invoice : receipt), paymentMethod: method };
    const expanded = long === true;
    const customer = expanded ? { ...client, name: client.name.repeat(2), address: client.address.repeat(3) } : client;
    const job = expanded ? { ...project, name: project.name.repeat(2) } : project;
    if (expanded) {
      record.notes = 'Reviewed and approved. ' + 'Deliverables follow the agreed project scope. '.repeat(4) + 'END OF NOTES';
      record.paymentReference = 'BANK-REFERENCE-1234567890';
      if (kind === 'invoice') {
        record.items = Array.from({ length: 6 }, (_, index) => ({ description: 'Service ' + (index + 1), details: 'Configuration and delivery of the agreed service. END ITEM ' + index, quantity: 1, unitPrice: 100000, total: 100000 }));
        record.subtotal = record.grandTotal = 600000;
      }
    }
    if (long === 'combined') {
      // Full portrait payment artwork plus account information from an issued snapshot.
      const qr = new Image(); qr.src = config.qrisImage; await qr.decode();
      const artwork = document.createElement('canvas'); artwork.width = 500; artwork.height = 740;
      const context = artwork.getContext('2d')!; context.fillStyle = '#fff'; context.fillRect(0, 0, 500, 740);
      context.fillStyle = '#20211e'; context.font = 'bold 28px sans-serif'; context.fillText('QRIS PAYMENT', 40, 60);
      context.drawImage(qr, 40, 110, 420, 420); context.font = '20px sans-serif'; context.fillText('NALARO DEMO', 40, 600);
      record.paymentDetails = { method: 'Bank Transfer / QRIS', kind: 'bank', lines: ['BANK CONTOH', 'No. rekening: 000123456789', 'a.n. Penerima Contoh', 'Payment reference: ' + invoice.invoiceNumber], qrisImage: artwork.toDataURL() };
      record.notes = 'Please use the invoice number as your payment reference. END OF NOTES';
    }
    if (long === 'oversized') {
      record.notes = 'Complete project conditions and acceptance requirements. '.repeat(1000) + 'END OF NOTES';
    }
    const doc = await (kind === 'invoice' ? buildInvoicePDF : buildReceiptPDF)(record, customer, job, config);
    return { pages: doc.getNumberOfPages(), pdf: doc.output('datauristring') };
  },
  async checks() {
    const origin = window.location.origin;
    const expected = origin + '/verif/' + token;
    const actual = verificationUrl(token, { verificationBaseUrl: 'https://e-invoice.nalaro.web.id/verif/' });
    if (actual !== expected) throw new Error('Legacy URL migration failed');
    if (verificationBaseUrl({ verificationBaseUrl: 'https://registry.example/verif' }) !== 'https://registry.example/verif/') throw new Error('Explicit base URL failed');
    if (verificationToken({ pathname: '/verif/' + token + '/', search: '' }) !== token) throw new Error('Path token failed');
    if (verificationToken({ pathname: '/verif/', search: '?token=' + token }) !== token) throw new Error('Query token failed');
    if (verificationUrl('') !== '') throw new Error('Missing token creates a misleading QR');
    for (const invalid of ['javascript:alert(1)', 'https://user:password@example.com/verif/', 'https://example.com/verif/?token=bad']) {
      let failed = false; try { verificationBaseUrl({ verificationBaseUrl: invalid }); } catch { failed = true; }
      if (!failed) throw new Error('Invalid verification URL accepted');
    }
    if (paymentInformation('Cash', settings).lines.length || paymentInformation('Cash', settings).qrisImage) throw new Error('Cash contains payment destination');
    const migrated = documentPaymentInformation({ paymentDetails: { kind: 'bank', lines: ['No. rekening: 000123456789', 'a.n. Penerima Contoh'] } }, {});
    if (migrated.lines.join('|') !== 'Account no.: 000123456789|Account name: Penerima Contoh') throw new Error('Legacy payment labels were not translated');
    const snapshot = paymentInformation('Bank Transfer', settings);
    if (documentPaymentInformation({ paymentDetails: snapshot }, { bankName: 'CHANGED' }).lines[0] !== 'BANK CONTOH') throw new Error('Issued payment destination changed');
    const logo = await new Promise<string>((resolve) => { const img = new Image(); img.onload = () => { const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height; canvas.getContext('2d')!.drawImage(img, 0, 0); resolve(canvas.toDataURL()); }; img.src = '/android-chrome-192x192.png'; });
    for (const size of [600, 300, 160]) {
      const image = new Image(); image.src = await verificationQr(expected, logo); await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
      const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0, size, size);
      const pixels = context.getImageData(0, 0, size, size);
      if (jsQR(pixels.data, size, size)?.data !== expected) throw new Error('Logo QR cannot be decoded at ' + size + 'px');
    }
    return { expected, qrSizes: [600, 300, 160] };
  },
};
(window as any).testAPI = api;
for (const [id, fn, data] of [['invoice', generateInvoicePDF, invoice], ['receipt', generateReceiptPDF, receipt]] as const) {
  document.getElementById(id)!.onclick = async () => {
    try { await fn(data, client, project, settings); document.getElementById('result')!.textContent = 'OK'; }
    catch (error) { document.getElementById('result')!.textContent = String(error); }
  };
}
