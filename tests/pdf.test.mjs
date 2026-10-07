import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve, extname } from 'node:path';
import { build } from 'vite';
import { chromium } from 'playwright';

const output = resolve('artifacts/pdf-tests');
await mkdir(output, { recursive: true });
await build({ configFile: false, root: resolve('tests'), publicDir: resolve('public'), build: { outDir: resolve('artifacts/pdf-test-site'), emptyOutDir: true, rolldownOptions: { input: resolve('tests/pdf.html') } } });
const root = resolve('artifacts/pdf-test-site');
const server = createServer(async (request, response) => {
  try {
    let path = resolve(root, '.' + new URL(request.url, 'http://localhost').pathname);
    if (!path.startsWith(root + '/')) throw new Error('Invalid path');
    if ((await stat(path)).isDirectory()) path += '/index.html';
    const data = await readFile(path);
    response.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'application/javascript', '.png': 'image/png' })[extname(path)] || 'application/octet-stream');
    response.end(data);
  } catch { response.writeHead(404); response.end(); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}), args: JSON.parse(process.env.CHROMIUM_ARGS || '[]') });
  const page = await browser.newPage({ acceptDownloads: true });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/pdf.html`);
  await page.waitForFunction(() => window.testAPI);
  console.log('URL, payment snapshot and branded QR checks:', await page.evaluate(() => window.testAPI.checks()));
  for (const kind of ['invoice', 'receipt']) {
    const event = page.waitForEvent('download');
    await page.locator('#' + kind).click();
    const download = await event;
    assert.match(download.suggestedFilename(), /\.pdf$/);
    assert.equal(await download.failure(), null);
    await download.saveAs(resolve(output, kind + '-download.pdf'));
    for (const method of ['Bank Transfer', 'QRIS', 'Cash', 'E-Wallet']) {
      const result = await page.evaluate(({ kind, method }) => window.testAPI.pdf(kind, method), { kind, method });
      assert.equal(result.pages, 1, 'Normal export must be one page');
      await writeFile(resolve(output, `${kind}-${method.replaceAll(' ', '-')}.pdf`), Buffer.from(result.pdf.split(',')[1], 'base64'));
      console.log(`${kind} / ${method}: ${result.pages} page(s)`);
    }
    const long = await page.evaluate((kind) => window.testAPI.pdf(kind, 'QRIS', true), kind);
    assert.equal(long.pages, 1, 'Expanded content must fit one page');
    await writeFile(resolve(output, kind + '-long.pdf'), Buffer.from(long.pdf.split(',')[1], 'base64'));
    console.log(`${kind} / expanded content: ${long.pages} page`);
    const combined = await page.evaluate((kind) => window.testAPI.pdf(kind, 'QRIS', 'combined'), kind);
    assert.equal(combined.pages, 1, 'Portrait QRIS artwork and bank details must fit one page');
    await writeFile(resolve(output, kind + '-combined.pdf'), Buffer.from(combined.pdf.split(',')[1], 'base64'));
    const oversized = await page.evaluate(async (kind) => {
      try { await window.testAPI.pdf(kind, 'QRIS', 'oversized'); return ''; }
      catch (error) { return error.message; }
    }, kind);
    assert.match(oversized, /satu halaman A4/, 'Oversized content must be rejected instead of silently clipped or paginated');
    console.log(`${kind} / portrait QRIS + bank: one page; oversized content: safely rejected`);
  }
  assert.deepEqual(errors, []);
  console.log('PASS: real PDF downloads, single-page exports, portrait QRIS + bank information, overflow protection and branded QR decoding.');
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
