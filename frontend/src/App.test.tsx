import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';

vi.mock('@/api/AuthContext', () => ({
  useAuth: vi.fn().mockReturnValue({
    user: null,
    isLoading: false,
    isAuthenticated: false,
    refreshUser: vi.fn(),
    logout: vi.fn(),
  }),
}));

vi.mock('@/api/OrgContext', () => ({
  useOrg: vi.fn().mockReturnValue({
    organisations: [],
    activeOrg: null,
    activeDetails: null,
    isLoading: false,
    switchOrg: vi.fn(),
    refreshOrganisations: vi.fn(),
    createOrganisation: vi.fn(),
  }),
}));

vi.mock('@/api/client', () => ({
  apiClient: vi.fn().mockResolvedValue({
    success: true,
    data: {},
  }),
  ApiError: class ApiError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ApiError';
    }
  },
}));

describe('App Routing — Event Portal & Platform Navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. /events route is configured to render EventsPortalHomePage under EventPortalLayout', () => {
    const appElement = App();
    const routes = Array.isArray(appElement.props.children)
      ? appElement.props.children
      : [appElement.props.children];

    const portalLayoutRoute = routes.find(
      (r: any) => r?.props?.element?.type?.name === 'EventPortalLayout'
    );
    expect(portalLayoutRoute).toBeDefined();

    const children = Array.isArray(portalLayoutRoute.props.children)
      ? portalLayoutRoute.props.children
      : [portalLayoutRoute.props.children];

    const eventsRoute = children.find((r: any) => r?.props?.path === '/events');
    expect(eventsRoute).toBeDefined();
    expect(eventsRoute.props.element.type.name).toBe('EventsPortalHomePage');
  });

  it('2. /events/:eventId routes to PublicEventDetailPage under EventPortalLayout', () => {
    const appElement = App();
    const routes = Array.isArray(appElement.props.children)
      ? appElement.props.children
      : [appElement.props.children];

    const portalLayoutRoute = routes.find(
      (r: any) => r?.props?.element?.type?.name === 'EventPortalLayout'
    );
    expect(portalLayoutRoute).toBeDefined();

    const children = Array.isArray(portalLayoutRoute.props.children)
      ? portalLayoutRoute.props.children
      : [portalLayoutRoute.props.children];

    const eventDetailRoute = children.find(
      (r: any) => r?.props?.path === '/events/:eventId'
    );
    expect(eventDetailRoute).toBeDefined();
    expect(eventDetailRoute.props.element.type.name).toBe('PublicEventDetailPage');
  });

  it('3. /events/dashboard routes to StudentDashboardPage protected by RequireAuth', () => {
    const appElement = App();
    const routes = Array.isArray(appElement.props.children)
      ? appElement.props.children
      : [appElement.props.children];

    const portalLayoutRoute = routes.find(
      (r: any) => r?.props?.element?.type?.name === 'EventPortalLayout'
    );
    expect(portalLayoutRoute).toBeDefined();

    const children = Array.isArray(portalLayoutRoute.props.children)
      ? portalLayoutRoute.props.children
      : [portalLayoutRoute.props.children];

    const authGuardRoute = children.find(
      (r: any) => r?.props?.element?.type?.name === 'RequireAuth'
    );
    expect(authGuardRoute).toBeDefined();

    const authChildren = Array.isArray(authGuardRoute.props.children)
      ? authGuardRoute.props.children
      : [authGuardRoute.props.children];

    const dashboardRoute = authChildren.find(
      (r: any) => r?.props?.path === '/events/dashboard'
    );
    expect(dashboardRoute).toBeDefined();
    expect(dashboardRoute.props.element.type.name).toBe('StudentDashboardPage');
  });

  it('4. Platform homepage / renders independently under PublicLayout', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );

    // Platform marketing navbar and content
    expect(html).toContain('ManageX');
    expect(html).toContain('Overview');
    expect(html).toContain('Security &amp; Privacy');
  });

  it('5. Static /events/dashboard route takes precedence before dynamic /events/:eventId', () => {
    const appElement = App();
    const routes = Array.isArray(appElement.props.children)
      ? appElement.props.children
      : [appElement.props.children];

    const portalLayoutRoute = routes.find(
      (r: any) => r?.props?.element?.type?.name === 'EventPortalLayout'
    );
    const children = Array.isArray(portalLayoutRoute.props.children)
      ? portalLayoutRoute.props.children
      : [portalLayoutRoute.props.children];

    const dashboardGuardIndex = children.findIndex(
      (r: any) => r?.props?.element?.type?.name === 'RequireAuth'
    );
    const eventDetailIndex = children.findIndex(
      (r: any) => r?.props?.path === '/events/:eventId'
    );

    expect(dashboardGuardIndex).toBeGreaterThan(-1);
    expect(eventDetailIndex).toBeGreaterThan(-1);
    expect(dashboardGuardIndex).toBeLessThan(eventDetailIndex);
  });
});
