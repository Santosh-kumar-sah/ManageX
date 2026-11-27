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
    expect(html).toContain('Workspace tools');
    expect(html).toContain('Audit log');
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

    expect(html).not.toContain('href="/app/organisations/org-1/members"');
    expect(html).not.toContain('Audit log');
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

    expect(html).toContain('Platform administration');
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

    expect(html).not.toContain('Platform administration');
  });

  it('5. Does not mark module navigation items as active on the organisation directory', () => {
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
      organisations: [
        {
          id: 'org-1',
          name: 'Acme Corp',
          slug: 'acme-corp',
          status: 'active',
          memberCount: 2,
          role: { slug: 'organisation_member', name: 'Organisation Member' },
          createdAt: '2026-01-01',
        },
      ],
      activeOrg: {
        id: 'org-1',
        name: 'Acme Corp',
        slug: 'acme-corp',
        status: 'active',
        memberCount: 2,
        role: { slug: 'organisation_member', name: 'Organisation Member' },
        createdAt: '2026-01-01',
      },
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

    expect(html).toContain('Events &amp; Hackathons');
    expect(html).toContain('Meetings');
    expect(html).toContain('Projects &amp; Tasks');
    const eventLink = html.match(/<a[^>]+href="\/app\/organisations\/org-1\/events"[^>]*>/);
    expect(eventLink).not.toBeNull();
    expect(eventLink![0]).not.toContain('aria-current="page"');
    expect(html).toMatch(/<a[^>]*aria-current="page"[^>]*href="\/app\/organisations"/);
  });

  it('6. Renders the active Events link, overview and public portal when in events workspace', () => {
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
          id: 'mem-1',
          role: { slug: 'organisation_member', name: 'Organisation Member' },
          permissions: ['event.view'],
        },
      },
      isLoading: false,
      switchOrg: vi.fn(),
      refreshOrganisations: vi.fn(),
      createOrganisation: vi.fn(),
    });

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-1/events']}>
        <WorkspaceLayout />
      </MemoryRouter>
    );

    expect(html).toMatch(/<a[^>]*aria-current="page"[^>]*href="\/app\/organisations\/org-1\/events"/);
    expect(html).toContain('href="/app"');
    expect(html).toContain('Public events');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('7. Renders the active Meetings link and an organisation switcher when in meetings workspace', () => {
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
      activeDetails: null,
      isLoading: false,
      switchOrg: vi.fn(),
      refreshOrganisations: vi.fn(),
      createOrganisation: vi.fn(),
    });

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/org-1/meetings']}>
        <WorkspaceLayout />
      </MemoryRouter>
    );

    expect(html).toMatch(/<a[^>]*aria-current="page"[^>]*href="\/app\/organisations\/org-1\/meetings"/);
    expect(html).toContain('aria-label="Switch organisation"');
    expect(html).toContain('href="/app"');
  });

  it('8. Keeps module navigation within the same tab without target="_blank"', () => {
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

    // Module links in platform sidebar do not open new tabs
    expect(html).not.toContain('target="_blank"');
    expect(html).not.toContain('rel="noopener noreferrer"');
    expect(html).toContain('/app/organisations/org-1/events');
    expect(html).toContain('/app/organisations/org-1/meetings');
    expect(html).toContain('/app/organisations/org-1/projects');
  });

  it('9. Enforces Participant persona isolation when user has 0 organisations: displays Participant role, hides internal modules, and shows participant links', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: {
        id: 'student-42',
        email: 'student@managex.edu',
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

    // 1. Role under avatar must be 'Participant', NEVER 'Member'
    expect(html).toContain('Participant');
    expect(html).not.toContain('<div class="text-[10px] text-slate-400">Member</div>');

    // 2. Header must indicate Participant View
    expect(html).toContain('Personal workspace');

    // 3. Navigation must show Personal and not Internal Modules
    expect(html).toContain('Personal');
    expect(html).toContain('Participant Dashboard');
    expect(html).toContain('Browse Public Events');
    expect(html).not.toContain('Projects &amp; Tasks');

    // 4. If participant enters a route containing /meetings, module workspace must NOT activate without activeOrg
    const meetingRouteHtml = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/app/organisations/some-org/meetings']}>
        <WorkspaceLayout />
      </MemoryRouter>
    );
    expect(meetingRouteHtml).not.toContain('Meetings Workspace');
    expect(meetingRouteHtml).toContain('Personal workspace');
  });
});
