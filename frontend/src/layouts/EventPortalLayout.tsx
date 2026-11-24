import { useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { LogOut, Menu, X } from 'lucide-react';
import { Brand } from '@/components/ui/Brand';
import { Button } from '@/components/ui/Button';
import { ColdStartBanner } from '@/components/ui/ColdStartBanner';
import { Avatar } from '@/components/ui/Avatar';
import { useAuth } from '@/api/AuthContext';
import { useOrg } from '@/api/OrgContext';

const navItem = 'rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-surface-subtle hover:text-slate-900';
const primaryLink = 'inline-flex items-center justify-center rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800';

export function EventPortalLayout() {
  const location = useLocation();
  const { user, isAuthenticated, logout } = useAuth();
  const { organisations } = useOrg();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const returnTo = { from: { pathname: location.pathname } };
  const closeMenu = () => setMenuOpen(false);
  const navClass = ({ isActive }: { isActive: boolean }) =>
    isActive ? `${navItem} bg-brand-50 text-brand-800` : navItem;

  return (
    <div className="flex min-h-screen flex-col bg-surface-subtle text-slate-900">
      <a href="#events-main" className="sr-only z-50 bg-white p-3 focus:not-sr-only focus:absolute">Skip to content</a>
      <ColdStartBanner />
      <header
        className="sticky top-0 z-40 border-b border-border bg-white"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && menuOpen) {
            closeMenu();
            menuButton.current?.focus();
          }
        }}
      >
        <div className="relative mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 sm:px-8">
          <Link
            to="/events"
            data-testid="event-portal-logo"
            aria-label="ManageX Events"
            onClick={closeMenu}
            className="flex min-h-16 shrink-0 items-center gap-3"
          >
            <Brand />
            <span className="border-l border-border pl-3 text-sm font-medium text-slate-600">Events</span>
          </Link>
          <button
            ref={menuButton}
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={menuOpen}
            aria-controls="events-navigation"
            className="rounded-md p-2.5 text-slate-700 hover:bg-surface-subtle lg:hidden"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div
            id="events-navigation"
            className={`${menuOpen ? 'flex' : 'hidden'} absolute inset-x-0 top-full max-h-[80vh] flex-col gap-3 overflow-y-auto border-b border-border bg-white p-4 shadow-sm lg:static lg:flex lg:max-h-none lg:flex-1 lg:flex-row lg:items-center lg:justify-between lg:border-0 lg:p-0 lg:shadow-none`}
          >
            <nav aria-label="Event navigation" className="flex flex-col lg:flex-row lg:items-center lg:gap-1">
              <NavLink to="/events" end onClick={closeMenu} className={navClass}>Browse events</NavLink>
              {isAuthenticated && <NavLink to="/events/dashboard" onClick={closeMenu} className={navClass}>My events</NavLink>}
              <Link to="/" onClick={closeMenu} className={navItem}>ManageX home</Link>
            </nav>
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3 lg:border-0 lg:pt-0">
              {isAuthenticated && user ? (
                <>
                  <Link to="/events/dashboard" onClick={closeMenu} className="inline-flex min-w-0 items-center gap-2 rounded-md p-1.5 text-sm text-slate-700 hover:bg-surface-subtle">
                    <Avatar name={user.fullName || user.email} size="sm" />
                    <span className="max-w-32 truncate">{user.fullName || user.email}</span>
                  </Link>
                  <Link to={organisations.length ? '/app' : '/app/organisations'} onClick={closeMenu} className={navItem}>
                    {organisations.length ? 'Workspace' : 'Create organisation'}
                  </Link>
                  {user.isPlatformAdmin && <Link to="/platform" onClick={closeMenu} className={navItem}>Platform admin</Link>}
                  <Button
                    variant="ghost"
                    size="sm"
                    data-testid="logout-button"
                    onClick={() => { closeMenu(); void logout('/events'); }}
                  >
                    <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out
                  </Button>
                </>
              ) : (
                <>
                  <Link to="/auth/login" state={returnTo} onClick={closeMenu} className={navItem} data-testid="sign-in-button">Sign in</Link>
                  <Link to="/auth/register" state={returnTo} onClick={closeMenu} className={primaryLink}>Create account</Link>
                </>
              )}
            </div>
          </div>
        </div>
      </header>
      <main id="events-main" tabIndex={-1} className="min-w-0 flex-1"><Outlet /></main>
      <footer className="border-t border-border bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-8 gap-y-3 px-4 py-6 text-sm text-slate-600 sm:px-8">
          <span className="font-semibold text-slate-800">ManageX Events</span>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
            <Link to="/events" className="hover:text-brand-700">Browse events</Link>
            {isAuthenticated && <Link to="/events/dashboard" className="hover:text-brand-700">My events</Link>}
            <Link to="/" className="hover:text-brand-700">ManageX home</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
