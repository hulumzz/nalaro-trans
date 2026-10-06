import React, { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { CheckCircle, XCircle } from 'lucide-react';

export default function VerificationApp({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function fetchToken() {
      try {
        const docRef = doc(db, 'public_documents', token);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setData(docSnap.data());
        } else {
          setError(true);
        }
      } catch (e) {
        console.error(e);
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    fetchToken();
  }, [token]);

  if (loading) {
    return (
      <div className="container py-20 min-h-[60vh] flex items-center justify-center font-mono text-mute tracking-widest uppercase">
        Memverifikasi...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="container py-20 min-h-[60vh] flex flex-col items-center justify-center text-center">
        <XCircle className="w-16 h-16 text-flare mb-6" />
        <h1 className="text-4xl font-display font-bold mb-4 text-bone uppercase tracking-wide">Invalid Document</h1>
        <p className="text-mute font-body max-w-md mx-auto leading-relaxed">
          Token verifikasi tidak valid atau dokumen tidak ditemukan di dalam sistem registry Nalaro.
        </p>
      </div>
    );
  }

  return (
    <div className="container py-20 min-h-[60vh]">
      <div className="max-w-3xl mx-auto bg-ink-2 border border-line p-8 md:p-12 relative overflow-hidden">
        {/* Accent corners */}
        <div className="absolute top-0 right-0 w-16 h-16 border-l border-b border-line bg-ink" />
        <div className="absolute bottom-0 left-0 w-8 h-8 border-r border-t border-line bg-ink" />

        <div className="flex flex-col md:flex-row items-start md:items-center gap-6 mb-12 border-b border-line pb-8">
          <CheckCircle className="w-16 h-16 text-flare flex-shrink-0" />
          <div>
            <h1 className="text-3xl font-display font-bold text-bone uppercase tracking-wide mb-2">Dokumen Terverifikasi</h1>
            <p className="text-mute font-mono text-sm">Valid dan tercatat dalam Nalaro System Registry.</p>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
          <div>
            <p className="text-mute font-mono text-xs mb-2 uppercase tracking-wider">Tipe Dokumen</p>
            <p className="font-display font-bold text-xl text-bone uppercase">{data.type || 'INVOICE'}</p>
          </div>
          <div>
            <p className="text-mute font-mono text-xs mb-2 uppercase tracking-wider">Status</p>
            <p className="font-display font-bold text-xl text-flare uppercase">{data.status || 'PAID'}</p>
          </div>
        </div>

        <div className="space-y-6 font-body text-bone">
          <div className="flex flex-col sm:flex-row sm:justify-between border-b border-line pb-4 gap-2">
            <span className="text-mute font-mono text-sm uppercase">Nomor Dokumen</span>
            <span className="font-medium tracking-wide">{data.documentNumber || '-'}</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:justify-between border-b border-line pb-4 gap-2">
            <span className="text-mute font-mono text-sm uppercase">Klien</span>
            <span className="font-medium">{data.clientName || '-'}</span>
          </div>
          {data.projectName && (
            <div className="flex flex-col sm:flex-row sm:justify-between border-b border-line pb-4 gap-2">
              <span className="text-mute font-mono text-sm uppercase">Proyek</span>
              <span className="font-medium">{data.projectName || '-'}</span>
            </div>
          )}
          {data.issueDate && (
            <div className="flex flex-col sm:flex-row sm:justify-between border-b border-line pb-4 gap-2">
              <span className="text-mute font-mono text-sm uppercase">Tanggal Terbit</span>
              <span className="font-medium">{data.issueDate || '-'}</span>
            </div>
          )}
          <div className="flex flex-col sm:flex-row sm:justify-between pt-4 gap-2">
            <span className="text-mute font-mono text-sm uppercase">Total Nilai</span>
            <span className="font-display font-bold text-2xl text-flare">
              {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(data.amount || 0)}
            </span>
          </div>
        </div>
      </div>
      <div className="text-center mt-8 text-mute font-mono text-xs tracking-widest uppercase opacity-50">
        Nalaro Project Desk Internal System
      </div>
    </div>
  );
}
