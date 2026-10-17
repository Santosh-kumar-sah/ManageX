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
                const isActive = location.pathname === link.href;
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
      <footer className="border-t border-border bg-white py-8 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 font-medium text-slate-700">
            <div className="h-5 w-5 rounded bg-brand-600 flex items-center justify-center text-white text-[10px] font-bold">
              M
            </div>
            <span>ManageX Modular Multi-Tenant SaaS</span>
          </div>
          <div>
            <span>Built with Clean Enterprise standards • Version 1.0 (Phase 1 Baseline)</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
