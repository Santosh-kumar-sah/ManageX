import { Outlet, Link, useLocation } from 'react-router-dom';
import { Layers } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ColdStartBanner } from '@/components/ui/ColdStartBanner';

export function PublicLayout() {
  const location = useLocation();

  const navLinks = [
    { label: 'Overview', href: '/' },
    { label: 'Modules', href: '/modules' },
    { label: 'Security & Tenancy', href: '/security' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-surface-subtle">
      <ColdStartBanner />

      {/* Top Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-white/95 backdrop-blur-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link to="/" className="flex items-center gap-2.5 text-slate-900 font-bold text-lg tracking-tight">
              <div className="h-8 w-8 rounded-lg bg-brand-600 flex items-center justify-center text-white shadow-sm">
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
                    className={`transition-colors ${
                      isActive ? 'text-brand-600 font-semibold' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <Link to="/auth/login">
              <Button variant="ghost" size="sm">
                Sign In
              </Button>
            </Link>
            <Link to="/auth/register">
              <Button size="sm">
                Get Started
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Content Area */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Enterprise Footer */}
      <footer className="border-t border-border bg-white text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="space-y-3 md:col-span-1">
              <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                <div className="h-6 w-6 rounded-md bg-brand-600 flex items-center justify-center text-white text-xs font-bold">
                  M
                </div>
                <span>ManageX Platform</span>
              </div>
              <p className="text-slate-500 leading-relaxed text-xs">
                Unified operations and workspace management for teams, educational institutions, and growing organizations.
              </p>
            </div>

            <div>
              <h4 className="text-xs font-semibold text-slate-900 uppercase tracking-wider mb-3">Core Modules</h4>
              <ul className="space-y-2">
                <li>
                  <Link to="/modules" className="hover:text-brand-600 transition-colors">Events & Hackathons</Link>
                </li>
                <li>
                  <Link to="/modules" className="hover:text-brand-600 transition-colors">Meetings & Minutes</Link>
                </li>
                <li>
                  <Link to="/modules" className="hover:text-brand-600 transition-colors">Projects & Tasks</Link>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="text-xs font-semibold text-slate-900 uppercase tracking-wider mb-3">Platform & Trust</h4>
              <ul className="space-y-2">
                <li>
                  <Link to="/security" className="hover:text-brand-600 transition-colors">Security Architecture</Link>
                </li>
                <li>
                  <Link to="/security" className="hover:text-brand-600 transition-colors">Workspace Isolation</Link>
                </li>
                <li>
                  <Link to="/security" className="hover:text-brand-600 transition-colors">Role-Based Access</Link>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="text-xs font-semibold text-slate-900 uppercase tracking-wider mb-3">Access</h4>
              <ul className="space-y-2">
                <li>
                  <Link to="/auth/login" className="hover:text-brand-600 transition-colors">Sign In to Workspace</Link>
                </li>
                <li>
                  <Link to="/auth/register" className="hover:text-brand-600 transition-colors">Create Free Account</Link>
                </li>
                <li>
                  <Link to="/app" className="hover:text-brand-600 transition-colors">Go to Workspace</Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-border mt-10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-400">
            <p>© {new Date().getFullYear()} ManageX Platform. All rights reserved.</p>
            <p className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500"></span>
              <span>All Systems Operational • Enterprise Multi-Tenant Isolation</span>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
