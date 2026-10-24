import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  cancelEvaluationSession,
  completeEvaluationRequest,
  EvaluationPage,
  generateEvaluationSchedule,
  publishEvaluationSchedule,
  rescheduleEvaluationSession,
} from './EvaluationPage';
import * as OrgContextModule from '@/api/OrgContext';
import * as ClientModule from '@/api/client';

vi.mock('@/api/OrgContext', () => ({
  useOrg: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  apiClient: vi.fn(),
  ApiError: class ApiError extends Error {
    statusCode = 403;
    constructor(message: string) {
      super(message);
      this.name = 'ApiError';
    }
  },
}));

function renderPage() {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/app/organisations/org-1/events/event-1/rounds/round-1/evaluation']}>
      <Routes>
        <Route
          path="/app/organisations/:orgId/events/:eventId/rounds/:roundId/evaluation"
          element={<EvaluationPage initialLoading={false} />}
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('EvaluationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(OrgContextModule, 'useOrg').mockReturnValue({
      organisations: [],
      activeOrg: null,
      activeDetails: null,
      isLoading: false,
      switchOrg: vi.fn(),
      refreshOrganisations: vi.fn(),
      createOrganisation: vi.fn(),
    });
  });

  it('fails closed when the user has no evaluation permission', () => {
    const html = renderPage();
    expect(html).toContain('Evaluation access restricted');
    expect(ClientModule.apiClient).not.toHaveBeenCalled();
  });

  it('renders the organiser evaluation sections when evaluation permissions are present', () => {
    vi.spyOn(OrgContextModule, 'useOrg').mockReturnValue({
      organisations: [],
      activeOrg: null,
      activeDetails: {
        organisation: { id: 'org-1', name: 'Org', slug: 'org', status: 'active' },
        membership: {
          id: 'membership-1',
          role: { slug: 'event_admin', name: 'Event Admin' },
          permissions: [
            'event.evaluation.view',
            'event.evaluation.manage',
            'event.evaluation.judge.manage',
            'event.evaluation.schedule.manage',
            'event.evaluation.schedule.publish',
          ],
        },
      },
      isLoading: false,
      switchOrg: vi.fn(),
      refreshOrganisations: vi.fn(),
      createOrganisation: vi.fn(),
    });
    vi.spyOn(ClientModule, 'apiClient').mockResolvedValue({
      success: true,
      data: { configured: false, panels: [], sessions: [], members: [], teams: [] },
    });

    const html = renderPage();
    expect(html).toContain('Round evaluation configuration');
    expect(html).toContain('Evaluation panels');
    expect(html).toContain('Session schedule');
    expect(html).toContain('Invitations and completion');
  });

  it('generates schedules without overwrite by default and requires explicit overwrite confirmation in the page', async () => {
    const request = vi.fn().mockResolvedValue({ success: true });
    await generateEvaluationSchedule('/organisations/org-1/events/event-1/rounds/round-1/evaluation', '2026-10-24T10:00:00.000Z', false, request);
    expect(request).toHaveBeenCalledWith(
      '/organisations/org-1/events/event-1/rounds/round-1/evaluation/schedule/generate',
      { method: 'POST', body: JSON.stringify({ startsAt: '2026-10-24T10:00:00.000Z', overwriteExisting: false }) }
    );
    await generateEvaluationSchedule('/organisations/org-1/events/event-1/rounds/round-1/evaluation', '2026-10-24T10:00:00.000Z', true, request);
    expect(request).toHaveBeenLastCalledWith(
      '/organisations/org-1/events/event-1/rounds/round-1/evaluation/schedule/generate',
      { method: 'POST', body: JSON.stringify({ startsAt: '2026-10-24T10:00:00.000Z', overwriteExisting: true }) }
    );

    const html = renderPage();
    expect(html).not.toContain('Generate and replace');
  });

  it('uses the dedicated cancellation endpoint', async () => {
    const request = vi.fn().mockResolvedValue({ success: true });
    await cancelEvaluationSession('/evaluation', 'session-1', 'Judge unavailable', request);
    expect(request).toHaveBeenCalledWith('/evaluation/sessions/session-1/cancel', {
      method: 'POST',
      body: JSON.stringify({ cancellationReason: 'Judge unavailable' }),
    });
  });

  it('publishes and unpublishes schedules through their existing actions', async () => {
    const request = vi.fn().mockResolvedValue({ success: true });
    await publishEvaluationSchedule('/evaluation', 'publish', request);
    await publishEvaluationSchedule('/evaluation', 'unpublish', request);
    expect(request).toHaveBeenNthCalledWith(1, '/evaluation/publish', { method: 'POST' });
    expect(request).toHaveBeenNthCalledWith(2, '/evaluation/unpublish', { method: 'POST' });
  });

  it('completes evaluation and propagates API errors', async () => {
    const request = vi.fn().mockResolvedValue({ success: true });
    await completeEvaluationRequest('/evaluation', request);
    expect(request).toHaveBeenCalledWith('/evaluation/complete', { method: 'POST' });

    const failure = new Error('Completion prerequisites are incomplete');
    const failingRequest = vi.fn().mockRejectedValue(failure);
    await expect(completeEvaluationRequest('/evaluation', failingRequest)).rejects.toBe(failure);
  });

  it('reschedules a session with the backend contract and propagates conflicts', async () => {
    const request = vi.fn().mockResolvedValue({ success: true });
    await rescheduleEvaluationSession('/evaluation', 'session-1', {
      startsAt: '2026-10-24T10:00:00.000Z',
      endsAt: '2026-10-24T10:15:00.000Z',
      panelId: 'panel-1',
      meetingUrl: 'https://meet.example/session-1',
    }, request);
    expect(request).toHaveBeenCalledWith('/evaluation/sessions/session-1/reschedule', {
      method: 'PATCH',
      body: JSON.stringify({
        startsAt: '2026-10-24T10:00:00.000Z',
        endsAt: '2026-10-24T10:15:00.000Z',
        panelId: 'panel-1',
        meetingUrl: 'https://meet.example/session-1',
      }),
    });

    const conflict = new Error('Session conflicts with another appointment');
    const failingRequest = vi.fn().mockRejectedValue(conflict);
    await expect(rescheduleEvaluationSession('/evaluation', 'session-1', {
      startsAt: '2026-10-24T10:00:00.000Z',
      endsAt: '2026-10-24T10:15:00.000Z',
    }, failingRequest)).rejects.toBe(conflict);
  });
});
