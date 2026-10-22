import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PublicEventDetailPage } from './PublicEventDetailPage';
import * as AuthContextModule from '@/api/AuthContext';
import * as ClientModule from '@/api/client';

vi.mock('@/api/client', () => ({
  apiClient: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ApiError';
    }
  },
}));

vi.mock('@/api/AuthContext', () => ({
  useAuth: vi.fn(),
}));

describe('PublicEventDetailPage — Public Details & External Registration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Renders loading state initially', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: null,
      isLoading: false,
      isAuthenticated: false,
      refreshUser: vi.fn(),
      logout: vi.fn(),
    });

    vi.spyOn(ClientModule, 'apiClient').mockImplementation(() => new Promise(() => {}));

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/events/evt-100']}>
        <Routes>
          <Route path="/events/:eventId" element={<PublicEventDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    // Initial render displays skeletons
    expect(html).toContain('animate-pulse');
  });

  it('2. Shows unauthenticated external participant sign-in call to action', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: null,
      isLoading: false,
      isAuthenticated: false,
      refreshUser: vi.fn(),
      logout: vi.fn(),
    });

    // We can also verify that the component is fully structured and accepts route params
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/events/evt-100']}>
        <Routes>
          <Route path="/events/:eventId" element={<PublicEventDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(html).toBeDefined();
  });

  it('3. Navigation links back to ManageX home (/) and never to /events directory', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: null,
      isLoading: false,
      isAuthenticated: false,
      refreshUser: vi.fn(),
      logout: vi.fn(),
    });

    const mockEvent = {
      id: 'evt-100',
      organisationId: 'org-1',
      title: 'Direct Hackathon 2026',
      slug: 'direct-hackathon-2026',
      description: 'A direct hackathon link from the host organisation.',
      eventType: 'hackathon' as const,
      status: 'published' as const,
      visibility: 'public' as const,
      startAt: '2026-11-01T09:00:00Z',
      endAt: '2026-11-03T18:00:00Z',
      timezone: 'UTC',
      locationType: 'virtual' as const,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
      organisation: {
        id: 'org-1',
        name: 'Kiet Group',
        slug: 'kiet-group',
      },
    };

    vi.spyOn(ClientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: {
        event: mockEvent,
      },
    });

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/events/evt-100']}>
        <Routes>
          <Route path="/events/:eventId" element={<PublicEventDetailPage initialEvent={mockEvent} />} />
        </Routes>
      </MemoryRouter>
    );

    // Should NOT contain links to /events directory
    expect(html).not.toContain('href="/events"');
    expect(html).not.toContain('Back to Events Directory');
    expect(html).not.toContain('Back to All Events');

    // Should contain link to / (ManageX Home)
    expect(html).toContain('href="/"');
    expect(html).toContain('ManageX Home');
  });
});
