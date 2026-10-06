import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../lib/firebase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      window.location.href = '/admin';
    } catch (err: any) {
      setError('Login gagal. Periksa kembali email dan password Anda.');
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-[85vh] items-center justify-center p-6 relative">
      {/* Decorative background grid pattern */}
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(var(--color-line) 1px, transparent 1px)', backgroundSize: '32px 32px', opacity: 0.2 }} />
      
      <div className="w-full max-w-md bg-ink-2 border border-line p-10 relative z-10 shadow-[8px_8px_0_0_var(--color-line)]">
        {/* Decorative corner accent */}
        <div className="absolute top-0 right-0 w-8 h-8 border-l border-b border-line bg-ink flex items-center justify-center">
          <span className="w-2 h-2 bg-flare block"></span>
        </div>
        <div className="absolute bottom-0 left-0 w-8 h-8 border-r border-t border-line bg-ink flex items-center justify-center">
          <span className="w-2 h-2 bg-flare block"></span>
        </div>

        <div className="mb-10 text-center">
          <h2 className="text-3xl font-display font-bold text-bone tracking-tight uppercase leading-none">
            Nalaro<span className="text-flare">.</span><br/>
            <span className="text-xl tracking-widest text-mute">Project Desk</span>
          </h2>
        </div>
        
        {error && (
          <div className="mb-8 text-flare border border-flare p-4 text-sm font-mono bg-ink flex items-start gap-3">
            <span className="w-2 h-2 bg-flare inline-block mt-1.5 flex-shrink-0"></span>
            <p>{error}</p>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-8">
          <div>
            <label className="flex justify-between text-xs font-mono text-mute mb-3 uppercase tracking-widest">
              <span>Admin Email</span>
              <span className="text-flare">ID</span>
            </label>
            <input
              type="email"
              className="w-full bg-ink border border-line px-4 py-3 text-bone focus:outline-none focus:border-flare focus:ring-1 focus:ring-flare transition-all"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="admin@nalaro.web.id"
            />
          </div>

          <div>
            <label className="flex justify-between text-xs font-mono text-mute mb-3 uppercase tracking-widest">
              <span>Password</span>
              <span className="text-flare">KEY</span>
            </label>
            <input
              type="password"
              className="w-full bg-ink border border-line px-4 py-3 text-bone focus:outline-none focus:border-flare focus:ring-1 focus:ring-flare transition-all"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-flare text-ink font-bold py-4 uppercase tracking-widest hover:bg-bone hover:text-ink transition-all disabled:opacity-50 relative group overflow-hidden mt-4"
          >
            <span className="relative z-10">{isLoading ? 'AUTHORIZING...' : 'INITIALIZE SYSTEM'}</span>
            <div className="absolute inset-0 h-full w-0 bg-bone transition-all duration-300 ease-out group-hover:w-full z-0"></div>
          </button>
        </form>
        
        <div className="mt-10 pt-6 border-t border-line text-center text-xs font-mono text-mute tracking-widest">
          SECURE ACCESS ONLY
        </div>
      </div>
    </div>
  );
}
