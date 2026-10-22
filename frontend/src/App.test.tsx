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

describe('App Routing — Organisation-First Alignment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. /events route is configured to redirect to /', () => {
    const appElement = App();
    const routes = Array.isArray(appElement.props.children)
      ? appElement.props.children
      : [appElement.props.children];

    const publicLayoutRoute = routes.find(
      (r: any) => r?.props?.element?.type?.name === 'PublicLayout'
    );
    expect(publicLayoutRoute).toBeDefined();

    const children = Array.isArray(publicLayoutRoute.props.children)
      ? publicLayoutRoute.props.children
      : [publicLayoutRoute.props.children];

    const eventsRoute = children.find((r: any) => r?.props?.path === '/events');
    expect(eventsRoute).toBeDefined();
    expect(eventsRoute.props.element.props.to).toBe('/');
    expect(eventsRoute.props.element.props.replace).toBe(true);
  });

  it('2. /events/:eventId directly routes to PublicEventDetailPage', () => {
    const appElement = App();
    const routes = Array.isArray(appElement.props.children)
      ? appElement.props.children
      : [appElement.props.children];

    const publicLayoutRoute = routes.find(
      (r: any) => r?.props?.element?.type?.name === 'PublicLayout'
    );
    expect(publicLayoutRoute).toBeDefined();

    const children = Array.isArray(publicLayoutRoute.props.children)
      ? publicLayoutRoute.props.children
      : [publicLayoutRoute.props.children];

    const eventDetailRoute = children.find(
      (r: any) => r?.props?.path === '/events/:eventId'
    );
    expect(eventDetailRoute).toBeDefined();
    expect(eventDetailRoute.props.element.type.name).toBe('PublicEventDetailPage');
  });

  it('3. /events renders Navigate component and never displays a public directory', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/events']}>
        <App />
      </MemoryRouter>
    );

    // Global events directory header and search controls must NOT be present
    expect(html).not.toContain('Public Directory');
    expect(html).not.toContain('Search events by title or keyword...');
  });
});
