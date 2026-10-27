import { Outlet, Link, useLocation } from 'react-router-dom';
import { Layers, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { ColdStartBanner } from '@/components/ui/ColdStartBanner';
import { SkipLink } from '@/components/ui/SkipLink';
import { useAuth } from '@/api/AuthContext';
import { useOrg } from '@/api/OrgContext';

export function PublicLayout() {
  const location = useLocation();
  const { user, isAuthenticated, logout } = useAuth();
  const { organisations } = useOrg();

  const navLinks = [
    { label: 'Overview', href: '/' },
    { label: 'Events & Hackathons', href: '/events' },
    { label: 'Modules', href: '/modules' },
    { label: 'Security & Privacy', href: '/security' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-surface-subtle">
      <SkipLink />
      <ColdStartBanner />

      {/* Top Header */}
      <header className="sticky top-0 z-sticky border-b border-border bg-white/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link to="/" className="flex items-center gap-2.5 text-foreground font-bold text-lg tracking-tight">
              <div className="h-8 w-8 rounded-md bg-brand-700 flex items-center justify-center text-white border border-brand-500/30">
                <Layers className="h-5 w-5" />
              </div>
              <span>ManageX</span>
            </Link>

            <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
              {navLinks.map((link) => {
                const isActive =
                  link.href === '/'
                    ? location.pathname === '/'
                    : location.pathname.startsWith(link.href);
                return (
                  <Link
                    key={link.href}
                    to={link.href}
                    className={`transition-colors ${isActive ? 'text-brand-700 font-semibold' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {isAuthenticated && user ? (
              <div className="flex items-center gap-3">
                <Link
                  to={organisations.length > 0 ? '/app' : '/events/dashboard'}
                  className="flex items-center gap-2 px-2.5 py-1 rounded-md text-xs font-medium text-slate-700 hover:bg-surface-subtle transition-colors border border-transparent hover:border-border"
                >
                  <Avatar name={user.fullName || user.email} size="sm" />
                  <span className="font-semibold text-foreground hidden sm:inline">
                    {user.fullName || user.email}
                  </span>
                </Link>
                {organisations.length > 0 ? (
                  <>
                    <Link to="/app">
                      <Button variant="outline" size="sm">
                        Workspace
                      </Button>
                    </Link>
                    <Link to="/events/dashboard">
                      <Button variant="ghost" size="sm" className="hidden sm:inline-flex text-xs text-slate-600">
                        Participant Dashboard
                      </Button>
                    </Link>
                  </>
                ) : (
                  <Link to="/events/dashboard">
                    <Button variant="outline" size="sm">
                      Participant Dashboard
                    </Button>
                  </Link>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => logout('/')}
                  className="text-slate-600 hover:text-red-600 gap-1.5"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">Log Out</span>
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2.5">
                <Link to="/auth/login" state={{ from: { pathname: location.pathname } }}>
                  <Button variant="ghost" size="sm">
                    Sign In
                  </Button>
                </Link>
                <Link to="/auth/register" state={{ from: { pathname: location.pathname } }}>
                  <Button size="sm">
                    Get Started
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Content Area */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
            <div className="space-y-4 md:col-span-1">
              <div className="flex items-center gap-2 font-bold text-foreground text-sm">
                <div className="h-6 w-6 rounded-md bg-brand-700 flex items-center justify-center text-white border border-brand-500/30 text-xs font-bold">
                  M
                </div>
                <span>ManageX Platform</span>
              </div>
              <p className="text-slate-600 leading-relaxed text-sm">
                Unified operations and workspace management for teams, educational institutions, and growing organizations.
              </p>
            </div>

            <div>
              <h4 className="text-xs font-semibold text-slate-600 mb-3 tracking-[0.05em]">Core Modules</h4>
              <ul className="space-y-2">
                <li>
                  <Link to="/modules" className="text-sm text-slate-600 hover:text-brand-700 transition-colors">
                    Events & Hackathons
                  </Link>
                </li>
                <li>
                  <Link to="/modules" className="text-sm text-slate-600 hover:text-brand-700 transition-colors">
                    Meetings & Minutes
                  </Link>
                </li>
                <li>
                  <Link to="/modules" className="text-sm text-slate-600 hover:text-brand-700 transition-colors">
                    Projects & Tasks
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="text-xs font-semibold text-slate-600 mb-3 tracking-[0.05em]">Platform & Trust</h4>
              <ul className="space-y-2">
                <li>
                  <Link to="/security" className="text-sm text-slate-600 hover:text-brand-700 transition-colors">
                    Security Architecture
                  </Link>
                </li>
                <li>
                  <Link to="/security" className="text-sm text-slate-600 hover:text-brand-700 transition-colors">
                    Workspace Isolation
                  </Link>
                </li>
                <li>
                  <Link to="/security" className="text-sm text-slate-600 hover:text-brand-700 transition-colors">
                    Role-Based Access
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="text-xs font-semibold text-slate-600 mb-3 tracking-[0.05em]">Access</h4>
              <ul className="space-y-2">
                <li>
                  <Link to="/auth/login" className="text-sm text-slate-600 hover:text-brand-700 transition-colors">
                    Sign In to Workspace
                  </Link>
                </li>
                <li>
                  <Link to="/auth/register" className="text-sm text-slate-600 hover:text-brand-700 transition-colors">
                    Create Free Account
                  </Link>
                </li>
                <li>
                  <Link to="/app" className="text-sm text-slate-600 hover:text-brand-700 transition-colors">
                    Go to Workspace
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-border mt-12 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-[10px] text-slate-400 tracking-[0.05em]">
            <p>© {new Date().getFullYear()} ManageX Platform. All rights reserved.</p>
            <p className="flex items-center gap-2">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-700"></span>
              <span>All Systems Operational</span>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
