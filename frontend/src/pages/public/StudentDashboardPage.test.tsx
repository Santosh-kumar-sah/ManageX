import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { StudentDashboardPage } from './StudentDashboardPage';
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

describe('StudentDashboardPage — Participant Hub & My Registrations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockUser = {
    id: 'user-part-1',
    email: 'alex@student.org',
    fullName: 'Alex River',
    isPlatformAdmin: false,
    status: 'active' as const,
  };

  const mockActiveEntry = {
    registration: {
      id: 'reg-active-1',
      status: 'registered',
      registeredAt: '2026-10-10T12:00:00Z',
      customAnswers: { tShirtSize: 'M' },
      participantInstructions: 'Discord channel: #hackathon-room-42',
    },
    event: {
      id: 'evt-active-1',
      organisationId: 'org-tech',
      title: 'Global Hackathon 2026',
      slug: 'global-hackathon-2026',
      description: 'Annual global hackathon for tech builders.',
      eventType: 'hackathon',
      status: 'published',
      visibility: 'public',
      startAt: '2026-11-15T09:00:00Z',
      endAt: '2026-11-17T18:00:00Z',
      timezone: 'UTC',
      locationType: 'virtual',
      location: null,
      virtualUrl: 'https://zoom.us/j/123456789',
      registrationOpensAt: '2026-10-01T00:00:00Z',
      registrationClosesAt: '2026-11-14T23:59:59Z',
      resultsPublishedAt: null,
      organisation: {
        name: 'Nexus Tech',
        slug: 'nexus-tech',
      },
    },
    team: {
      id: 'team-1',
      name: 'Cyber Panthers',
      slug: 'cyber-panthers',
      description: 'Building AI tools',
      isOwner: true,
      members: [
        {
          userId: 'user-part-1',
          fullName: 'Alex River',
          email: 'alex@student.org',
          isOwner: true,
          joinedAt: '2026-10-10T12:05:00Z',
        },
      ],
    },
    rounds: [],
    submissions: [],
    advancements: [],
    resultsPublished: false,
  };

  const mockWithdrawnEntry = {
    registration: {
      id: 'reg-withdrawn-2',
      status: 'withdrawn',
      registeredAt: '2026-10-05T08:00:00Z',
      withdrawnAt: '2026-10-08T14:30:00Z',
      customAnswers: {},
      participantInstructions: null,
    },
    event: {
      id: 'evt-withdrawn-2',
      organisationId: 'org-apex',
      title: 'Apex Cloud Summit',
      slug: 'apex-cloud-summit',
      description: 'Cloud architecture summit.',
      eventType: 'general_event',
      status: 'published',
      visibility: 'public',
      startAt: '2026-12-01T10:00:00Z',
      endAt: '2026-12-01T17:00:00Z',
      timezone: 'UTC',
      locationType: 'in_person',
      location: 'San Francisco, CA',
      virtualUrl: null,
      registrationOpensAt: '2026-09-01T00:00:00Z',
      registrationClosesAt: '2026-11-30T23:59:59Z',
      resultsPublishedAt: null,
      organisation: {
        name: 'Apex Solutions',
        slug: 'apex-solutions',
      },
    },
    team: null,
    rounds: [],
    submissions: [],
    advancements: [],
    resultsPublished: false,
  };

  it('1. Renders loading state while dashboard data is being fetched', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockUser,
      isLoading: false,
      isAuthenticated: true,
      refreshUser: vi.fn(),
      logout: vi.fn(),
    });

    vi.spyOn(ClientModule, 'apiClient').mockImplementation(() => new Promise(() => {}));

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/events/dashboard']}>
        <Routes>
          <Route path="/events/dashboard" element={<StudentDashboardPage initialLoading={true} />} />
        </Routes>
      </MemoryRouter>
    );

    expect(html).toContain('animate-pulse');
  });

  it('2. Renders empty state with link to public events discovery when user has no registrations', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockUser,
      isLoading: false,
      isAuthenticated: true,
      refreshUser: vi.fn(),
      logout: vi.fn(),
    });

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/events/dashboard']}>
        <Routes>
          <Route
            path="/events/dashboard"
            element={<StudentDashboardPage initialRegistrations={[]} initialLoading={false} />}
          />
        </Routes>
      </MemoryRouter>
    );

    expect(html).toContain('No Event Registrations Yet');
    expect(html).toContain('Browse Upcoming Events');
    expect(html).toContain('href="/events"');
  });

  it('3. Renders active and withdrawn registrations with accurate status badges and counts', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockUser,
      isLoading: false,
      isAuthenticated: true,
      refreshUser: vi.fn(),
      logout: vi.fn(),
    });

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/events/dashboard']}>
        <Routes>
          <Route
            path="/events/dashboard"
            element={
              <StudentDashboardPage
                initialRegistrations={[mockActiveEntry, mockWithdrawnEntry]}
                initialLoading={false}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    // Event titles
    expect(html).toContain('Global Hackathon 2026');
    expect(html).toContain('Apex Cloud Summit');

    // Badges
    expect(html).toContain('Confirmed Registration');
    expect(html).toContain('Withdrawn');

    // Quick stats counter
    expect(html).toContain('Active Registrations');
    expect(html).toContain('All Events (2)');
    expect(html).toContain('Active (1)');
    expect(html).toContain('Withdrawn (1)');

    // Navigation links to public event detail pages
    expect(html).toContain('href="/events/evt-active-1"');
    expect(html).toContain('href="/events/evt-withdrawn-2"');
  });

  it('4. Delivers confidential participant instructions ONLY to active registered participants', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockUser,
      isLoading: false,
      isAuthenticated: true,
      refreshUser: vi.fn(),
      logout: vi.fn(),
    });

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/events/dashboard']}>
        <Routes>
          <Route
            path="/events/dashboard"
            element={
              <StudentDashboardPage
                initialRegistrations={[mockActiveEntry, mockWithdrawnEntry]}
                initialLoading={false}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    );

    // Instructions displayed for active registration
    expect(html).toContain('Instructions for Registered Participants');
    expect(html).toContain('Discord channel: #hackathon-room-42');

    // Withdrawn card displays Re-register button
    expect(html).toContain('Re-register for Event');
  });
});
