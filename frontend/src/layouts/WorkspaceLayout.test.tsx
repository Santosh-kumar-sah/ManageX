import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { WorkspaceLayout } from './WorkspaceLayout';
import * as AuthContextModule from '@/api/AuthContext';
import * as OrgContextModule from '@/api/OrgContext';

vi.mock('@/api/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/api/OrgContext', () => ({
  useOrg: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  apiClient: vi.fn().mockResolvedValue({ data: { modules: [] } }),
}));

describe('WorkspaceLayout — Permission-based Navigation & Operator Shortcuts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Renders Organisation Admin section when user has admin permissions / role', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: {
        id: 'admin-1',
        email: 'admin@acme.org',
        fullName: 'Acme Admin',
        isPlatformAdmin: false,
        status: 'active',
      },
      isLoading: false,
      isAuthenticated: true,
      refreshUser: vi.fn(),
      logout: vi.fn(),
    });

    vi.spyOn(OrgContextModule, 'useOrg').mockReturnValue({
      organisations: [
        {
          id: 'org-1',
          name: 'Acme Corp',
          slug: 'acme-corp',
          status: 'active',
          memberCount: 5,
          role: { slug: 'organisation_admin', name: 'Organisation Admin' },
          createdAt: '2026-01-01',
        },
      ],
      activeOrg: {
        id: 'org-1',
        name: 'Acme Corp',
        slug: 'acme-corp',
        status: 'active',
        memberCount: 5,
        role: { slug: 'organisation_admin', name: 'Organisation Admin' },
        createdAt: '2026-01-01',
      },
      activeDetails: {
        organisation: {
          id: 'org-1',
          name: 'Acme Corp',
          slug: 'acme-corp',
          status: 'active',
        },
        membership: {
          id: 'mem-1',
          role: { slug: 'organisation_admin', name: 'Organisation Admin' },
          permissions: ['org.members.manage', 'org.modules.manage', 'org.audit.view', 'org.edit'],
        },
      },
      isLoading: false,
      switchOrg: vi.fn(),
      refreshOrganisations: vi.fn(),
      createOrganisation: vi.fn(),
    });

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app']}>
        <WorkspaceLayout />
      </MemoryRouter>
    );

    expect(html).toContain('Organisation Admin');
    expect(html).toContain('Members &amp; Roles');
    expect(html).toContain('Modules &amp; Entitlements');
    expect(html).toContain('Security &amp; Audit Log');
    expect(html).toContain('Organisation Settings');
  });

  it('2. Completely HIDES Organisation Admin section for ordinary members without admin permissions', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: {
        id: 'member-1',
        email: 'student@acme.org',
        fullName: 'Student Participant',
        isPlatformAdmin: false,
        status: 'active',
      },
      isLoading: false,
      isAuthenticated: true,
      refreshUser: vi.fn(),
      logout: vi.fn(),
    });

    vi.spyOn(OrgContextModule, 'useOrg').mockReturnValue({
      organisations: [
        {
          id: 'org-1',
          name: 'Acme Corp',
          slug: 'acme-corp',
          status: 'active',
          memberCount: 5,
          role: { slug: 'organisation_member', name: 'Organisation Member' },
          createdAt: '2026-01-01',
        },
      ],
      activeOrg: {
        id: 'org-1',
        name: 'Acme Corp',
        slug: 'acme-corp',
        status: 'active',
        memberCount: 5,
        role: { slug: 'organisation_member', name: 'Organisation Member' },
        createdAt: '2026-01-01',
      },
      activeDetails: {
        organisation: {
          id: 'org-1',
          name: 'Acme Corp',
          slug: 'acme-corp',
          status: 'active',
        },
        membership: {
          id: 'mem-2',
          role: { slug: 'organisation_member', name: 'Organisation Member' },
          permissions: ['org.view', 'event.view', 'meeting.view', 'project.view'],
        },
      },
      isLoading: false,
      switchOrg: vi.fn(),
      refreshOrganisations: vi.fn(),
      createOrganisation: vi.fn(),
    });

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app']}>
        <WorkspaceLayout />
      </MemoryRouter>
    );

    expect(html).not.toContain('Organisation Admin');
    expect(html).not.toContain('Security &amp; Audit Log');
    expect(html).not.toContain('Organisation Settings');
  });

  it('3. Renders prominent Operator Console button in header when user is platform administrator', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: {
        id: 'super-admin-1',
        email: 'superadmin@managex.internal',
        fullName: 'Super Admin',
        isPlatformAdmin: true,
        platformRole: 'platform_super_admin',
        status: 'active',
      },
      isLoading: false,
      isAuthenticated: true,
      refreshUser: vi.fn(),
      logout: vi.fn(),
    });

    vi.spyOn(OrgContextModule, 'useOrg').mockReturnValue({
      organisations: [],
      activeOrg: null,
      activeDetails: null,
      isLoading: false,
      switchOrg: vi.fn(),
      refreshOrganisations: vi.fn(),
      createOrganisation: vi.fn(),
    });

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app']}>
        <WorkspaceLayout />
      </MemoryRouter>
    );

    expect(html).toContain('Operator Console');
    expect(html).toContain('/platform');
  });

  it('4. Does NOT render Operator Console header button for non-platform users', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: {
        id: 'member-1',
        email: 'user@acme.org',
        fullName: 'Regular User',
        isPlatformAdmin: false,
        status: 'active',
      },
      isLoading: false,
      isAuthenticated: true,
      refreshUser: vi.fn(),
      logout: vi.fn(),
    });

    vi.spyOn(OrgContextModule, 'useOrg').mockReturnValue({
      organisations: [],
      activeOrg: null,
      activeDetails: null,
      isLoading: false,
      switchOrg: vi.fn(),
      refreshOrganisations: vi.fn(),
      createOrganisation: vi.fn(),
    });

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app']}>
        <WorkspaceLayout />
      </MemoryRouter>
    );

    expect(html).not.toContain('Operator Console');
  });

  it('5. Does not mark module navigation items as active on /app/organisations when activeOrg is null', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: {
        id: 'member-1',
        email: 'user@acme.org',
        fullName: 'Regular User',
        isPlatformAdmin: false,
        status: 'active',
      },
      isLoading: false,
      isAuthenticated: true,
      refreshUser: vi.fn(),
      logout: vi.fn(),
    });

    vi.spyOn(OrgContextModule, 'useOrg').mockReturnValue({
      organisations: [],
      activeOrg: null,
      activeDetails: null,
      isLoading: false,
      switchOrg: vi.fn(),
      refreshOrganisations: vi.fn(),
      createOrganisation: vi.fn(),
    });

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations']}>
        <WorkspaceLayout />
      </MemoryRouter>
    );

    // Module links should be rendered with inactive styling (text-slate-600), not active styling (bg-brand-50 text-brand-700)
    expect(html).toContain('Events &amp; Hackathons');
    expect(html).toContain('Meetings');
    expect(html).toContain('Projects &amp; Tasks');

    // Confirm that the active class combination 'bg-brand-50 text-brand-700' is NOT applied to any module links
    // Split on the module links and check their class lists
    const eventLinkMatch = html.match(/<a[^>]*href="\/app\/organisations"[^>]*>[\s\S]*?Events &amp; Hackathons[\s\S]*?<\/a>/);
    expect(eventLinkMatch).not.toBeNull();
    expect(eventLinkMatch![0]).not.toContain('bg-brand-50');
    expect(eventLinkMatch![0]).toContain('text-slate-600');
  });
});
