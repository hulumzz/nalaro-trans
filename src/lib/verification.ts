const LEGACY_BASE = 'https://e-invoice.nalaro.web.id/verif/';

/** A blank URL follows the current deployment, including Pages preview domains. */
export function verificationBaseUrl(settings: any = {}, origin = typeof window !== 'undefined' ? window.location.origin : '') {
  const configured = String(settings?.verificationBaseUrl || '').trim();
  const environment = String(import.meta.env.PUBLIC_VERIFICATION_BASE_URL || '').trim();
  // Migrate the old seeded setting when the app is hosted on another domain.
  const inheritedLegacy = configured === LEGACY_BASE && origin && new URL(origin).hostname !== 'e-invoice.nalaro.web.id';
  const base = (!inheritedLegacy && configured) || environment || (origin ? `${origin}/verif/` : '');
  if (!base) throw new Error('Alamat verifikasi belum tersedia. Isi URL verifikasi di Pengaturan.');
  let url: URL;
  try { url = new URL(base); } catch { throw new Error('URL verifikasi harus berupa alamat lengkap https://…/verif/.'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Gunakan URL HTTP/HTTPS tanpa kredensial, query, atau fragment untuk verifikasi.');
  }
  url.pathname = url.pathname.replace(/\/+$/, '') + '/';
  return url.href;
}

export function verificationUrl(token: unknown, settings: any = {}, origin?: string) {
  const value = String(token || '').trim();
  if (!value) return '';
  return verificationBaseUrl(settings, origin) + encodeURIComponent(value);
}

export function verificationToken(location: Pick<Location, 'pathname' | 'search'>) {
  // The query form also works on static hosts without path rewrites.
  const query = new URLSearchParams(location.search).get('token');
  if (query) return query;
  const parts = location.pathname.split('/').filter(Boolean);
  if (parts[0] !== 'verif' || !parts[1]) return '';
  try { return decodeURIComponent(parts[1]); } catch { return ''; }
}
