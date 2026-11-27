import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigationType } from 'react-router-dom';
import { ChevronDown, Menu, X } from 'lucide-react';
import { useAuth } from '@/api/AuthContext';
import { useOrg } from '@/api/OrgContext';
import { Avatar } from '@/components/ui/Avatar';
import { Brand } from '@/components/ui/Brand';
import { ColdStartBanner } from '@/components/ui/ColdStartBanner';
import './PublicLayout.css';

const publicLinks = [
  { label: 'Product', to: '/modules' },
  { label: 'Events', to: '/events' },
  { label: 'Security & privacy', to: '/security' },
];

function PublicHeader() {
  const location = useLocation();
  const { user, isAuthenticated, logout } = useAuth();
  const { organisations } = useOrg();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const header = useRef<HTMLElement>(null);
  const signedIn = isAuthenticated && user;
  const returnState = { from: { pathname: location.pathname } };

  useEffect(() => {
    if (!menuOpen) return;
    function closeOnOutsideClick(event: PointerEvent) {
      if (event.target instanceof Node && !header.current?.contains(event.target)) setMenuOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
    }
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [menuOpen]);

  return (
    <header className="mx-public-header" ref={header}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setMenuOpen(false);
      }}>
      <div className="mx-public-bar mx-public-width">
        <Link to="/" aria-label="ManageX home" className="mx-public-brand"><Brand /></Link>
        <nav aria-label="Main navigation" className="mx-public-nav">
          {publicLinks.map(({ to, label }) => <NavLink key={to} to={to}>{label}</NavLink>)}
        </nav>
        <div className="mx-public-access">
          {!signedIn && <Link to="/auth/login" state={returnState} className="mx-sign-in">Sign in</Link>}
          <button type="button" className={signedIn ? 'mx-account-toggle' : 'mx-mobile-toggle'} ref={menuButton}
            aria-controls="public-navigation-menu" aria-expanded={menuOpen}
            aria-label={signedIn ? 'Account and navigation' : 'Navigation menu'}
            onClick={() => setMenuOpen(open => !open)}>
            {signedIn ? (
              <>
                <Avatar name={user.fullName || user.email} size="sm" />
                <span className="mx-account-name">{user.fullName || user.email}</span>
                <ChevronDown size={16} aria-hidden="true" />
              </>
            ) : menuOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
          </button>
          <div className="mx-public-menu" id="public-navigation-menu" hidden={!menuOpen}>
            <nav className="mx-mobile-nav" aria-label="Mobile navigation">
              {publicLinks.map(({ to, label }) => <NavLink key={to} to={to}>{label}</NavLink>)}
            </nav>
            {signedIn ? (
              <div className="mx-account-links">
                {organisations.length > 0 && <Link to="/app">Workspace</Link>}
                <Link to="/events/dashboard">My events</Link>
                <button type="button" onClick={() => logout('/')}>Sign out</button>
              </div>
            ) : <Link to="/auth/register" state={returnState}>Create account</Link>}
          </div>
        </div>
      </div>
    </header>
  );
}

export function PublicLayout() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const accountPage = location.pathname.startsWith('/auth/') || location.pathname.startsWith('/invitations/');
  const showAccountArt = location.pathname === '/auth/login' || location.pathname === '/auth/register';

  useEffect(() => {
    if (location.hash) {
      const target = document.getElementById(location.hash.slice(1));
      if (target) {
        target.scrollIntoView({ block: 'start' });
        if (target.hasAttribute('tabindex')) target.focus({ preventScroll: true });
      }
    } else if (navigationType !== 'POP') {
      window.scrollTo(0, 0);
    }
  }, [location.key, location.hash, navigationType]);

  return (
    <div className="mx-public-shell">
      <a className="mx-skip" href="#public-content">Skip to content</a>
      <ColdStartBanner />
      <PublicHeader key={location.key} />
      <main id="public-content" tabIndex={-1} className="mx-public-main">
        {accountPage ? (
          <div className={showAccountArt ? 'mx-auth-layout mx-auth-with-art' : 'mx-auth-layout'}>
            <Outlet />
          </div>
        ) : (
        <Outlet />
        )}
      </main>
      <footer className="mx-public-footer">
        <div className="mx-public-width mx-footer-content">
          <div className="mx-footer-brand">
            <Link to="/" aria-label="ManageX home"><Brand /></Link>
            <small>© {new Date().getFullYear()} ManageX</small>
          </div>
          <nav aria-label="Product links">
            <Link to="/modules#events">Events &amp; hackathons</Link>
            <Link to="/modules#meetings">Meetings</Link>
            <Link to="/modules#projects">Projects &amp; tasks</Link>
          </nav>
          <nav aria-label="Account and privacy links">
            <Link to="/events">Browse public events</Link>
            <Link to="/security">Security &amp; privacy</Link>
            <Link to="/auth/register">Create account</Link>
            <Link to="/app">Open workspace</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
