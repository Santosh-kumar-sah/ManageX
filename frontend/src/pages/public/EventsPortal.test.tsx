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
      expect(html).toContain('Platform Home');
      // Unauthenticated state shows Sign In
      expect(html).toContain('Sign In');
    });

    it('2. Authenticated participant sees profile greeting, dashboard link, and Log Out', () => {
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
      // Should show My Dashboard navigation
      expect(html).toContain('href="/events/dashboard"');
      expect(html).toContain('My Dashboard');
      // Should show Log Out
      expect(html).toContain('Log Out');
      // Should NOT show Sign In or Get Started
      expect(html).not.toContain('>Sign In<');
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

      expect(html).toContain('Participant Dashboard');
      expect(html).toContain('Alex Student');
      expect(html).toContain('No Event Registrations Yet');
      expect(html).toContain('Browse Upcoming Events');
    });
  });

  describe('EventsPortalHomePage', () => {
    it('4. Renders portal hero and search inputs', () => {
      const html = renderToStaticMarkup(
        <MemoryRouter initialEntries={['/events']}>
          <EventsPortalHomePage />
        </MemoryRouter>
      );

      expect(html).toContain('Events &amp; Hackathons');
      expect(html).toContain('Search events by title or keywords...');
      expect(html).toContain('Hackathons');
      expect(html).toContain('General Events');
    });
  });
});
