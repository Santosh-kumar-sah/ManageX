import { Suspense, useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Building2, CalendarDays, ChevronDown, ExternalLink, Grid2X2, LayoutDashboard, LogOut, Menu,
  Plus, Settings, Shield, ShieldCheck, Trophy, Users, X, type LucideIcon,
} from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { Brand } from '@/components/ui/Brand';
import { ColdStartBanner } from '@/components/ui/ColdStartBanner';
import { apiClient } from '@/api/client';
import { useAuth } from '@/api/AuthContext';
import { useOrg } from '@/api/OrgContext';
import { workspaceTools, WorkspaceToolsContext, type WorkspaceToolsState } from '@/pages/workspace/workspaceTools';
import './workspace.css';

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  disabled?: boolean;
  external?: boolean;
}

const personalLinks: NavItem[] = [
  { label: 'Participant Dashboard', href: '/events/dashboard', icon: Trophy },
  { label: 'Judge Workspace', href: '/app/judge/evaluations', icon: Shield },
  { label: 'Browse Public Events', href: '/events', icon: CalendarDays },
  { label: 'Create Organisation', href: '/app/organisations', icon: Plus },
];

function NavigationGroup({ title, items, pathname, onNavigate }: {
  title?: string;
  items: NavItem[];
  pathname: string;
  onNavigate: () => void;
}) {
  if (!items.length) return null;
  return (
    <div className="workspace-nav-group">
      {title && <h2>{title}</h2>}
      <ul>
        {items.map(({ label, href, icon: Icon, disabled, external }) => {
          const exact = href === '/app' || href === '/events' || href === '/app/organisations';
          const active = !external && (pathname === href || (!exact && pathname.startsWith(href + '/')));
          const content = <><Icon size={18} aria-hidden="true" /><span>{label}</span></>;
          return (
            <li key={href}>
              {disabled ? (
                <span className="workspace-nav-item is-disabled" aria-disabled="true">{content}<small>Off</small></span>
              ) : (
                <Link to={href} className="workspace-nav-item" aria-current={active ? 'page' : undefined}
                  onClick={onNavigate} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined}>
                  {content}{external && <ExternalLink size={13} aria-label="Opens in a new tab" />}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function WorkspaceLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { activeOrg, activeDetails, organisations, switchOrg } = useOrg();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const [toolState, setToolState] = useState<WorkspaceToolsState>({ orgId: undefined });
  const [refreshKey, setRefreshKey] = useState(0);
  const orgId = activeOrg?.id;
  const orgHref = '/app/organisations/' + orgId;
  const result = toolState.orgId === orgId ? toolState : { orgId };
  const moduleInfo = activeOrg && workspaceTools.find(tool => pathname === orgHref + '/' + tool.slug || pathname.startsWith(orgHref + '/' + tool.slug + '/'));
  const membership = activeDetails?.organisation?.id === orgId ? activeDetails?.membership : undefined;
  const role = membership?.role?.slug || activeOrg?.role?.slug;
  const admin = role === 'organisation_owner' || role === 'organisation_admin';
  const canAccess = (...permissions: string[]) => admin || permissions.some(key => membership?.permissions.includes(key));
  const canOpenSettings = canAccess('org.modules.manage', 'org.module.manage', 'org.modules.read');

  useEffect(() => {
    if (!orgId) return;
    let current = true;
    apiClient<{ modules: NonNullable<WorkspaceToolsState['tools']> }>('/organisations/' + orgId + '/modules')
      .then(({ data }) => {
        if (current) setToolState({ orgId, tools: data?.modules || [] });
      })
      .catch(() => {
        if (current) setToolState({ orgId, error: 'Your workspace tools could not be loaded.' });
      });
    return () => { current = false; };
  }, [orgId, refreshKey]);

  useEffect(() => { setMenuOpen(false); }, [pathname]);

  function refreshTools() {
    setToolState({ orgId });
    setRefreshKey(key => key + 1);
  }

  const moduleLinks = workspaceTools.map(tool => {
    const state = result.tools?.find(item => item.slug === tool.slug);
    return { label: tool.name, href: orgHref + '/' + tool.slug, icon: tool.icon, disabled: result.tools && (!state?.isEnabled || !state.isPlatformAvailable) };
  });
  const settingsLinks: NavItem[] = [];
  if (activeOrg) {
    if (canAccess('org.members.manage', 'org.member.manage', 'org.roles.assign')) settingsLinks.push({ label: 'Members & Roles', href: orgHref + '/members', icon: Users });
    if (canOpenSettings) settingsLinks.push({ label: 'Workspace tools', href: orgHref + '/modules', icon: Grid2X2 });
    if (canAccess('org.audit.view', 'org.audit.read')) settingsLinks.push({ label: 'Audit log', href: orgHref + '/audit-logs', icon: ShieldCheck });
    if (canAccess('org.edit', 'org.update', 'org.settings.manage', 'org.owner.transfer')) settingsLinks.push({ label: 'Organisation Settings', href: orgHref + '/settings', icon: Settings });
  }

  function closeMenu() { setMenuOpen(false); }

  return (
    <div className="workspace-shell">
      <a className="workspace-skip" href="#workspace-content">Skip to content</a>
      <ColdStartBanner />
      <header className="workspace-topbar">
        <Link to="/app" className="workspace-brand" aria-label="ManageX workspace"><Brand /></Link>
        <span className="workspace-topbar-divider" />
        <span className="workspace-current">{activeOrg?.name || 'Personal workspace'}</span>
        <div className="workspace-account">
          <Avatar name={user?.fullName || user?.email || 'User'} size="sm" />
          <span className="workspace-account-name">{user?.fullName || user?.email}<small>{activeOrg?.role?.name || (user?.isPlatformAdmin ? 'Platform admin' : 'Participant')}</small></span>
          <button type="button" className="workspace-icon-button" aria-label="Sign out" title="Sign out" onClick={() => logout()}><LogOut size={18} /></button>
          <button type="button" className="workspace-icon-button workspace-menu-button" ref={menuButton} aria-controls="workspace-navigation" aria-expanded={menuOpen}
            aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'} onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>
      <div className="workspace-frame">
        <aside className={menuOpen ? 'workspace-rail is-open' : 'workspace-rail'} id="workspace-navigation"
          onKeyDown={event => { if (event.key === 'Escape' && menuOpen) { closeMenu(); menuButton.current?.focus(); } }}>
          <nav aria-label="Workspace navigation">
            {activeOrg && (
              <label className="workspace-switcher">
                <span>Organisation</span>
                <span className="workspace-select-wrap"><Building2 size={17} aria-hidden="true" />
                  <select value={activeOrg.id} aria-label="Switch organisation" onChange={event => {
                    if (event.target.value !== activeOrg.id) {
                      void switchOrg(event.target.value);
                      navigate('/app');
                    }
                    closeMenu();
                  }}>
                    {organisations.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}
                  </select><ChevronDown size={14} aria-hidden="true" />
                </span>
              </label>
            )}
            <NavigationGroup pathname={pathname} onNavigate={closeMenu} items={[{ label: 'Overview', href: '/app', icon: LayoutDashboard }]} />
            <NavigationGroup pathname={pathname} onNavigate={closeMenu} title={activeOrg ? 'Workspace' : 'Personal'}
              items={activeOrg ? moduleLinks : personalLinks} />
            {moduleInfo?.slug === 'events' && <NavigationGroup pathname={pathname} onNavigate={closeMenu}
              items={[{ label: 'Public events', href: '/events', icon: CalendarDays, external: true }]} />}
            <NavigationGroup pathname={pathname} onNavigate={closeMenu} title="Organisation" items={settingsLinks} />
            {activeOrg && <NavigationGroup pathname={pathname} onNavigate={closeMenu} items={[{ label: 'All organisations', href: '/app/organisations', icon: Building2 }]} />}
            {user?.isPlatformAdmin && <NavigationGroup pathname={pathname} onNavigate={closeMenu} title="Platform"
              items={[{ label: 'Platform administration', href: '/platform', icon: ShieldCheck }]} />}
          </nav>
        </aside>
        <main id="workspace-content" tabIndex={-1} className="workspace-content">
          <WorkspaceToolsContext.Provider value={{ ...result, refresh: refreshTools, canOpenSettings }}>
            <Suspense fallback={<p role="status" className="text-slate-600">Loading this page…</p>}><Outlet /></Suspense>
          </WorkspaceToolsContext.Provider>
        </main>
      </div>
    </div>
  );
}
