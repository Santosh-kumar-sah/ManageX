import { Outlet, Link, useLocation } from 'react-router-dom';
import { Shield, Building, Boxes, FileText, ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { ColdStartBanner } from '@/components/ui/ColdStartBanner';

export function PlatformLayout() {
  const location = useLocation();

  const navItems = [
    { label: 'Overview', href: '/platform', icon: Shield },
    { label: 'Organisations', href: '/platform/organisations', icon: Building, badge: 'Phase 9' },
    { label: 'Module Catalogue', href: '/platform/modules', icon: Boxes, badge: 'Phase 9' },
    { label: 'Platform Audit Logs', href: '/platform/audit-logs', icon: FileText, badge: 'Phase 9' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <ColdStartBanner />

      {/* Platform Header with Distinct Visual Identity */}
      <header className="bg-slate-900 text-white border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/platform" className="flex items-center gap-2.5 font-bold text-base tracking-tight text-white">
              <div className="h-7 w-7 rounded bg-indigo-500 flex items-center justify-center text-white">
                <Shield className="h-4 w-4" />
              </div>
              <span>ManageX Platform Admin</span>
            </Link>
            <Badge variant="brand" className="bg-indigo-950 text-indigo-300 border-indigo-800">
              Operator Console
            </Badge>
          </div>

          <Link
            to="/app"
            className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Return to Workspace</span>
          </Link>
        </div>

        {/* Platform Navigation Bar */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex space-x-6 text-xs border-t border-slate-800/80">
          {navItems.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.href}
                to={item.href}
                className={`py-3 flex items-center gap-2 border-b-2 font-medium transition-colors ${
                  isActive
                    ? 'border-indigo-400 text-white'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <item.icon className="h-3.5 w-3.5" />
                <span>{item.label}</span>
                {item.badge && (
                  <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </header>

      {/* Platform Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
}
