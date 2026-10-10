import React, { useEffect, useMemo, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { EMAIL_ASSET_ORIGIN, isBrandedMailbox, renderOutgoingEmail } from '../../lib/email-template';
import { MAILBOX_CONFIGURED, mailboxService, outgoingFile, downloadMailFile, type MailboxService, type MailConfig, type MailDraft, type MailFolder, type MailMessage, type MailSummary } from '../../lib/mailbox';
import '../../styles/mailbox.css';

type MailView = MailFolder | 'all';
const folders: [MailView, string, string][] = [['all', 'Semua inbox', '✉'], ['inbox', 'Inbox', '↓'], ['starred', 'Starred', '☆'], ['sent', 'Sent', '↗'], ['drafts', 'Drafts', '≡'], ['trash', 'Trash', '×']];
const blank = (): MailDraft => ({ to: [], subject: '', text: '', attachments: [] });
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Permintaan gagal. Coba lagi.';
const dateText = (date: string) => new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(date));
const statusText = (status: string) => ({ accepted: 'Diterima Resend', sending: 'Diproses', uncertain: 'Perlu diperiksa', failed: 'Gagal dikirim', received: 'Email masuk', draft: 'Draft' }[status] || status);
const bytesText = (size: number) => size >= 1048576 ? (size / 1048576).toFixed(1) + ' MB' : Math.ceil(size / 1024) + ' KB';
const mailboxAvatarTone = (address: string) => {
  const value = address.trim().toLowerCase();
  if (value === 'khoirululum@nalaro.digital') return null;
  if (!value.endsWith('@nalaro.digital')) return null;
  return value === 'hello@nalaro.digital' ? 'orange' : 'white';
};
function MailboxAvatar({ address, size = 'md' }: { address: string; size?: 'sm' | 'md' | 'lg' }) {
  const tone = mailboxAvatarTone(address);
  if (!tone) return null;
  return <span className={`mailbox-avatar is-${tone} is-${size}`} aria-hidden="true"><span /></span>;
}

DOMPurify.addHook('uponSanitizeAttribute', (_node, attribute) => {
  if (['src', 'srcset', 'poster', 'background'].includes(attribute.attrName)) {
    attribute.keepAttr = attribute.attrName === 'src' && /^data:image\/(png|jpeg|gif|webp);base64,/i.test(attribute.attrValue);
  }
  if (attribute.attrName === 'style' && /url\s*\(|@import/i.test(attribute.attrValue)) attribute.keepAttr = false;
});


function safeExternalUrl(value: string) {
  const target = value.trim();
  if (!/^(https?:\/\/|mailto:|tel:)/i.test(target)) return null;
  try {
    const url = new URL(target);
    return ['https:', 'http:', 'mailto:', 'tel:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}
function sanitizedEmail(html: string) {
  // Inline and embedded CSS keep verification/OTP emails readable, while CSP
  // disallows scripts, remote styles, fonts, images, trackers and forms.
  const cleaned = DOMPurify.sanitize(html, { USE_PROFILES: { html: true }, FORBID_TAGS: ['form', 'input', 'button', 'iframe', 'object', 'embed', 'meta', 'link', 'base'] });
  const template = document.createElement('template');
  template.innerHTML = cleaned;
  const links: { href: string; label: string }[] = [];
  template.content.querySelectorAll('a').forEach((anchor) => {
    const href = safeExternalUrl(anchor.getAttribute('href') || '');
    if (!href) { anchor.removeAttribute('href'); anchor.removeAttribute('target'); return; }
    anchor.setAttribute('href', href);
    anchor.setAttribute('target', '_blank');
    anchor.setAttribute('rel', 'noopener noreferrer nofollow');
    if (!links.some((link) => link.href === href)) {
      const label = anchor.textContent?.replace(/\s+/g, ' ').trim().slice(0, 90);
      links.push({ href, label: label || (href.startsWith('http') ? new URL(href).hostname : href) });
    }
  });
  const csp = "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'";
  const documentHtml = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="' + csp + '"><base target="_blank"><style>html{color-scheme:light}body{font:14px/1.65 Arial,sans-serif;margin:0;padding:24px;color:#242424;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%!important}pre{white-space:pre-wrap}a{cursor:pointer}</style></head><body>' + template.innerHTML + '</body></html>';
  return { documentHtml, links };
}
function linkedPlainText(value: string) {
  return value.split(/(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi).map((part, index) => {
    if (!/^(https?:\/\/|www\.)/i.test(part)) return part;
    const trailing = part.match(/[),.;!?]+$/)?.[0] || '';
    const label = trailing ? part.slice(0, -trailing.length) : part;
    const href = safeExternalUrl(/^www\./i.test(label) ? 'https://' + label : label);
    return href ? <React.Fragment key={index}><a href={href} target="_blank" rel="noopener noreferrer">{label}</a>{trailing}</React.Fragment> : part;
  });
}
async function combinedInbox(service: MailboxService, mailboxes: string[], search: string, cursor?: string) {
  const states: Record<string, string | null> = cursor
    ? JSON.parse(cursor) as Record<string, string | null>
    : Object.fromEntries(mailboxes.map((address) => [address, '']));
  const pending = mailboxes.filter((address) => states[address] !== null);
  const pages = await Promise.all(pending.map(async (address) => ({
    address, ...(await service.list(address, 'inbox', search, states[address] || undefined)),
  })));
  pages.forEach((page) => { states[page.address] = page.cursor; });
  return {
    items: pages.flatMap((page) => page.items).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    cursor: mailboxes.some((address) => states[address] !== null) ? JSON.stringify(states) : null,
  };
}


export default function Mailbox({ service = mailboxService, configured = MAILBOX_CONFIGURED }: { service?: MailboxService; configured?: boolean }) {
  const [config, setConfig] = useState<MailConfig>();
  const [preview, setPreview] = useState(false);
  const [mailbox, setMailbox] = useState('');
  const [folder, setFolder] = useState<MailView>('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<MailSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [configLoading, setConfigLoading] = useState(configured);
  const [selected, setSelected] = useState<MailMessage>();
  const [reading, setReading] = useState(false);
  const [html, setHtml] = useState(false);
  const [compose, setCompose] = useState(false);
  const [draft, setDraft] = useState<MailDraft>(blank);
  const [draftId, setDraftId] = useState<string>();
  const [to, setTo] = useState('');
  const [composeFrom, setComposeFrom] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const generation = useRef(0);
  const selectionGeneration = useRef(0);
  const dirty = useRef(false);
  const composeRef = useRef<HTMLDialogElement>(null);
  const deepLink = useRef(false);

  const connect = async () => {
    setConfigLoading(true); setError('');
    try { const value = await service.config(); setConfig(value); setMailbox(value.mailboxes[0]); }
    catch (problem) { setError(errorText(problem)); }
    finally { setConfigLoading(false); }
  };
  useEffect(() => { if (configured) void connect(); }, [configured, service]);
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300); return () => clearTimeout(timer);
  }, [search]);
  const load = async (more = false) => {
    if (!mailbox) return;
    const version = ++generation.current; setLoading(true); setError('');
    try {
      const result = folder === 'all'
        ? await combinedInbox(service, config?.mailboxes || [mailbox], query, more ? cursor || undefined : undefined)
        : await service.list(mailbox, folder, query, more ? cursor || undefined : undefined);
      if (version !== generation.current) return;
      setItems((current) => more ? [...current, ...result.items.filter((item) => !current.some((row) => row.id === item.id))] : result.items);
      setCursor(result.cursor);
    } catch (problem) { if (version === generation.current) setError(errorText(problem)); }
    finally { if (version === generation.current) setLoading(false); }
  };
  useEffect(() => {
    selectionGeneration.current++; setReading(false); setSelected(undefined); setItems([]); setCursor(null); void load();
    return () => { generation.current++; selectionGeneration.current++; };
  }, [mailbox, folder, query, service, config]);
  useEffect(() => {
    if (compose && !composeRef.current?.open) composeRef.current?.showModal();
  }, [compose]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (dirty.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard);
  }, []);
  // Navigation to another React route also prompts before leaving an unsaved message.
  useEffect(() => {
    const guard = (event: MouseEvent) => {
      const link = (event.target as HTMLElement).closest('a[href]');
      if (dirty.current && link && !window.confirm('Pesan belum disimpan. Tinggalkan halaman?')) { event.preventDefault(); event.stopPropagation(); }
    };
    document.addEventListener('click', guard, true); return () => document.removeEventListener('click', guard, true);
  }, []);
  const begin = (value = blank(), id?: string, from = mailbox) => {
    setPreview(false); setDraft(value); setDraftId(id); setComposeFrom(from); setTo(value.to.join(', ')); dirty.current = false; setCompose(true); setError(''); setNotice('');
  };
  const editDraft = async (message: MailMessage) => {
    setBusy('draft'); setError('');
    try {
      const attachments = [];
      for (const file of message.attachments) attachments.push(await outgoingFile(await service.file(message.mailbox, message.id, file.id), file.filename));
      begin({ to: message.to, subject: message.subject, text: message.text, attachments, inReplyTo: message.inReplyTo, references: message.references, billing: message.billing }, message.id, message.mailbox);
    } catch (problem) { setError(errorText(problem)); } finally { setBusy(''); }
  };
  useEffect(() => {
    if (!mailbox || deepLink.current) return;
    const params = new URLSearchParams(window.location.search); const id = params.get('draft'); const address = params.get('mailbox');
    deepLink.current = true;
    if (id && (!address || config?.mailboxes.includes(address))) {
      service.get(address || mailbox, id).then(async (message) => { setMailbox(message.mailbox); setFolder('drafts'); await editDraft(message); }).catch((problem) => setError(errorText(problem)));
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [mailbox]);
  const closeCompose = () => {
    if (busy) return;
    if (dirty.current && !window.confirm('Perubahan belum disimpan. Tutup pesan ini?')) return;
    dirty.current = false; setCompose(false); composeRef.current?.close();
  };
  const run = async (label: string, action: () => Promise<void>) => {
    if (busy) return; setBusy(label); setError(''); setNotice('');
    try { await action(); } catch (problem) { setError(errorText(problem)); } finally { setBusy(''); }
  };
  const openMessage = async (item: MailSummary) => {
    if (busy) return;
    const version = ++selectionGeneration.current; setReading(true); setError(''); setSelected(undefined); setHtml(false);
    try {
      let message = await service.get(item.mailbox, item.id);
      if (!message.read && !['sending', 'uncertain'].includes(message.status)) message = await service.patch(item.mailbox, item.id, { read: true });
      if (version !== selectionGeneration.current) return;
      setSelected(message); setHtml(!!message.html); setItems((current) => current.map((row) => row.id === item.id && row.mailbox === item.mailbox ? { ...row, read: true } : row));
    } catch (problem) { if (version === selectionGeneration.current) setError(errorText(problem)); }
    finally { if (version === selectionGeneration.current) setReading(false); }
  };
  const change = (patch: { read?: boolean; starred?: boolean; folder?: string }) => selected && run('update', async () => {
    const result = await service.patch(selected.mailbox, selected.id, patch); setSelected(result); await load(); if (patch.folder) setSelected(undefined);
  });
  const save = async (send: boolean) => {
    const recipients = to.split(/[,;\s]+/).map((item) => item.trim()).filter(Boolean);
    if (recipients.length > 10 || recipients.some((item) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item))) throw new Error('Isi alamat penerima yang valid, maksimal 10. Pisahkan dengan koma.');
    if (send && (!recipients.length || !draft.subject.trim() || !draft.text.trim())) throw new Error('Isi penerima, subjek, dan pesan.');
    const saved = await service.save(composeFrom, { ...draft, to: recipients }, draftId); setDraftId(saved.id); dirty.current = false;
    if (send) {
      const result = await service.send(composeFrom, saved.id);
      setNotice(result.status === 'accepted' ? 'Email diterima Resend untuk dikirim.' : result.sendError || 'Pengiriman perlu diperiksa.');
      setFolder(result.folder); setSelected(result); setCompose(false); composeRef.current?.close();
    } else { setNotice('Draft tersimpan.'); setFolder('drafts'); setCompose(false); composeRef.current?.close(); }
    await load();
  };
  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    await run('attachments', async () => {
      const incoming = Array.from(files);
      const existingSize = draft.attachments.reduce((sum, file) => sum + file.content.length * 0.75, 0);
      if (draft.attachments.length + incoming.length > 10 || existingSize + incoming.reduce((sum, file) => sum + file.size, 0) > (config?.maxAttachmentBytes || 8 * 1048576)) throw new Error('Maksimal 10 lampiran dengan total 8 MB.');
      const attachments = await Promise.all(incoming.map((file) => outgoingFile(file, file.name)));
      dirty.current = true; setDraft((value) => ({ ...value, attachments: [...value.attachments, ...attachments] }));
    });
  };
  const updateDraft = (field: 'subject' | 'text', value: string) => { dirty.current = true; setDraft((current) => ({ ...current, [field]: value })); };
  const branded = isBrandedMailbox(composeFrom);
  const sanitized = useMemo(() => selected?.html ? sanitizedEmail(selected.html) : null, [selected?.html]);
  // Only escaped, locally generated template HTML can load our brand assets.
  // Received HTML keeps the separate sanitizer and external-image block.
  const previewHTML = preview && branded ? renderOutgoingEmail({ ...draft, from: composeFrom }).html?.replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src ${EMAIL_ASSET_ORIGIN}; form-action 'none'; base-uri 'none'">`) : '';

  return <section className="admin-page mailbox-page">
    <header className="page-header"><div><p className="page-eyebrow"><span>07 / Correspondence</span></p><h1>Mail Desk</h1><p className="page-description">Percakapan, penawaran, dan kabar baik. Dari alamat Nalaro.</p></div><div className="page-action"><button className="primary-button" disabled={!config || !!busy} onClick={() => begin()}>Tulis email <span>↗</span></button></div></header>
    {error && !compose && <p className="document-error" role="alert">{error}</p>}
    {notice && !compose && <p className="mail-notice" role="status">{notice}</p>}
    {!config ? <div className="mail-setup panel"><span className="mail-empty-icon">@</span><h2>{configLoading ? 'Menghubungkan mailbox…' : 'Mailbox belum terhubung'}</h2><p>Email Nalaro akan tampil di sini setelah layanan email diaktifkan.</p>{configured && !configLoading && <button className="mail-button" onClick={connect}>Hubungkan ulang</button>}</div> : <>
      <div className="mail-account"><div className="mail-account-identity"><MailboxAvatar address={mailbox} /><label><span>Mailbox</span><select aria-label="Pilih mailbox" value={mailbox} disabled={!!busy || compose} onChange={(event) => { setMailbox(event.target.value); if (folder === 'all') setFolder('inbox'); }}>{config.mailboxes.map((item) => <option key={item}>{item}</option>)}</select></label></div><span className="mail-connection"><i className="signal-dot" />{config.sendingConfigured ? 'Siap menerima & mengirim' : 'Menerima · pengiriman belum aktif'}</span></div>
      <nav className="mail-folders" aria-label="Folder email">{folders.map(([key, label, icon]) => <button key={key} aria-current={folder === key ? 'page' : undefined} className={folder === key ? 'is-active' : ''} disabled={!!busy} onClick={() => { setFolder(key); setNotice(''); }}><span aria-hidden="true">{icon}</span>{label}</button>)}</nav>
      <div className="mail-workspace">
        <section className={'mail-list-panel ' + (selected || reading ? 'has-reader' : '')} aria-label="Daftar email">
          <div className="mail-search"><label><span className="sr-only">Cari email</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari subjek, alamat, pesan…" /></label><button aria-label="Muat ulang email" disabled={loading || !!busy} onClick={() => load()}>↻</button></div>
          <div className="mail-list-heading"><strong>{folders.find(([key]) => key === folder)?.[1]}</strong><span>{items.length} dimuat</span></div>
          <div className="mail-message-list">
            {loading && !items.length ? <p className="mail-empty" role="status">Memuat email…</p> : !items.length && <div className="mail-empty"><span>{query ? 'Tidak ada hasil pada bagian ini.' : 'Belum ada email di bagian ini.'}</span>{cursor && <small>Muat lebih banyak untuk melanjutkan pencarian.</small>}</div>}
            {items.map((item) => <button key={item.id} className={'mail-row ' + (!item.read ? 'is-unread ' : '') + (selected?.id === item.id ? 'is-selected' : '')} onClick={() => openMessage(item)}><span className="mail-row-top"><strong>{folder === 'sent' || folder === 'drafts' ? item.to.join(', ') || 'Tanpa penerima' : item.from}</strong><time>{dateText(item.createdAt)}</time></span><span className="mail-row-subject">{item.starred && <i>★</i>}{item.subject || '(Tanpa subjek)'}</span><span className="mail-row-preview">{item.preview || '—'}</span><span className="mail-row-bottom">{['accepted', 'sending', 'uncertain', 'failed', 'draft'].includes(item.status) && <small>{statusText(item.status)}</small>}{item.attachmentCount > 0 && <small>{item.attachmentCount} lampiran</small>}{folder === 'all' && <small className="mail-row-mailbox">{item.mailbox}</small>}{!item.read && <i className="mail-unread-dot" aria-label="Belum dibaca" />}</span></button>)}
          </div>
          {cursor && <button className="mail-load-more" disabled={loading} onClick={() => load(true)}>{loading ? 'Memuat…' : 'Muat lebih banyak'}</button>}
        </section>
        <article className="mail-reader" aria-label="Isi email">
          {reading ? <div className="mail-reader-empty" role="status">Membuka email…</div> : !selected ? <div className="mail-reader-empty"><span className="mail-empty-icon">↗</span><h2>Ruang untuk percakapan.</h2><p>Pilih email untuk membaca, membalas, atau mengelola pesan.</p><small>{mailbox}</small></div> : <>
            <div className="mail-reader-actions"><button className="mail-back mail-button" onClick={() => { selectionGeneration.current++; setSelected(undefined); }}>← Kembali</button><button className="mail-button" disabled={!!busy || ['sending', 'uncertain'].includes(selected.status)} onClick={() => change({ starred: !selected.starred })}>{selected.starred ? '★ Starred' : '☆ Star'}</button><button className="mail-button" disabled={!!busy || ['sending', 'uncertain'].includes(selected.status)} onClick={() => change({ read: !selected.read })}>{selected.read ? 'Tandai belum dibaca' : 'Tandai dibaca'}</button>{selected.folder !== 'trash' ? <button className="mail-button" disabled={!!busy || ['sending', 'uncertain'].includes(selected.status)} onClick={() => change({ folder: 'trash' })}>Trash</button> : <><button className="mail-button" disabled={!!busy} onClick={() => change({ folder: selected.originalFolder || 'inbox' })}>Pulihkan</button><button className="mail-button mail-danger" disabled={!!busy} onClick={() => { if (window.confirm('Hapus permanen email dan lampirannya?')) void run('delete', async () => { await service.remove(selected.mailbox, selected.id); setSelected(undefined); await load(); }); }}>Hapus permanen</button></>}</div>
            <header className="mail-reader-header"><span className="mail-status">{statusText(selected.status)}</span><h2>{selected.subject || '(Tanpa subjek)'}</h2><dl><div><dt>From</dt><dd className="mail-address-with-avatar"><MailboxAvatar address={selected.from} size="sm" /><span>{selected.fromName && selected.fromName + ' · '}{selected.from}</span></dd></div><div><dt>To</dt><dd>{selected.to.join(', ') || '—'}</dd></div><div><dt>Date</dt><dd>{dateText(selected.sentAt || selected.createdAt)}</dd></div>{folder === 'all' && <div><dt>Inbox</dt><dd>{selected.mailbox}</dd></div>}</dl></header>
            {selected.sendError && <p className="document-error">{selected.sendError}</p>}
            {selected.html && <div className="mail-body-toggle"><button aria-pressed={!html} onClick={() => setHtml(false)}>Teks</button><button aria-pressed={html} onClick={() => setHtml(true)}>Tampilan HTML</button><small>Gambar eksternal diblokir.</small></div>}
            {html && selected.html && sanitized ? <><iframe className="mail-html" title="Konten HTML email" sandbox="allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" srcDoc={sanitized.documentHtml} />{!!sanitized.links.length && <div className="mail-external-links"><p>Tautan dalam email <span>Jika tautan di dalam pesan tidak terbuka, gunakan tautan di bawah.</span></p><div>{sanitized.links.map((link) => <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer nofollow">{link.label}<span aria-hidden="true">↗</span></a>)}</div></div>}</> : <div className="mail-text">{linkedPlainText(selected.text || (selected.html ? 'Email ini hanya berisi HTML. Pilih Tampilan HTML untuk membacanya.' : '(Pesan kosong)'))}</div>}
            {!!selected.attachments.length && <div className="mail-attachments"><h3>Attachments</h3>{selected.attachments.map((file) => <button key={file.id} disabled={!!busy} onClick={() => run('download', async () => downloadMailFile(await service.file(selected.mailbox, selected.id, file.id), file.filename))}><span>↓</span><strong>{file.filename}</strong><small>{bytesText(file.size)}</small></button>)}</div>}
            <footer className="mail-reader-footer">{selected.folder === 'drafts' ? <button className="primary-button" disabled={!!busy} onClick={() => editDraft(selected)}>Lanjutkan draft ↗</button> : selected.folder !== 'trash' && selected.status === 'received' ? <button className="primary-button" disabled={!!busy} onClick={() => begin({ ...blank(), to: [selected.replyTo?.[0] || selected.from], subject: /^re:/i.test(selected.subject) ? selected.subject : 'Re: ' + selected.subject, text: '\n\n—\n' + selected.from + ' wrote:\n' + selected.text.split('\n').map((line) => '> ' + line).join('\n'), inReplyTo: selected.messageId, references: [selected.references, selected.messageId].filter(Boolean) .join(' ').slice(-2000) }, undefined, selected.mailbox)}>Balas email ↗</button> : null}{['sending', 'uncertain'].includes(selected.status) && <button className="mail-button" disabled={!!busy || !config.sendingConfigured} onClick={() => run('retry', async () => { const result = await service.send(selected.mailbox, selected.id); setSelected(result); setNotice(result.status === 'accepted' ? 'Email diterima Resend.' : result.sendError || 'Periksa status pengiriman.'); await load(); })}>Periksa / coba ulang</button>}{selected.hasRaw && <button className="mail-button" disabled={!!busy} onClick={() => run('raw', async () => downloadMailFile(await service.file(selected.mailbox, selected.id), 'email.eml'))}>Unduh email asli</button>}</footer>
          </>}
        </article>
      </div>
    </>}
    {compose && <dialog ref={composeRef} className="mail-compose" aria-labelledby="mail-compose-title" onCancel={(event) => { event.preventDefault(); closeCompose(); }}><form onSubmit={(event) => { event.preventDefault(); void run('send', () => save(true)); }}><header><div className="mail-compose-identity"><MailboxAvatar address={composeFrom} size="lg" /><div><small>{composeFrom}</small><h2 id="mail-compose-title">{draft.inReplyTo ? 'Balas email' : 'Pesan baru'}</h2></div></div><button type="button" aria-label="Tutup editor email" disabled={!!busy} onClick={closeCompose}>×</button></header>{error && <p className="document-error" role="alert">{error}</p>}<div className="mail-branding-note"><span>{branded ? (draft.billing ? 'Template billing · Ringkasan dokumen dan footer Nalaro otomatis.' : 'Template Nalaro · Branding dan footer otomatis.' + (draft.inReplyTo ? ' Banner disertakan pada balasan.' : ' Banner disertakan.')) : 'Email pribadi · Tanpa template branding.'}</span>{branded && <button type="button" className="mail-button" aria-expanded={preview} onClick={() => setPreview((value) => !value)}>{preview ? 'Tutup pratinjau' : 'Pratinjau email'}</button>}</div>{previewHTML && <iframe className="mail-template-preview" title="Pratinjau template email Nalaro" sandbox="" referrerPolicy="no-referrer" srcDoc={previewHTML} />}<fieldset disabled={!!busy}><label className="mail-compose-from"><span>From</span><select aria-label="Akun pengirim" value={composeFrom} disabled={!!draftId} onChange={(event) => { setComposeFrom(event.target.value); dirty.current = true; }}>{config?.mailboxes.map((address) => <option key={address} value={address}>{address}</option>)}</select></label><label><span>To</span><input type="text" aria-label="Penerima email" value={to} onChange={(event) => { dirty.current = true; setTo(event.target.value); }} placeholder="client@example.com" autoFocus /><small>Pisahkan beberapa alamat dengan koma.</small></label><label><span>Subject</span><input aria-label="Subjek email" maxLength={300} value={draft.subject} onChange={(event) => updateDraft('subject', event.target.value)} placeholder="Tentang pekerjaan berikutnya…" /></label><label className="mail-compose-body"><span>Message</span><textarea aria-label="Isi pesan" maxLength={200000} rows={12} value={draft.text} onChange={(event) => updateDraft('text', event.target.value)} placeholder="Halo," /></label><div className="mail-compose-files">{draft.attachments.map((file, index) => <span key={index}><strong>{file.filename}</strong><button type="button" aria-label={'Hapus lampiran ' + file.filename} onClick={() => { dirty.current = true; setDraft((value) => ({ ...value, attachments: value.attachments.filter((_, position) => index !== position) })); }}>×</button></span>)}<label><span>+ Lampiran</span><input aria-label="Tambah lampiran" type="file" multiple onChange={(event) => { void addFiles(event.target.files); event.target.value = ''; }} /></label><small>Total maksimal 8 MB.</small></div></fieldset><footer><button type="button" className="mail-button" disabled={!!busy} onClick={() => run('save', () => save(false))}>{busy === 'save' ? 'Menyimpan…' : 'Simpan draft'}</button><button className="primary-button" disabled={!!busy || !config?.sendingConfigured}>{busy === 'send' ? 'Mengirim…' : 'Kirim email ↗'}</button></footer></form></dialog>}
  </section>;
}
