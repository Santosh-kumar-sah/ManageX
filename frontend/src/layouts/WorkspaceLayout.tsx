import { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import {
  Layers,
  LayoutDashboard,
  Calendar,
  Video,
  CheckSquare,
  Building2,
  Users,
  Settings,
  Menu,
  X,
  ChevronDown,
  LogOut,
  ShieldCheck,
} from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { ColdStartBanner } from '@/components/ui/ColdStartBanner';

export function WorkspaceLayout() {
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isOrgDropdownOpen, setIsOrgDropdownOpen] = useState(false);

  const mainNav = [
    { label: 'Workspace Overview', href: '/app', icon: LayoutDashboard },
    { label: 'Events & Hackathons', href: '/app/organisations/demo-org/events', icon: Calendar, badge: 'Phase 6' },
    { label: 'Meetings', href: '/app/organisations/demo-org/meetings', icon: Video, badge: 'Phase 7' },
    { label: 'Projects & Tasks', href: '/app/organisations/demo-org/projects', icon: CheckSquare, badge: 'Phase 8' },
  ];

  const adminNav = [
    { label: 'Members & Invites', href: '/app/organisations/demo-org/members', icon: Users, badge: 'Phase 4' },
    { label: 'Organisation Settings', href: '/app/organisations/demo-org/settings', icon: Settings, badge: 'Phase 4' },
    { label: 'Switch Organisations', href: '/app/organisations', icon: Building2 },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-surface-subtle">
      <ColdStartBanner />

      <div className="flex-1 flex">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:flex w-64 flex-col border-r border-border bg-white select-none">
          {/* Logo & Org Selector */}
          <div className="p-4 border-b border-border">
            <Link to="/app" className="flex items-center gap-2.5 text-slate-900 font-bold text-base mb-4">
              <div className="h-7 w-7 rounded-md bg-brand-600 flex items-center justify-center text-white shadow-sm">
                <Layers className="h-4 w-4" />
              </div>
              <span>ManageX</span>
            </Link>

            {/* Active Organisation Switcher Placeholder */}
            <div className="relative">
              <button
                onClick={() => setIsOrgDropdownOpen(!isOrgDropdownOpen)}
                className="w-full flex items-center justify-between p-2 rounded-md border border-border bg-slate-50 hover:bg-slate-100 text-left transition-colors text-xs"
                aria-expanded={isOrgDropdownOpen}
              >
                <div className="flex items-center gap-2 truncate">
                  <div className="h-5 w-5 rounded bg-brand-100 text-brand-700 font-semibold flex items-center justify-center text-[10px] shrink-0">
                    A
                  </div>
                  <span className="font-medium text-slate-800 truncate">Acme Enterprise</span>
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              </button>

              {isOrgDropdownOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-md border border-border bg-white p-1 shadow-lg text-xs">
                  <div className="px-2 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Your Organisations
                  </div>
                  <button
                    onClick={() => setIsOrgDropdownOpen(false)}
                    className="w-full text-left px-2 py-1.5 rounded hover:bg-slate-50 font-medium text-slate-700 flex items-center justify-between"
                  >
                    <span>Acme Enterprise</span>
                    <Badge variant="brand">Active</Badge>
                  </button>
                  <Link
                    to="/app/organisations"
                    onClick={() => setIsOrgDropdownOpen(false)}
                    className="block px-2 py-1.5 rounded hover:bg-slate-50 text-brand-600 font-medium border-t border-border mt-1"
                  >
                    + Manage organisations...
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="flex-1 p-3 space-y-6 overflow-y-auto">
            <div>
              <div className="px-3 mb-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Modules
              </div>
              <div className="space-y-1">
                {mainNav.map((item) => {
                  const isActive = location.pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      to={item.href}
                      className={`flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                        isActive
                          ? 'bg-brand-50 text-brand-700 font-semibold'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <item.icon className="h-4 w-4 shrink-0 text-slate-400" />
                        <span>{item.label}</span>
                      </div>
                      {item.badge && <Badge variant="neutral">{item.badge}</Badge>}
                    </Link>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="px-3 mb-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Organisation Admin
              </div>
              <div className="space-y-1">
                {adminNav.map((item) => {
                  const isActive = location.pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      to={item.href}
                      className={`flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                        isActive
                          ? 'bg-brand-50 text-brand-700 font-semibold'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <item.icon className="h-4 w-4 shrink-0 text-slate-400" />
                        <span>{item.label}</span>
                      </div>
                      {item.badge && <Badge variant="neutral">{item.badge}</Badge>}
                    </Link>
                  );
                })}
              </div>
            </div>
          </nav>

          {/* Platform Console Shortcut */}
          <div className="p-3 border-t border-border bg-slate-50">
            <Link
              to="/platform"
              className="flex items-center gap-2 text-xs font-medium text-slate-600 hover:text-brand-600 p-2 rounded transition-colors"
            >
              <ShieldCheck className="h-4 w-4 text-slate-400" />
              <span>Platform Administration</span>
            </Link>
          </div>
        </aside>

        {/* Main Application Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top Workspace Header */}
          <header className="h-14 border-b border-border bg-white px-4 sm:px-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="lg:hidden p-1.5 rounded-md text-slate-500 hover:bg-slate-100"
                aria-label="Toggle navigation"
              >
                {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
              <span className="text-xs font-medium text-slate-500 hidden sm:inline">
                Workspace / Acme Enterprise
              </span>
            </div>

            {/* User Profile Menu */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2.5">
                <Avatar name="Alex Developer" size="sm" />
                <div className="hidden sm:block text-left">
                  <div className="text-xs font-semibold text-slate-800 leading-tight">Alex Developer</div>
                  <div className="text-[10px] text-slate-400">Owner</div>
                </div>
              </div>
              <Link to="/auth/login" title="Logout" className="text-slate-400 hover:text-slate-600">
                <LogOut className="h-4 w-4" />
              </Link>
            </div>
          </header>

          {/* Workspace Page Content */}
          <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
