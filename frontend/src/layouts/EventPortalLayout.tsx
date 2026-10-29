import { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import {
  Trophy,
  Calendar,
  LayoutDashboard,
  LogOut,
  Menu,
  X,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { ColdStartBanner } from '@/components/ui/ColdStartBanner';
import { useAuth } from '@/api/AuthContext';
import { useOrg } from '@/api/OrgContext';

export function EventPortalLayout() {
  const location = useLocation();
  const { user, isAuthenticated, logout } = useAuth();
  const { organisations } = useOrg();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navLinks = [
    { label: 'Browse Events', href: '/events', icon: Calendar },
    ...(isAuthenticated
      ? [{ label: 'Participant Dashboard', href: '/events/dashboard', icon: LayoutDashboard }]
      : []),
  ];

  async function handleLogout() {
    await logout('/events');
  }

  return (
    <div className="min-h-screen flex flex-col bg-surface-subtle">
      <ColdStartBanner />

      {/* Top Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-white/95 backdrop-blur-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo & Main Nav */}
          <div className="flex items-center gap-8">
            <Link
              to="/events"
              data-testid="event-portal-logo"
              className="flex items-center gap-2.5 text-slate-900 font-bold text-lg tracking-tight hover:opacity-90 transition-opacity"
            >
              <div className="h-8 w-8 rounded-lg bg-brand-600 flex items-center justify-center text-white shadow-sm">
                <Trophy className="h-4 w-4" />
              </div>
              <div className="flex items-center gap-1.5">
                <span>ManageX</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200">
                  Events
                </span>
              </div>
            </Link>

            <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
              {navLinks.map((link) => {
                const isActive =
                  link.href === '/events'
                    ? location.pathname === '/events'
                    : location.pathname.startsWith(link.href);
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    to={link.href}
                    className={`inline-flex items-center gap-1.5 transition-colors ${
                      isActive
                        ? 'text-brand-600 font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{link.label}</span>
                  </Link>
                );
              })}
              <Link
                to="/"
                className="text-xs text-slate-500 hover:text-slate-800 transition-colors inline-flex items-center gap-1"
                title="ManageX Platform Homepage"
              >
                <span>Platform Home</span>
                <ExternalLink className="h-3 w-3" />
              </Link>
            </nav>
          </div>

          {/* Desktop Auth Area */}
          <div className="hidden md:flex items-center gap-3">
            {isAuthenticated && user ? (
              <div className="flex items-center gap-3">
                <Link
                  to="/events/dashboard"
                  className="flex items-center gap-2 px-2.5 py-1 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <Avatar name={user.fullName || user.email} size="sm" />
                  <span className="font-semibold text-slate-900">{user.fullName || user.email}</span>
                </Link>

                {organisations.length > 0 ? (
                  <Link to="/app">
                    <Button variant="outline" size="sm" className="text-xs">
                      Organisation Workspace
                    </Button>
                  </Link>
                ) : (
                  <Link to="/app/organisations">
                    <Button variant="primary" size="sm" className="text-xs">
                      + Create Organisation
                    </Button>
                  </Link>
                )}

                {user.isPlatformAdmin && (
                  <Link to="/platform">
                    <Button variant="outline" size="sm">
                      Platform Admin
                    </Button>
                  </Link>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleLogout}
                  data-testid="logout-button"
                  className="text-slate-600 hover:text-red-600 gap-1.5"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Log Out</span>
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2.5">
                <Link to="/auth/login" state={{ from: { pathname: location.pathname } }}>
                  <Button variant="ghost" size="sm" data-testid="sign-in-button">
                    Sign In
                  </Button>
                </Link>
                <Link to="/auth/register" state={{ from: { pathname: location.pathname } }}>
                  <Button size="sm">Get Started</Button>
                </Link>
              </div>
            )}
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden flex items-center">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 text-slate-600 hover:text-slate-900 rounded-md"
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-b border-border bg-white px-4 pt-2 pb-4 space-y-3">
            <div className="space-y-1">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  to={link.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="block px-3 py-2 rounded-md text-base font-medium text-slate-700 hover:bg-slate-100"
                >
                  {link.label}
                </Link>
              ))}
              <Link
                to="/"
                onClick={() => setIsMobileMenuOpen(false)}
                className="block px-3 py-2 rounded-md text-sm text-slate-500 hover:bg-slate-100"
              >
                Platform Home
              </Link>
            </div>

            <div className="pt-3 border-t border-border">
              {isAuthenticated && user ? (
                <div className="space-y-2">
                  <div className="px-3 py-1 text-sm font-medium text-slate-900">
                    Signed in as {user.fullName || user.email}
                  </div>
                  {organisations.length > 0 ? (
                    <Link
                      to="/app"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="block w-full"
                    >
                      <Button variant="outline" size="sm" className="w-full justify-start">
                        Organisation Workspace
                      </Button>
                    </Link>
                  ) : (
                    <Link
                      to="/app/organisations"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="block w-full"
                    >
                      <Button variant="primary" size="sm" className="w-full justify-start">
                        + Create Organisation
                      </Button>
                    </Link>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start text-red-600"
                    onClick={() => {
                      setIsMobileMenuOpen(false);
                      handleLogout();
                    }}
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Log Out
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Link
                    to="/auth/login"
                    state={{ from: { pathname: location.pathname } }}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="block w-full"
                  >
                    <Button variant="outline" size="sm" className="w-full">
                      Sign In
                    </Button>
                  </Link>
                  <Link
                    to="/auth/register"
                    state={{ from: { pathname: location.pathname } }}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="block w-full"
                  >
                    <Button size="sm" className="w-full">
                      Get Started
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-white text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-slate-700 font-semibold">
            <Trophy className="h-4 w-4 text-brand-600" />
            <span>ManageX Events & Hackathons</span>
          </div>
          <div className="flex items-center gap-6">
            <Link to="/events" className="hover:text-brand-600 transition-colors">
              Browse Events
            </Link>
            {isAuthenticated && (
              <Link to="/events/dashboard" className="hover:text-brand-600 transition-colors">
                My Dashboard
              </Link>
            )}
            <Link to="/" className="hover:text-brand-600 transition-colors">
              ManageX Platform
            </Link>
          </div>
          <p className="text-slate-400">ManageX Enterprise Operations</p>
        </div>
      </footer>
    </div>
  );
}
