import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Navigate, Outlet } from 'react-router-dom';
import { renderToStaticMarkup } from 'react-dom/server';
import { RequireAuth, RequirePlatformAdmin } from './RouteGuards';
import * as AuthContextModule from '@/api/AuthContext';

vi.mock('@/api/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useLocation: vi.fn(() => ({ pathname: '/app/protected', search: '', hash: '', state: null, key: 'test' })),
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
});
