import { useState, useEffect } from 'react';
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
  Shield,
  Plus,
  Check,
} from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ColdStartBanner } from '@/components/ui/ColdStartBanner';
import { apiClient } from '@/api/client';
import { useAuth } from '@/api/AuthContext';
import { useOrg } from '@/api/OrgContext';

export function WorkspaceLayout() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const { organisations, activeOrg, activeDetails, switchOrg } = useOrg();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isOrgDropdownOpen, setIsOrgDropdownOpen] = useState(false);
  const [moduleStates, setModuleStates] = useState<Record<string, boolean>>({
    events: true,
    meetings: true,
    projects: true,
  });

  const activeOrgIdentifier = activeOrg ? activeOrg.id : 'default';

  useEffect(() => {
    if (!activeOrg?.id) return;
    let isMounted = true;
    apiClient<{ modules: { slug: string; isEnabled: boolean }[] }>(
      `/organisations/${activeOrg.id}/modules`
    )
      .then((res) => {
        if (isMounted && res.data?.modules) {
          const map: Record<string, boolean> = {};
          res.data.modules.forEach((m) => {
            map[m.slug] = m.isEnabled;
          });
          setModuleStates(map);
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [activeOrg?.id]);

  // Close mobile drawer on route navigation
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  const overviewNav = {
    label: 'Workspace Overview',
    href: '/app',
    icon: LayoutDashboard,
  };

  const moduleNav = [
    {
      label: 'Events & Hackathons',
      href: activeOrg ? `/app/organisations/${activeOrgIdentifier}/events` : '/app/organisations',
      icon: Calendar,
      badge: moduleStates.events === false ? 'Disabled' : undefined,
    },
    {
      label: 'Meetings',
      href: activeOrg ? `/app/organisations/${activeOrgIdentifier}/meetings` : '/app/organisations',
      icon: Video,
      badge: moduleStates.meetings === false ? 'Disabled' : undefined,
    },
    {
      label: 'Projects & Tasks',
      href: activeOrg ? `/app/organisations/${activeOrgIdentifier}/projects` : '/app/organisations',
      icon: CheckSquare,
      badge: moduleStates.projects === false ? 'Disabled' : undefined,
    },
  ];

  const permissions = activeDetails?.membership?.permissions || [];
  const roleSlug = activeDetails?.membership?.role?.slug || activeOrg?.role?.slug;
  const isOwnerOrAdmin = roleSlug === 'organisation_owner' || roleSlug === 'organisation_admin';

  const canAccessMembers =
    isOwnerOrAdmin ||
    permissions.some((p) => ['org.members.manage', 'org.member.manage', 'org.roles.assign'].includes(p));

  const canAccessModules =
    isOwnerOrAdmin ||
    permissions.some((p) => ['org.modules.manage', 'org.module.manage', 'org.modules.read'].includes(p));

  const canAccessAudit =
    isOwnerOrAdmin ||
    permissions.some((p) => ['org.audit.view', 'org.audit.read'].includes(p));

  const canAccessSettings =
    isOwnerOrAdmin ||
    permissions.some((p) => ['org.edit', 'org.update', 'org.settings.manage', 'org.owner.transfer'].includes(p));

  const adminNav: { label: string; href: string; icon: React.ElementType }[] = [
    ...(canAccessMembers
      ? [
          {
            label: 'Members & Roles',
            href: activeOrg ? `/app/organisations/${activeOrgIdentifier}/members` : '/app/organisations',
            icon: Users,
          },
        ]
      : []),
    ...(canAccessModules
      ? [
          {
            label: 'Modules & Entitlements',
            href: activeOrg ? `/app/organisations/${activeOrgIdentifier}/modules` : '/app/organisations',
            icon: Layers,
          },
        ]
      : []),
    ...(canAccessAudit
      ? [
          {
            label: 'Security & Audit Log',
            href: activeOrg ? `/app/organisations/${activeOrgIdentifier}/audit-logs` : '/app/organisations',
            icon: ShieldCheck,
          },
        ]
      : []),
    ...(canAccessSettings
      ? [
          {
            label: 'Organisation Settings',
            href: activeOrg ? `/app/organisations/${activeOrgIdentifier}/settings` : '/app/organisations',
            icon: Settings,
          },
        ]
      : []),
  ];

  if (adminNav.length > 0) {
    adminNav.push({
      label: 'All Organisations',
      href: '/app/organisations',
      icon: Building2,
    });
  }

  const isLinkActive = (href: string) => {
    if (href === '/app') {
      return location.pathname === '/app';
    }
    if (href === '/app/organisations') {
      return location.pathname === '/app/organisations';
    }
    return location.pathname.startsWith(href);
  };

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

            {/* Dynamic Active Organisation Switcher */}
            <div className="relative">
              <button
                onClick={() => setIsOrgDropdownOpen(!isOrgDropdownOpen)}
                className="w-full flex items-center justify-between p-2 rounded-md border border-border bg-slate-50 hover:bg-slate-100 text-left transition-colors text-xs"
                aria-expanded={isOrgDropdownOpen}
              >
                <div className="flex items-center gap-2 truncate">
                  <div className="h-5 w-5 rounded bg-brand-100 text-brand-700 font-semibold flex items-center justify-center text-[10px] shrink-0 uppercase">
                    {activeOrg ? activeOrg.name.charAt(0) : '?'}
                  </div>
                  <span className="font-medium text-slate-800 truncate">
                    {activeOrg ? activeOrg.name : 'No Organisation'}
                  </span>
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              </button>

              {isOrgDropdownOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-md border border-border bg-white p-1 shadow-lg text-xs max-h-64 overflow-y-auto">
                  <div className="px-2 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Your Organisations
                  </div>
                  {organisations.length === 0 ? (
                    <div className="px-2 py-2 text-slate-400 text-center">No organisations yet</div>
                  ) : (
                    organisations.map((org) => {
                      const isCurrent = activeOrg?.id === org.id;
                      return (
                        <button
                          key={org.id}
                          onClick={() => {
                            switchOrg(org.id);
                            setIsOrgDropdownOpen(false);
                          }}
                          className={`w-full text-left px-2 py-1.5 rounded flex items-center justify-between transition-colors ${
                            isCurrent
                              ? 'bg-brand-50 text-brand-700 font-semibold'
                              : 'hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <span className="truncate pr-1">{org.name}</span>
                          {isCurrent && <Check className="h-3.5 w-3.5 text-brand-600 shrink-0" />}
                        </button>
                      );
                    })
                  )}
                  <Link
                    to="/app/organisations"
                    onClick={() => setIsOrgDropdownOpen(false)}
                    className="flex items-center gap-1 px-2 py-1.5 rounded hover:bg-slate-50 text-brand-600 font-medium border-t border-border mt-1"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Manage organisations...</span>
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="flex-1 p-3 space-y-6 overflow-y-auto">
            {/* Overview Link */}
            <div>
              <Link
                to={overviewNav.href}
                className={`flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                  isLinkActive(overviewNav.href)
                    ? 'bg-brand-50 text-brand-700 font-semibold'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <overviewNav.icon className="h-4 w-4 shrink-0 text-slate-400" />
                  <span>{overviewNav.label}</span>
                </div>
              </Link>
            </div>

            {/* Modules Section */}
            <div>
              <div className="px-3 mb-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Modules
              </div>
              <div className="space-y-1">
                {moduleNav.map((item) => {
                  const isActive = isLinkActive(item.href);
                  return (
                    <Link
                      key={item.label}
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

            {/* Organisation Admin Section */}
            {adminNav.length > 0 && (
              <div>
                <div className="px-3 mb-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Organisation Admin
                </div>
                <div className="space-y-1">
                  {adminNav.map((item) => {
                    const isActive = isLinkActive(item.href);
                    return (
                      <Link
                        key={item.label}
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
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </nav>

          {/* Platform Console Shortcut */}
          {user?.isPlatformAdmin && (
            <div className="p-3 border-t border-border bg-slate-50">
              <Link
                to="/platform"
                className="flex items-center gap-2 text-xs font-medium text-slate-600 hover:text-brand-600 p-2 rounded transition-colors"
              >
                <ShieldCheck className="h-4 w-4 text-slate-400" />
                <span>Platform Administration</span>
              </Link>
            </div>
          )}
        </aside>

        {/* Mobile Navigation Drawer */}
        {isMobileMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
              onClick={() => setIsMobileMenuOpen(false)}
              aria-hidden="true"
            />
            {/* Drawer */}
            <div
              className="relative flex-1 flex flex-col max-w-xs w-full bg-white border-r border-border shadow-xl z-10"
              role="dialog"
              aria-modal="true"
              aria-label="Mobile Navigation"
            >
              <div className="p-4 border-b border-border flex items-center justify-between">
                <Link
                  to="/app"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center gap-2.5 text-slate-900 font-bold text-base"
                >
                  <div className="h-7 w-7 rounded-md bg-brand-600 flex items-center justify-center text-white shadow-sm">
                    <Layers className="h-4 w-4" />
                  </div>
                  <span>ManageX</span>
                </Link>
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-1 rounded-md text-slate-400 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  aria-label="Close navigation"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Dynamic Organisation Selector on Mobile */}
              <div className="p-3 border-b border-border bg-slate-50">
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Active Organisation
                </div>
                <div className="flex items-center justify-between p-2 rounded-md border border-border bg-white text-xs">
                  <div className="flex items-center gap-2 truncate">
                    <div className="h-5 w-5 rounded bg-brand-100 text-brand-700 font-semibold flex items-center justify-center text-[10px] shrink-0 uppercase">
                      {activeOrg ? activeOrg.name.charAt(0) : '?'}
                    </div>
                    <span className="font-medium text-slate-800 truncate">
                      {activeOrg ? activeOrg.name : 'No Organisation'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Navigation items */}
              <nav className="flex-1 p-3 space-y-6 overflow-y-auto">
                {/* Overview Link */}
                <div>
                  <Link
                    to={overviewNav.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                      isLinkActive(overviewNav.href)
                        ? 'bg-brand-50 text-brand-700 font-semibold'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <overviewNav.icon className="h-4 w-4 shrink-0 text-slate-400" />
                      <span>{overviewNav.label}</span>
                    </div>
                  </Link>
                </div>

                {/* Modules Section */}
                <div>
                  <div className="px-3 mb-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Modules
                  </div>
                  <div className="space-y-1">
                    {moduleNav.map((item) => {
                      const isActive = isLinkActive(item.href);
                      return (
                        <Link
                          key={item.label}
                          to={item.href}
                          onClick={() => setIsMobileMenuOpen(false)}
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

                {/* Organisation Admin Section */}
                {adminNav.length > 0 && (
                  <div>
                    <div className="px-3 mb-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      Organisation Admin
                    </div>
                    <div className="space-y-1">
                      {adminNav.map((item) => {
                        const isActive = isLinkActive(item.href);
                        return (
                          <Link
                            key={item.label}
                            to={item.href}
                            onClick={() => setIsMobileMenuOpen(false)}
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
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}
              </nav>

              {user?.isPlatformAdmin && (
                <div className="p-3 border-t border-border bg-slate-50">
                  <Link
                    to="/platform"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex items-center gap-2 text-xs font-medium text-slate-600 hover:text-brand-600 p-2 rounded transition-colors"
                  >
                    <ShieldCheck className="h-4 w-4 text-slate-400" />
                    <span>Platform Administration</span>
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Main Application Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top Workspace Header */}
          <header className="h-14 border-b border-border bg-white px-4 sm:px-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="lg:hidden p-1.5 rounded-md text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                aria-label={isMobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
                aria-expanded={isMobileMenuOpen}
              >
                {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
              <span className="text-xs font-medium text-slate-500 hidden sm:inline">
                Workspace / {activeOrg ? activeOrg.name : 'No Organisation Selected'}
              </span>
            </div>

            {/* User Profile Menu & Platform Shortcut */}
            <div className="flex items-center gap-4">
              {user?.isPlatformAdmin && (
                <Link to="/platform">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 border-indigo-200 bg-indigo-50/70 text-indigo-700 hover:bg-indigo-100 text-xs font-semibold shadow-xs"
                  >
                    <Shield className="h-3.5 w-3.5 text-indigo-600" />
                    <span className="hidden sm:inline">Operator Console</span>
                    <span className="sm:hidden">Operator</span>
                  </Button>
                </Link>
              )}
              <div className="flex items-center gap-2.5">
                <Avatar name={user?.fullName || 'User'} size="sm" />
                <div className="hidden sm:block text-left">
                  <div className="text-xs font-semibold text-slate-800 leading-tight">
                    {user?.fullName || 'Guest'}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {activeOrg?.role?.name || (user?.isPlatformAdmin ? 'Platform Admin' : 'Member')}
                  </div>
                </div>
              </div>
              <button
                onClick={logout}
                title="Logout"
                className="text-slate-400 hover:text-slate-600 p-1 rounded"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </header>

          {/* Onboarding Notice if 0 organisations */}
          {organisations.length === 0 && (
            <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 flex items-center justify-between text-xs text-amber-800">
              <span>
                {user?.isPlatformAdmin
                  ? 'You are signed in as a Platform Administrator without an active organisation workspace.'
                  : 'You do not belong to any organisations yet. Create your first organisation to start collaborating.'}
              </span>
              <div className="flex items-center gap-3 shrink-0 ml-4">
                {user?.isPlatformAdmin && (
                  <Link
                    to="/platform"
                    className="font-semibold text-indigo-700 hover:text-indigo-900 underline hover:no-underline"
                  >
                    Operator Console &rarr;
                  </Link>
                )}
                <Link
                  to="/app/organisations"
                  className="font-semibold text-amber-900 underline hover:no-underline"
                >
                  Create Organisation &rarr;
                </Link>
              </div>
            </div>
          )}

          {/* Workspace Page Content */}
          <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
