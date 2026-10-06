# NalaroTrans

Project Desk untuk proyek, klien, invoice, pembayaran, receipt, dan verifikasi publik Nalaro. Dibangun dengan Astro, React, dan Firebase. Halaman admin memakai desain Project Desk; halaman verifikasi memakai header/footer Nalaro.

## Pengembangan dan build

Gunakan Node.js >=22.12.0.

```sh
npm ci
npm run dev
npm run check
npm run build
```

Cloudflare Pages: build command `npm run build`, output directory `dist`. Aturan `public/_redirects` melayani `/admin/*` dan `/verif/*` pada aplikasi statis.

## Pembayaran dan dokumen PDF

1. Buka **Pengaturan**, isi rekening bank dan/atau informasi e-wallet.
2. Unggah gambar **QRIS statis** asli dalam PNG/JPG (maksimal 300 KB, minimal 128 × 128 piksel). Sistem memakai gambar ini apa adanya; tidak membuat atau mengubah kode pembayaran.
3. Pilih metode saat membuat invoice: Bank Transfer, QRIS, Cash, E-Wallet, atau Other. Metode pembayaran aktual dipilih ketika mencatat pembayaran.
4. Unduh PDF dari daftar invoice/receipt. Tombol menampilkan status pembuatan dan pesan ketika unduhan gagal.

Informasi pembayaran pada dokumen baru disimpan ketika invoice diterbitkan atau pembayaran dicatat. Receipt memakai informasi pembayaran yang tercatat pada pembayaran tersebut. Perubahan rekening di Pengaturan tidak mengubah informasi pada dokumen yang sudah memiliki salinan tersebut. Dokumen lama tanpa salinan memakai pengaturan saat diunduh. Cash tidak menampilkan informasi rekening, e-wallet, atau QRIS.

PDF memakai header abu-abu, logo Nalaro, pembungkusan teks, tabel dengan pergantian halaman, nomor halaman, dan dua kode yang dibedakan jelas ketika QRIS dipilih: **QRIS pembayaran** dan **QR verifikasi dokumen**. Logo hanya ditambahkan ke QR verifikasi, dengan error correction H dan quiet zone empat modul.

## URL verifikasi

Kolom **URL dasar verifikasi** di Pengaturan dapat dikosongkan untuk mengikuti alamat aplikasi yang sedang diakses, termasuk domain Pages yang aktif. Contoh URL khusus: `https://alamat-aplikasi/verif/`.

Urutan pemilihan alamat: pengaturan eksplisit, `PUBLIC_VERIFICATION_BASE_URL`, lalu origin aplikasi. Nilai bawaan lama `https://e-invoice.nalaro.web.id/verif/` otomatis mengikuti origin saat aplikasi diakses dari host lain. Halaman verifikasi juga menerima `/verif/?token=TOKEN` untuk host tanpa rewrite path.

Subdomain khusus harus ditambahkan dan diaktifkan melalui penyedia hosting/DNS sebelum dipakai. Perubahan kode tidak membuat DNS subdomain aktif. PDF yang sudah tersimpan dengan alamat lama perlu diunduh ulang; token verifikasi tetap sama.

## Pengujian regresi PDF

```sh
npx playwright install chromium
npm run test:pdf
```

Pengujian membangun modul PDF untuk produksi, membuka Chromium, menguji unduhan PDF sesungguhnya, empat metode pembayaran, teks panjang, kestabilan salinan informasi pembayaran, migrasi URL lama, parsing token, serta scan QR berlogo pada ukuran 600/300/160 piksel. Keluaran contoh ada di `artifacts/pdf-tests/` (diabaikan Git). Gambar QRIS pada pengujian merupakan kode demo, bukan QRIS pembayaran asli.

`CHROMIUM_EXECUTABLE` dan `CHROMIUM_ARGS` (array JSON) dapat dipakai jika browser disediakan oleh lingkungan pengujian.
