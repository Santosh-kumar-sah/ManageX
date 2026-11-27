import { Outlet, Link, useLocation } from 'react-router-dom';
import { Shield, Users, Building, Boxes, FileText, ArrowLeft } from 'lucide-react';
import { Brand } from '@/components/ui/Brand';
import './workspace.css';
import { ColdStartBanner } from '@/components/ui/ColdStartBanner';

export function PlatformLayout() {
  const location = useLocation();

  const navItems = [
    { label: 'Overview', href: '/platform', icon: Shield },
    { label: 'Accounts', href: '/platform/accounts', icon: Users },
    { label: 'Organisations', href: '/platform/organisations', icon: Building },
    { label: 'Workspace tools', href: '/platform/modules', icon: Boxes },
    { label: 'Audit log', href: '/platform/audit-logs', icon: FileText },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <a href="#platform-content" className="mx-skip">Skip to content</a>
      <ColdStartBanner />

      {/* Platform Header with Distinct Visual Identity */}
      <header className="bg-[#172a24] text-white border-b border-[#31473d]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex flex-col items-start gap-0.5 sm:flex-row sm:items-center sm:gap-4">
            <Link to="/platform" className="flex items-center gap-2.5 font-bold text-base tracking-tight text-white">
              <Brand />
            </Link>
            <span className="text-sm text-brand-100">Administration</span>
          </div>

          <Link
            to="/app"
            className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Workspace</span>
          </Link>
        </div>

        {/* Platform Navigation Bar */}
        <nav aria-label="Platform administration" className="platform-nav max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-sm border-t border-white/20">
          {navItems.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.href}
                aria-current={isActive ? 'page' : undefined}
                to={item.href}
                className={`py-3 flex items-center gap-2 border-b-2 font-medium transition-colors ${
                  isActive
                    ? 'border-brand-200 text-white'
                    : 'border-transparent text-slate-200 hover:text-white'
                }`}
              >
                <item.icon className="h-3.5 w-3.5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </header>

      {/* Platform Content Area */}
      <main id="platform-content" tabIndex={-1} className="platform-content flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
}
