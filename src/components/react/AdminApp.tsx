import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link, useNavigate, Navigate } from 'react-router-dom';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { generateInvoicePDF, generateReceiptPDF } from '../../lib/pdf';
import { LayoutDashboard, Users, FolderKanban, FileText, Settings, LogOut, Search, Menu, X, Plus, Download } from 'lucide-react';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      if (!u && !loading) {
        window.location.href = '/login';
      }
    });
    return () => unsub();
  }, [loading]);

  if (loading) return <div className="p-8 text-center text-mute font-mono">LOADING SYSTEM...</div>;
  if (!user) return null;
  return <>{children}</>;
}

// ------------------- COMPONENTS -------------------

function Dashboard() {
  return (
    <div className="p-8 lg:p-12 space-y-12 animate-fade-in max-w-6xl mx-auto">
      <div className="flex items-end justify-between border-b border-line pb-6">
        <div>
          <h1 className="text-4xl lg:text-5xl font-display font-bold uppercase tracking-tight leading-none mb-2">System<br/><span className="text-flare">Overview</span></h1>
          <p className="text-mute font-mono text-sm tracking-widest uppercase mt-4 flex items-center gap-2">
            <span className="w-2 h-2 bg-flare inline-block animate-pulse"></span>
            Live Status
          </p>
        </div>
        <div className="hidden md:block text-right">
          <div className="text-xs font-mono text-mute uppercase tracking-widest border border-line px-3 py-1 mb-2 bg-ink-2">Server Time</div>
          <div className="font-mono text-xl">{new Date().toLocaleTimeString('en-US', { hour12: false })}</div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="bg-ink-2 p-8 border-2 border-line hover:border-flare transition-all relative group shadow-[8px_8px_0_0_var(--color-line)] hover:shadow-[8px_8px_0_0_var(--color-flare)] hover:-translate-y-1 hover:-translate-x-1">
          <div className="absolute top-0 right-0 w-4 h-4 border-l border-b border-line group-hover:border-flare transition-colors" />
          <h3 className="text-mute text-xs font-mono uppercase tracking-widest mb-4">Active Projects</h3>
          <p className="text-5xl font-display font-bold text-flare">0<span className="text-2xl text-mute ml-2">/slots</span></p>
        </div>
        
        <div className="bg-ink-2 p-8 border-2 border-line hover:border-flare transition-all relative group shadow-[8px_8px_0_0_var(--color-line)] hover:shadow-[8px_8px_0_0_var(--color-flare)] hover:-translate-y-1 hover:-translate-x-1">
          <div className="absolute top-0 right-0 w-4 h-4 border-l border-b border-line group-hover:border-flare transition-colors" />
          <h3 className="text-mute text-xs font-mono uppercase tracking-widest mb-4">Waiting Payment</h3>
          <p className="text-5xl font-display font-bold text-flare">Rp 0</p>
        </div>
        
        <div className="bg-ink-2 p-8 border-2 border-line hover:border-flare transition-all relative group shadow-[8px_8px_0_0_var(--color-line)] hover:shadow-[8px_8px_0_0_var(--color-flare)] hover:-translate-y-1 hover:-translate-x-1">
          <div className="absolute top-0 right-0 w-4 h-4 border-l border-b border-line group-hover:border-flare transition-colors" />
          <h3 className="text-mute text-xs font-mono uppercase tracking-widest mb-4">Completed</h3>
          <p className="text-5xl font-display font-bold text-flare">0<span className="text-2xl text-mute ml-2">docs</span></p>
        </div>
      </div>

      <div className="bg-ink-2 border-l-4 border-flare border-y border-r border-y-line border-r-line p-8 relative overflow-hidden mt-12">
        <div className="absolute top-0 right-0 p-4 opacity-10">
          <LayoutDashboard size={120} />
        </div>
        <h2 className="font-display font-bold text-2xl tracking-wide mb-4 relative z-10">INITIALIZATION SEQUENCE COMPLETE</h2>
        <p className="text-mute font-mono text-sm leading-relaxed max-w-2xl relative z-10">
          Nalaro Project Desk system is fully operational. Database connections are secure. 
          Navigate modules via the command sidebar. Generate PDFs using the <span className="text-flare border-b border-flare">Invoices</span> module.
        </p>
      </div>
    </div>
  );
}

function Clients() {
  const [clients, setClients] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [picName, setPicName] = useState('');
  
  useEffect(() => {
    const fetchClients = async () => {
      try {
        const snap = await getDocs(collection(db, 'clients'));
        setClients(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error(e);
      }
    };
    fetchClients();
  }, []);

  const addClient = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const docRef = await addDoc(collection(db, 'clients'), {
        clientCode: `CLI-${Math.floor(Math.random()*10000)}`,
        name,
        picName,
        createdAt: serverTimestamp()
      });
      setClients([...clients, { id: docRef.id, name, picName }]);
      setName(''); setPicName('');
    } catch(e) {
      console.error(e);
      alert("Error adding client. Check Firestore rules.");
    }
  };

  return (
    <div className="p-6 lg:p-10 space-y-8">
      <h1 className="text-3xl font-display font-bold uppercase tracking-wide">Client Directory</h1>
      
      <form onSubmit={addClient} className="bg-ink-2 p-6 border border-line flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-mono text-mute mb-2 uppercase">Nama Perusahaan</label>
          <input required type="text" className="w-full bg-ink border border-line p-3 text-bone focus:outline-none focus:border-flare" value={name} onChange={e=>setName(e.target.value)} />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-mono text-mute mb-2 uppercase">Nama PIC</label>
          <input required type="text" className="w-full bg-ink border border-line p-3 text-bone focus:outline-none focus:border-flare" value={picName} onChange={e=>setPicName(e.target.value)} />
        </div>
        <button type="submit" className="bg-flare text-ink font-bold px-6 py-3 uppercase tracking-wider hover:bg-bone hover:text-ink transition-colors flex items-center gap-2 h-[50px]">
          <Plus size={18}/> Tambah
        </button>
      </form>

      <div className="border border-line overflow-x-auto bg-ink-2">
        <table className="w-full text-left text-sm font-body">
          <thead className="bg-ink font-mono text-mute text-xs uppercase border-b border-line">
            <tr>
              <th className="p-4 font-normal">ID Klien</th>
              <th className="p-4 font-normal">Nama Perusahaan</th>
              <th className="p-4 font-normal">PIC</th>
            </tr>
          </thead>
          <tbody>
            {clients.map(c => (
              <tr key={c.id} className="border-b border-line hover:bg-ink transition-colors">
                <td className="p-4 font-mono text-mute-b">{c.id.slice(0,8)}</td>
                <td className="p-4 font-bold text-bone">{c.name}</td>
                <td className="p-4 text-mute">{c.picName}</td>
              </tr>
            ))}
            {clients.length === 0 && (
              <tr>
                <td colSpan={3} className="p-8 text-center text-mute font-mono">
                  TIDAK ADA DATA KLIEN.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Invoices() {
  const handleGeneratePDF = async () => {
    const dummyInvoice = {
      invoiceNumber: `NAL/INV/2026/${Math.floor(Math.random()*1000)}`,
      issueDate: '2026-10-06',
      dueDate: '2026-10-13',
      subtotal: 5000000,
      grandTotal: 5000000,
      publicToken: 'demo-token-123',
      items: [
        { description: 'Website Development', quantity: 1, unitPrice: 5000000, total: 5000000 }
      ]
    };
    const dummyClient = { name: 'PT Contoh Indonesia', picName: 'Budi Santoso' };
    
    await generateInvoicePDF(dummyInvoice, dummyClient, null, null);
  };

  return (
    <div className="p-6 lg:p-10 space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h1 className="text-3xl font-display font-bold uppercase tracking-wide">Invoices</h1>
        <button onClick={handleGeneratePDF} className="bg-flare text-ink font-bold px-6 py-3 uppercase tracking-wider hover:bg-bone hover:text-ink transition-colors flex items-center gap-2">
          <Download size={18} /> Test Generate PDF
        </button>
      </div>

      <div className="bg-ink-2 border border-line p-8 text-center text-mute font-mono">
        <p>MODUL INVOICE DALAM PENGEMBANGAN.</p>
        <p className="mt-2 text-xs">Gunakan tombol di atas untuk menguji fungsi PDF Generator Nalaro.</p>
      </div>
    </div>
  );
}


function AdminLayout() {
  const [isSidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await signOut(auth);
    window.location.href = '/login';
  };

  const navItems = [
    { name: 'Dashboard', path: '/admin', icon: LayoutDashboard },
    { name: 'Clients', path: '/admin/clients', icon: Users },
    { name: 'Projects', path: '/admin/projects', icon: FolderKanban },
    { name: 'Invoices', path: '/admin/invoices', icon: FileText },
    { name: 'Archive', path: '/admin/archive', icon: Search },
    { name: 'Settings', path: '/admin/settings', icon: Settings },
  ];

  return (
    <div className="flex min-h-screen bg-ink text-bone font-body selection:bg-flare selection:text-ink">
      
      {/* Sidebar Mobile Toggle */}
      <div className="md:hidden p-4 bg-ink border-b border-line flex justify-between items-center fixed top-0 w-full z-20">
        <span className="font-display font-bold text-bone tracking-widest">NALARO<span className="text-flare">.</span></span>
        <button onClick={() => setSidebarOpen(!isSidebarOpen)} className="text-bone">
          {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar */}
      <aside className={`bg-ink-2 w-64 border-r border-line flex-shrink-0 fixed md:static inset-y-0 left-0 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 transition-transform duration-300 ease-in-out z-10 pt-16 md:pt-0 flex flex-col`}>
        <div className="p-8 hidden md:block border-b border-line">
          <h2 className="text-2xl font-display font-bold tracking-widest text-bone">NALARO<span className="text-flare">.</span></h2>
          <p className="font-mono text-xs text-mute mt-1 tracking-widest">PROJECT DESK</p>
        </div>
        
        <nav className="flex-1 py-6 px-4 space-y-2 overflow-y-auto">
          {navItems.map((item) => (
            <Link
              key={item.name}
              to={item.path}
              className="flex items-center px-4 py-3 font-mono text-sm tracking-wide text-mute hover:bg-line hover:text-bone transition-colors"
              onClick={() => setSidebarOpen(false)}
            >
              <item.icon className="w-4 h-4 mr-4" />
              {item.name}
            </Link>
          ))}
        </nav>
        
        <div className="p-4 border-t border-line">
          <button
            onClick={handleLogout}
            className="flex w-full items-center px-4 py-3 font-mono text-sm tracking-wide text-flare hover:bg-line transition-colors"
          >
            <LogOut className="w-4 h-4 mr-4" />
            LOGOUT
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 pt-16 md:pt-0 overflow-y-auto bg-ink relative">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/projects" element={<div className="p-10"><h1 className="text-3xl font-display font-bold uppercase">Projects</h1><div className="mt-8 p-8 border border-line bg-ink-2 font-mono text-mute text-center text-sm">PROYEK DALAM TAHAP PENGEMBANGAN</div></div>} />
          <Route path="/invoices" element={<Invoices />} />
          <Route path="/archive" element={<div className="p-10"><h1 className="text-3xl font-display font-bold uppercase">Archive</h1><div className="mt-8 p-8 border border-line bg-ink-2 font-mono text-mute text-center text-sm">ARSIP KOSONG</div></div>} />
          <Route path="/settings" element={<div className="p-10"><h1 className="text-3xl font-display font-bold uppercase">Settings</h1></div>} />
          <Route path="*" element={<Navigate to="/admin" />} />
        </Routes>
      </main>
    </div>
  );
}

export default function AdminApp() {
  return (
    <BrowserRouter basename="/admin">
      <ProtectedRoute>
        <AdminLayout />
      </ProtectedRoute>
    </BrowserRouter>
  );
}
