import { Suspense, lazy } from 'react';
import { BrowserRouter, Link, Route, Routes, useNavigate } from 'react-router-dom';
import s from '@/ui/ui.module.css';
import { AuthProvider } from '@/auth/AuthContext';
import { EntryPage } from '@/app/EntryPage';
import { PracticePage } from '@/practice/PracticePage';
import { RealPlayPage, RealProfilePage } from '@/real/RealPages';

const Gallery = import.meta.env.DEV ? lazy(() => import('@/dev/Gallery')) : null;

function SiteHeader() {
  const nav = useNavigate();
  return (
    <header className={s.session} style={{ borderRadius: 0, borderLeft: 0, borderRight: 0, borderTop: 0 }}>
      <div className={s.row} style={{ justifyContent: 'space-between' }}>
        <Link to="/" className={s.link} style={{ textDecoration: 'none', color: 'var(--ink)', fontWeight: 700 }}>
          Chog Legacy
        </Link>
        <nav className={s.row} aria-label="Site">
          <button className={s.btn2} onClick={() => nav('/')}>Entry</button>
          <button className={s.btn} onClick={() => nav('/practice')}>Practice</button>
        </nav>
      </div>
    </header>
  );
}

function NotFound() {
  return (
    <main className={s.page}>
      <h1 className={s.display}>Page not found</h1>
      <p><Link className={s.link} to="/">Back to entry</Link></p>
    </main>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
      <div className={s.root}>
        <SiteHeader />
        <Routes>
          <Route path="/" element={<EntryPage />} />
          <Route path="/chog/:tokenId" element={<RealProfilePage />} />
          <Route path="/chog/:tokenId/play" element={<RealPlayPage />} />
          <Route path="/practice" element={<PracticePage />} />
          <Route
            path="/dev/gallery"
            element={
              Gallery ? (
                <Suspense fallback={<main className={s.page}><p role="status">Loading gallery…</p></main>}>
                  <Gallery />
                </Suspense>
              ) : (
                <main className={s.page}>
                  <h1 className={s.display}>Gallery is dev-only</h1>
                  <p className={s.fine}>The fixture state gallery is available in the development server only.</p>
                </main>
              )
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
    </BrowserRouter>
    </AuthProvider>
  );
}
