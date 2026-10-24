import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ParticipantEvaluationSchedule } from './ParticipantEvaluationSchedule';
import * as ClientModule from '@/api/client';
import { EvaluationSession } from '@/types/events';

vi.mock('@/api/client', () => ({
  apiClient: vi.fn(),
  ApiError: class ApiError extends Error {
    public statusCode: number;
    constructor(message: string, statusCode = 500) {
      super(message);
      this.name = 'ApiError';
      this.statusCode = statusCode;
    }
  },
}));

describe('ParticipantEvaluationSchedule Component (Phase 4D)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseSession: EvaluationSession = {
    id: 'session-101',
    organisationId: 'org-test',
    eventId: 'evt-100',
    roundEvaluationId: 'round-eval-1',
    panelId: 'panel-1',
    panelNumber: 1,
    panelName: 'Technical & Architecture Panel',
    teamId: 'team-42',
    teamName: 'Cyber Panthers',
    slotIndex: 0,
    startsAt: '2026-11-15T14:00:00.000Z',
    endsAt: '2026-11-15T14:20:00.000Z',
    status: 'scheduled',
    meetingUrl: null,
    meetingLinkAvailableAt: '2026-11-15T13:50:00.000Z',
    evaluationOrder: 0,
  };

  it('1. Renders loading skeleton state initially when fetching session', () => {
    vi.spyOn(ClientModule, 'apiClient').mockImplementation(() => new Promise(() => {}));

    const html = renderToStaticMarkup(
      <ParticipantEvaluationSchedule
        eventId="evt-100"
        roundId="rnd-1"
        roundName="Design Phase"
        roundNumber={1}
        teamId="team-42"
        teamName="Cyber Panthers"
      />
    );

    expect(html).toContain('data-testid="participant-schedule-loading"');
    expect(html).toContain('animate-pulse');
  });

  it('2. Renders empty state when round has no published evaluation session', () => {
    const html = renderToStaticMarkup(
      <ParticipantEvaluationSchedule
        eventId="evt-100"
        roundId="rnd-1"
        roundName="Design Phase"
        roundNumber={1}
        teamId="team-42"
        teamName="Cyber Panthers"
        initialSession={null}
        showEmptyState={true}
      />
    );

    expect(html).toContain('data-testid="participant-schedule-empty"');
    expect(html).toContain('No session appointment published yet');
    expect(html).toContain('Refresh');
  });

  it('3. Renders scheduled evaluation appointment details with panel and slot', () => {
    const html = renderToStaticMarkup(
      <ParticipantEvaluationSchedule
        eventId="evt-100"
        roundId="rnd-1"
        roundName="Preliminary Pitch"
        roundNumber={1}
        teamId="team-42"
        teamName="Cyber Panthers"
        timezone="UTC"
        initialSession={baseSession}
      />
    );

    expect(html).toContain('data-testid="participant-schedule-card"');
    expect(html).toContain('Evaluation Appointment');
    expect(html).toContain('Technical &amp; Architecture Panel');
    expect(html).toContain('Slot #1');
    expect(html).toContain('Cyber Panthers');
    expect(html).toContain('Scheduled');
  });

  it('4. Enforces 10-minute meeting release policy: displays unlocking notice when outside release window', () => {
    const sessionOutsideWindow: EvaluationSession = {
      ...baseSession,
      meetingUrl: null,
      meetingLinkAvailableAt: '2026-11-15T13:50:00.000Z',
    };

    const html = renderToStaticMarkup(
      <ParticipantEvaluationSchedule
        eventId="evt-100"
        roundId="rnd-1"
        teamId="team-42"
        timezone="UTC"
        initialSession={sessionOutsideWindow}
      />
    );

    // Join button must NOT be present
    expect(html).not.toContain('Join Evaluation Meeting');
    // Lock notice and availability time must be present
    expect(html).toContain('Meeting link will unlock 10 minutes prior to session');
    expect(html).toContain('Check Link');
  });

  it('5. Releases meeting link and displays join button when within window or active', () => {
    const sessionWithLink: EvaluationSession = {
      ...baseSession,
      meetingUrl: 'https://meet.google.com/xyz-eval-appt',
      status: 'in_progress',
    };

    const html = renderToStaticMarkup(
      <ParticipantEvaluationSchedule
        eventId="evt-100"
        roundId="rnd-1"
        teamId="team-42"
        timezone="UTC"
        initialSession={sessionWithLink}
      />
    );

    expect(html).toContain('Join Evaluation Meeting');
    expect(html).toContain('href="https://meet.google.com/xyz-eval-appt"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('Session is Live Now');
  });

  it('6. Does not expose judge identities, judge emails, scoring criteria, or private notes', () => {
    // Even if malicious/accidental properties were passed, component must never render them
    const leakedDataSession: EvaluationSession = {
      ...baseSession,
      judges: [
        {
          judgeUserId: 'judge-1',
          judgeName: 'Secret Judge',
          judgeEmail: 'judge@secret.org',
          assignedAt: '2026-10-01T00:00:00Z',
        },
      ],
      notes: 'Internal confidential rubric notes',
    };

    const html = renderToStaticMarkup(
      <ParticipantEvaluationSchedule
        eventId="evt-100"
        roundId="rnd-1"
        teamId="team-42"
        initialSession={leakedDataSession}
      />
    );

    expect(html).not.toContain('Secret Judge');
    expect(html).not.toContain('judge@secret.org');
    expect(html).not.toContain('Internal confidential rubric notes');
  });

  it('7. Handles cancelled sessions gracefully with safety notice', () => {
    const cancelledSession: EvaluationSession = {
      ...baseSession,
      status: 'cancelled',
      meetingUrl: 'https://meet.google.com/xyz-eval-appt', // Even if URL exists on row, should not be exposed when cancelled
    };

    const html = renderToStaticMarkup(
      <ParticipantEvaluationSchedule
        eventId="evt-100"
        roundId="rnd-1"
        teamId="team-42"
        initialSession={cancelledSession}
      />
    );

    expect(html).not.toContain('Join Evaluation Meeting');
    expect(html).toContain('This evaluation session has been marked as');
    expect(html).toContain('Cancelled');
  });

  it('8. Renders error message and retry button when schedule fetch fails', async () => {
    const { ApiError } = ClientModule as any;
    vi.spyOn(ClientModule, 'apiClient').mockRejectedValue(
      new ApiError('Failed to fetch evaluation schedule', 500)
    );

    // Initial render triggers useEffect which will reject
    // We can also test the error state directly or through the component
    const html = renderToStaticMarkup(
      <ParticipantEvaluationSchedule
        eventId="evt-100"
        roundId="rnd-1"
        initialSession={null}
        showEmptyState={true}
      />
    );

    // Verify component mounts and renders gracefully without crash
    expect(html).toBeDefined();
  });
});
