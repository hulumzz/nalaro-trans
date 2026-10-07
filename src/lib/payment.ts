export const PAYMENT_METHODS = ['Bank Transfer', 'QRIS', 'Cash', 'E-Wallet', 'Other'] as const;

export function paymentInformation(method: unknown, settings: any = {}) {
  const name = String(method || 'Bank Transfer');
  const normalized = name.trim().toLowerCase();
  if (normalized === 'cash' || normalized === 'tunai') return { method: name, kind: 'cash', lines: [] as string[], qrisImage: '' };
  if (normalized === 'qris') return {
    method: name, kind: 'qris',
    lines: [settings.qrisMerchantName || settings.businessName || 'Nalaro', ...(!settings.qrisImage ? ['Payment QR available on request.'] : [])],
    qrisImage: String(settings.qrisImage || ''),
  };
  if (normalized === 'bank transfer' || normalized === 'transfer') return {
    method: name, kind: 'bank',
    lines: settings.bankName && settings.accountNumber
      ? [String(settings.bankName), 'Account no.: ' + settings.accountNumber, ...(settings.accountHolder ? ['Account name: ' + settings.accountHolder] : [])]
      : ['Bank details available on request.'],
    qrisImage: '',
  };
  if (normalized === 'e-wallet') return {
    method: name, kind: 'wallet',
    lines: settings.walletName && settings.walletNumber
      ? [String(settings.walletName), 'Account no.: ' + settings.walletNumber, ...(settings.walletHolder ? ['Account name: ' + settings.walletHolder] : [])]
      : ['E-wallet details available on request.'],
    qrisImage: '',
  };
  return { method: name, kind: 'other', lines: [settings.otherPaymentInfo || 'Payment details as agreed.'], qrisImage: '' };
}

const legacyDescriptions: Record<string, string> = {
  'Hubungi Nalaro untuk kode QRIS pembayaran.': 'Payment QR available on request.',
  'Hubungi Nalaro untuk informasi rekening pembayaran.': 'Bank details available on request.',
  'Hubungi Nalaro untuk informasi e-wallet pembayaran.': 'E-wallet details available on request.',
  'Informasi pembayaran mengikuti kesepakatan dengan Nalaro.': 'Payment details as agreed.',
};

export function documentPaymentInformation(document: any, settings: any) {
  // Preserve issued destinations; translate only generated labels from older snapshots.
  const details = document.paymentDetails || paymentInformation(document.paymentMethod, settings);
  return {
    ...details,
    lines: (details.lines || []).map(String)
      .filter((line: string) => line !== 'QRIS statis. Masukkan nominal sesuai tagihan.')
      .map((line: string) => legacyDescriptions[line] || line.replace(/^No\. rekening:\s*/, 'Account no.: ').replace(/^Nomor:\s*/, 'Account no.: ').replace(/^a\.n\.\s*/, 'Account name: ')),
  };
}
