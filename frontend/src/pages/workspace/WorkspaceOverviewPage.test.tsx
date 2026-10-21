import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { WorkspaceOverviewPage } from './WorkspaceOverviewPage';

// Mock useOrg hook to test with active organisation context
vi.mock('@/api/OrgContext', () => ({
  useOrg: vi.fn(() => ({
    activeOrg: {
      id: 'org-test-123',
      name: 'Innovation Hub',
      slug: 'innovation-hub',
      status: 'active',
      memberCount: 8,
      role: { slug: 'organisation_admin', name: 'Organisation Admin' },
    },
    organisations: [
      {
        id: 'org-test-123',
        name: 'Innovation Hub',
        slug: 'innovation-hub',
        status: 'active',
        memberCount: 8,
        role: { slug: 'organisation_admin', name: 'Organisation Admin' },
      },
    ],
    switchOrg: vi.fn(),
  })),
}));

// Mock useAuth hook
vi.mock('@/api/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    user: {
      id: 'user-1',
      fullName: 'Test User',
      email: 'test@managex.internal',
      isPlatformAdmin: false,
      status: 'active',
    },
  })),
}));

// Mock apiClient to avoid network requests during static test render
vi.mock('@/api/client', () => ({
  apiClient: vi.fn().mockResolvedValue({ data: { modules: [] } }),
}));

describe('Stage 2 — Workspace Overview & Dashboard UX', () => {
  it('1. Renders the active organisation name and role dynamically', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <WorkspaceOverviewPage />
      </MemoryRouter>
    );

    expect(html).toContain('Innovation Hub');
    expect(html).toContain('Organisation Admin');
    expect(html).toContain('8 members');
  });

  it('2. Does NOT contain developer API probe or uptime heartbeat counters', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <WorkspaceOverviewPage />
      </MemoryRouter>
    );

    expect(html).not.toContain('Express API Probe');
    expect(html).not.toContain('uptimeSeconds');
    expect(html).not.toContain('/api/v1/health');
    expect(html).not.toContain('Refresh API Status');
  });

  it('3. Does NOT contain developer phase milestone badges', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <WorkspaceOverviewPage />
      </MemoryRouter>
    );

    expect(html).not.toContain('Scheduled for Phase 6');
    expect(html).not.toContain('Scheduled for Phase 7');
    expect(html).not.toContain('Scheduled for Phase 8');
    expect(html).not.toContain('View Placeholder Shell');
  });

  it('4. Uses dynamic organisation routes rather than hardcoded demo-org', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <WorkspaceOverviewPage />
      </MemoryRouter>
    );

    expect(html).not.toContain('demo-org');
    expect(html).toContain('/app/organisations/org-test-123/events');
    expect(html).toContain('/app/organisations/org-test-123/meetings');
    expect(html).toContain('/app/organisations/org-test-123/projects');
  });

  it('5. Renders honest, customer-friendly empty state for activity', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <WorkspaceOverviewPage />
      </MemoryRouter>
    );

    expect(html).toContain('No recent activity logged yet');
    expect(html).not.toContain('subsequent phases');
  });

  it('6. Renders truthful zero-organisation empty state with Create Organisation for regular users', async () => {
    const OrgContextModule = await import('@/api/OrgContext');
    vi.spyOn(OrgContextModule, 'useOrg').mockReturnValueOnce({
      activeOrg: null,
      organisations: [],
      activeDetails: null,
      isLoading: false,
      switchOrg: vi.fn(),
      refreshOrganisations: vi.fn(),
      createOrganisation: vi.fn(),
    });

    const html = renderToStaticMarkup(
      <MemoryRouter>
        <WorkspaceOverviewPage />
      </MemoryRouter>
    );

    expect(html).toContain('No Organisation Workspace');
    expect(html).toContain('You do not currently belong to any organisation workspace.');
    expect(html).toContain('Create Organisation');
    expect(html).not.toContain('hackathon participant');
  });

  it('7. Renders Operator Console CTA alongside Create Organisation for Platform Admin with zero tenant orgs', async () => {
    const OrgContextModule = await import('@/api/OrgContext');
    const AuthContextModule = await import('@/api/AuthContext');

    vi.spyOn(OrgContextModule, 'useOrg').mockReturnValueOnce({
      activeOrg: null,
      organisations: [],
      activeDetails: null,
      isLoading: false,
      switchOrg: vi.fn(),
      refreshOrganisations: vi.fn(),
      createOrganisation: vi.fn(),
    });

    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValueOnce({
      user: {
        id: 'platform-admin-1',
        fullName: 'Super Admin',
        email: 'superadmin@managex.internal',
        isPlatformAdmin: true,
        platformRole: 'platform_super_admin',
        status: 'active',
      },
      isLoading: false,
      isAuthenticated: true,
      refreshUser: vi.fn(),
      logout: vi.fn(),
    });

    const html = renderToStaticMarkup(
      <MemoryRouter>
        <WorkspaceOverviewPage />
      </MemoryRouter>
    );

    expect(html).toContain('Platform Administrator Workspace');
    expect(html).toContain('Open Operator Console');
    expect(html).toContain('Create Organisation');
  });
});
