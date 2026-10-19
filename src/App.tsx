import { Suspense, lazy, useEffect, useRef, useState } from "react";
import {
  BrowserRouter,
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import s from "@/ui/ui.module.css";
import { Icon } from "@/ui/Icon";
import { SessionBar } from "@/ui/components";
import type { Handlers } from "@/ui/types";
import { AuthProvider, useAuth } from "@/auth/AuthContext";
import { sessionHandlers } from "@/auth/sessionHandlers";
import { EntryPage } from "@/app/EntryPage";
import { PracticePage } from "@/practice/PracticePage";
import { RealPlayPage, RealProfilePage } from "@/real/RealPages";
const Gallery = import.meta.env.DEV
  ? lazy(() => import("@/dev/Gallery"))
  : null;
const noop = () => {};
function WalletDock() {
  const auth = useAuth(),
    [open, setOpen] = useState(false),
    ref = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    const outside = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", key);
    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("pointerdown", outside);
    };
  }, [open]);
  const h: Handlers = {
    onLookup: noop,
    onStartPractice: noop,
    onRefreshOwner: noop,
    onActivate: noop,
    onIntention: noop,
    onSubmitChoice: noop,
    onPage: noop,
    onFilter: noop,
    onPracticeReset: noop,
    onPracticeHandoff: noop,
    onLeavePractice: noop,
    ...sessionHandlers(auth),
  };
  return (
    <div className={s.walletDock} ref={ref}>
      <button
        ref={trigger}
        className={s.walletTrigger}
        aria-expanded={open}
        aria-controls="wallet-panel"
        onClick={() => setOpen((x) => !x)}
      >
        <Icon name="wallet" size={17} />
        {auth.session?.authenticated
          ? "Signed in"
          : auth.address
            ? "Wallet connected"
            : "Wallet"}
        <Icon name="chevron" size={13} />
      </button>
      {open && (
        <div id="wallet-panel" className={s.walletPopup}>
          <SessionBar
            v={auth.viewer}
            h={h}
            address={auth.address ?? auth.session?.wallet ?? undefined}
            note={auth.notice}
            wallets={auth.wallets}
            pickerOpen={auth.pickerOpen}
          />
        </div>
      )}
    </div>
  );
}
function SiteHeader() {
  const { pathname } = useLocation();
  return (
    <>
      <a href="#content" className={s.skipLink}>
        Skip to content
      </a>
      <header className={s.siteHeader}>
        <Link to="/" className={s.brand} aria-label="Chog Legacy home">
          <span className={s.brandMark}>
            <Icon name="book" size={23} />
          </span>
          <span className={s.brandName}>
            Chog Legacy<small>A story that stays</small>
          </span>
        </Link>
        <nav className={s.siteNav} aria-label="Site">
          <NavLink to="/" end>
            The beginning
          </NavLink>
          <a href="/#how-it-works">How it works</a>
          <NavLink to="/practice">Practice journal</NavLink>
        </nav>
        <div className={s.navRight}>
          {pathname !== "/practice" && (
            <Link className={s.btn} to="/practice">
              Play practice <Icon name="arrow" size={15} />
            </Link>
          )}
          <WalletDock />
        </div>
      </header>
    </>
  );
}
function RouteReset() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      requestAnimationFrame(() =>
        document.getElementById(hash.slice(1))?.scrollIntoView(),
      );
    } else {
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  }, [pathname, hash]);
  return null;
}
function NotFound() {
  return (
    <main className={`${s.page} ${s.centerPage}`}>
      <div className={s.chapterSeal}>
        <Icon name="book" size={30} />
      </div>
      <h1 className={s.display}>A page yet to be written.</h1>
      <p className={s.lede}>We couldn’t find this chapter.</p>
      <Link className={s.btn} to="/">
        Back to the beginning
      </Link>
    </main>
  );
}
export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className={s.root}>
          <SiteHeader />
          <RouteReset />
          <div id="content" tabIndex={-1}>
            <Routes>
              <Route path="/" element={<EntryPage />} />
              <Route path="/chog/:tokenId" element={<RealProfilePage />} />
              <Route path="/chog/:tokenId/play" element={<RealPlayPage />} />
              <Route path="/practice" element={<PracticePage />} />
              <Route
                path="/dev/gallery"
                element={
                  Gallery ? (
                    <Suspense
                      fallback={
                        <main className={s.page}>
                          <p role="status">Loading gallery…</p>
                        </main>
                      }
                    >
                      <Gallery />
                    </Suspense>
                  ) : (
                    <NotFound />
                  )
                }
              />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </div>
          <footer className={s.siteFooter}>
            <span className={s.footerBrand}>Chog Legacy</span>
            <span>The Chog keeps its past. You choose its next chapter.</span>
            <span>Built on Monad · Made for little adventures</span>
          </footer>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}
