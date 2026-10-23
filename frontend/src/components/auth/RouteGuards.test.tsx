import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Navigate, Outlet, MemoryRouter } from 'react-router-dom';
import { renderToStaticMarkup } from 'react-dom/server';
import { RequireAuth, RequirePlatformAdmin, RequireOrgAccess } from './RouteGuards';
import * as AuthContextModule from '@/api/AuthContext';
import * as OrgContextModule from '@/api/OrgContext';

vi.mock('@/api/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/api/OrgContext', () => ({
  useOrg: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useLocation: vi.fn(() => ({ pathname: '/app/protected', search: '', hash: '', state: null, key: 'test' })),
    useParams: vi.fn(() => ({ orgId: 'org-test-123' })),
  };
});

describe('RouteGuards — Role & Auth Protection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('RequireAuth', () => {
    it('1. Renders loading state while session is being verified', () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: null,
        isLoading: true,
        isAuthenticated: false,
        refreshUser: vi.fn(),
        logout: vi.fn(),
      });

      const element = RequireAuth();
      const html = renderToStaticMarkup(element);

      expect(html).toContain('Verifying session...');
    });

    it('2. Returns Navigate to /auth/login with location state for unauthenticated requests', () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: null,
        isLoading: false,
        isAuthenticated: false,
        refreshUser: vi.fn(),
        logout: vi.fn(),
      });

      const element = RequireAuth();

      expect(element.type).toBe(Navigate);
      expect(element.props.to).toBe('/auth/login');
      expect(element.props.replace).toBe(true);
      expect(element.props.state?.from).toEqual({
        pathname: '/app/protected',
        search: '',
        hash: '',
        state: null,
        key: 'test',
      });
    });

    it('3. Renders Outlet for verified authenticated users', () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: {
          id: 'user-1',
          email: 'member@example.com',
          fullName: 'Jane Doe',
          isPlatformAdmin: false,
          status: 'active',
        },
        isLoading: false,
        isAuthenticated: true,
        refreshUser: vi.fn(),
        logout: vi.fn(),
      });

      const element = RequireAuth();
      expect(element.type).toBe(Outlet);
    });
  });

  describe('RequirePlatformAdmin', () => {
    it('1. Renders loading state while platform authorization is being verified', () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: null,
        isLoading: true,
        isAuthenticated: false,
        refreshUser: vi.fn(),
        logout: vi.fn(),
      });

      const element = RequirePlatformAdmin();
      const html = renderToStaticMarkup(element);

      expect(html).toContain('Verifying platform authorization...');
    });

    it('2. Redirects unauthenticated users to /auth/login', () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: null,
        isLoading: false,
        isAuthenticated: false,
        refreshUser: vi.fn(),
        logout: vi.fn(),
      });

      const element = RequirePlatformAdmin();

      expect(element.type).toBe(Navigate);
      expect(element.props.to).toBe('/auth/login');
      expect(element.props.replace).toBe(true);
    });

    it('3. Redirects authenticated non-platform users away to /app', () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: {
          id: 'user-org-member',
          email: 'student@example.com',
          fullName: 'Alice Member',
          isPlatformAdmin: false,
          status: 'active',
        },
        isLoading: false,
        isAuthenticated: true,
        refreshUser: vi.fn(),
        logout: vi.fn(),
      });

      const element = RequirePlatformAdmin();

      expect(element.type).toBe(Navigate);
      expect(element.props.to).toBe('/app');
      expect(element.props.replace).toBe(true);
    });

    it('4. Renders platform console Outlet for verified platform super admins', () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: {
          id: 'super-admin-1',
          email: 'admin@managex.internal',
          fullName: 'Platform Super Admin',
          isPlatformAdmin: true,
          platformRole: 'platform_super_admin',
          status: 'active',
        },
        isLoading: false,
        isAuthenticated: true,
        refreshUser: vi.fn(),
        logout: vi.fn(),
      });

      const element = RequirePlatformAdmin();
      expect(element.type).toBe(Outlet);
    });
  });

  describe('RequireOrgAccess — Persona & Tenant Boundary Enforcement', () => {
    it('1. Renders loading state while organisation context is loading', () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: { id: 'u1', email: 'u1@test.com', fullName: 'User 1', isPlatformAdmin: false, status: 'active' },
        isLoading: false,
        isAuthenticated: true,
        refreshUser: vi.fn(),
        logout: vi.fn(),
      });
      vi.spyOn(OrgContextModule, 'useOrg').mockReturnValue({
        organisations: [],
        activeOrg: null,
        activeDetails: null,
        isLoading: true,
        switchOrg: vi.fn(),
        refreshOrganisations: vi.fn(),
        createOrganisation: vi.fn(),
      });

      const element = RequireOrgAccess();
      const html = renderToStaticMarkup(element);
      expect(html).toContain('Verifying organisation access...');
    });

    it('2. Redirects unauthenticated users to /auth/login', () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: null,
        isLoading: false,
        isAuthenticated: false,
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

      const element = RequireOrgAccess();
      expect(element.type).toBe(Navigate);
      expect(element.props.to).toBe('/auth/login');
    });

    it('3. Renders fail-closed Access Restricted card with participant CTA when student (0 orgs) accesses org route', () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: { id: 'student-1', email: 'student@example.com', fullName: 'Student Sam', isPlatformAdmin: false, status: 'active' },
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

      const element = RequireOrgAccess();
      const html = renderToStaticMarkup(<MemoryRouter>{element}</MemoryRouter>);

      expect(html).toContain('Organisation Access Restricted');
      expect(html).toContain('Participant / Student account without an active organisation membership');
      expect(html).toContain('Participant Dashboard');
      expect(html).toContain('Browse Public Events');
    });

    it('4. Blocks non-member user who belongs to other orgs with return to workspace CTA', () => {
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: { id: 'member-1', email: 'member@other.com', fullName: 'Other Org Member', isPlatformAdmin: false, status: 'active' },
        isLoading: false,
        isAuthenticated: true,
        refreshUser: vi.fn(),
        logout: vi.fn(),
      });
      vi.spyOn(OrgContextModule, 'useOrg').mockReturnValue({
        organisations: [
          {
            id: 'org-other-888',
            name: 'Other Org',
            slug: 'other-org',
            status: 'active',
            createdAt: '2026-01-01',
            memberCount: 5,
            role: { slug: 'member', name: 'Member' },
          },
        ],
        activeOrg: null,
        activeDetails: null,
        isLoading: false,
        switchOrg: vi.fn(),
        refreshOrganisations: vi.fn(),
        createOrganisation: vi.fn(),
      });

      const element = RequireOrgAccess();
      const html = renderToStaticMarkup(<MemoryRouter>{element}</MemoryRouter>);

      expect(html).toContain('Organisation Access Restricted');
      expect(html).toContain('You do not have active membership in this organisation');
      expect(html).toContain('Return to Your Workspace');
    });

    it('5. Renders Outlet when user is an active member of the route organisation', () => {
      const mockSwitchOrg = vi.fn();
      vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
        user: { id: 'owner-1', email: 'owner@managex.dev', fullName: 'Org Owner', isPlatformAdmin: false, status: 'active' },
        isLoading: false,
        isAuthenticated: true,
        refreshUser: vi.fn(),
        logout: vi.fn(),
      });
      vi.spyOn(OrgContextModule, 'useOrg').mockReturnValue({
        organisations: [
          {
            id: 'org-test-123',
            name: 'Test Org',
            slug: 'test-org',
            status: 'active',
            createdAt: '2026-01-01',
            memberCount: 1,
            role: { slug: 'organisation_owner', name: 'Organisation Owner' },
          },
        ],
        activeOrg: {
          id: 'org-test-123',
          name: 'Test Org',
          slug: 'test-org',
          status: 'active',
          createdAt: '2026-01-01',
          memberCount: 1,
          role: { slug: 'organisation_owner', name: 'Organisation Owner' },
        },
        activeDetails: null,
        isLoading: false,
        switchOrg: mockSwitchOrg,
        refreshOrganisations: vi.fn(),
        createOrganisation: vi.fn(),
      });

      const element = RequireOrgAccess();
      expect(element.type).toBe(Outlet);
    });
  });
});
