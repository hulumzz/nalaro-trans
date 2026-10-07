import React, { lazy, Suspense, useEffect } from 'react';

const VerificationApp = lazy(() => import('./VerificationApp'));
const OrderForm = lazy(() => import('./OrderForm'));

/** Preserve public deep links even on hosts that fall back to index.html. */
export default function EntryApp() {
  const path = window.location.pathname;
  const publicVerification = /^\/verifi?(?:\/|$)/.test(path);
  const publicForm = /^\/form(?:\/|$)/.test(path);
  useEffect(() => {
    if (!publicVerification && !publicForm) window.location.replace('/login');
  }, [publicVerification, publicForm]);
  return <Suspense fallback={<p className="verification-loading">Memuat halaman…</p>}>
    {publicVerification ? <VerificationApp /> : publicForm ? <OrderForm /> : <p><a href="/login">Buka Nalaro Project Desk</a></p>}
  </Suspense>;
}
