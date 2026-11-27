import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { EventPortalLayout } from '@/layouts/EventPortalLayout';
import { EventsPortalHomePage } from './EventsPortalHomePage';
import { StudentDashboardPage } from './StudentDashboardPage';
import * as AuthModule from '@/api/AuthContext';
import * as ClientModule from '@/api/client';

describe('Event Portal & Student Experience Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('EventPortalLayout', () => {
    it('1. Logo navigates to /events and displays ManageX Events branding', () => {
      vi.spyOn(AuthModule, 'useAuth').mockReturnValue({
        user: null,
        isLoading: false,
        isAuthenticated: false,
        refreshUser: vi.fn(),
        logout: vi.fn(),
      });

      const html = renderToStaticMarkup(
        <MemoryRouter initialEntries={['/events']}>
          <EventPortalLayout />
        </MemoryRouter>
      );

      // Logo links to /events
      expect(html).toContain('href="/events"');
      expect(html).toContain('ManageX');
      expect(html).toContain('Events');
      // Contains platform home link
      expect(html).toContain('href="/"');
      expect(html).toContain('ManageX home');
      // Unauthenticated state shows Sign in
      expect(html).toContain('Sign in');
    });

    it('2. Authenticated participant sees profile greeting, dashboard link, and Sign out', () => {
      vi.spyOn(AuthModule, 'useAuth').mockReturnValue({
        user: {
          id: 'user-std-1',
          email: 'student@managex.local',
          fullName: 'Alex Student',
          isPlatformAdmin: false,
          status: 'active',
        },
        isLoading: false,
        isAuthenticated: true,
        refreshUser: vi.fn(),
        logout: vi.fn(),
      });

      const html = renderToStaticMarkup(
        <MemoryRouter initialEntries={['/events']}>
          <EventPortalLayout />
        </MemoryRouter>
      );

      // Should show user identity
      expect(html).toContain('Alex Student');
      // Should show My events navigation
      expect(html).toContain('href="/events/dashboard"');
      expect(html).toContain('My events');
      // Should show Sign out
      expect(html).toContain('Sign out');
      // Should NOT show Sign in or Get Started
      expect(html).not.toContain('>Sign in<');
    });
  });

  describe('StudentDashboardPage', () => {
    it('3. Renders empty state gracefully when user has no registrations', () => {
      vi.spyOn(AuthModule, 'useAuth').mockReturnValue({
        user: {
          id: 'user-std-1',
          email: 'student@managex.local',
          fullName: 'Alex Student',
          isPlatformAdmin: false,
          status: 'active',
        },
        isLoading: false,
        isAuthenticated: true,
        refreshUser: vi.fn(),
        logout: vi.fn(),
      });

      vi.spyOn(ClientModule, 'apiClient').mockResolvedValue({
        success: true,
        data: {
          registrations: [],
        },
      });

      const html = renderToStaticMarkup(
        <MemoryRouter initialEntries={['/events/dashboard']}>
          <StudentDashboardPage initialRegistrations={[]} />
        </MemoryRouter>
      );

      expect(html).toContain('My events');
      expect(html).toContain('Alex Student');
      expect(html).toContain('No registrations yet');
      expect(html).toContain('Browse public events');
    });
  });

  describe('EventsPortalHomePage', () => {
    it('4. Renders portal hero and search inputs', () => {
      const html = renderToStaticMarkup(
        <MemoryRouter initialEntries={['/events']}>
          <EventsPortalHomePage />
        </MemoryRouter>
      );

      expect(html).toContain('Events &amp; hackathons');
      expect(html).toContain('Search public events');
      expect(html).toContain('for="public-event-search"');
      expect(html).toContain('aria-pressed="true"');
      expect(html).toContain('role="status"');
      expect(html).toContain('Hackathons');
      expect(html).toContain('General events');
    });
  });
});
