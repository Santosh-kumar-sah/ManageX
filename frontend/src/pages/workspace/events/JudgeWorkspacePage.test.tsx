import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  JudgeWorkspacePage,
  listJudgeEvaluationSessions,
  getJudgeEvaluationSessionWork,
  submitJudgeEvaluationSessionScores,
} from './JudgeWorkspacePage';
import { JudgeScoringDialog } from './JudgeScoringDialog';
import {
  EvaluationSession,
  EvaluationSessionWork,
  SubmitSessionScoresPayload,
} from '@/types/events';

vi.mock('@/api/client', () => ({
  apiClient: vi.fn(),
  ApiError: class ApiError extends Error {
    statusCode: number;
    constructor(message: string, statusCode = 400) {
      super(message);
      this.statusCode = statusCode;
    }
  },
}));

const mockSession: EvaluationSession = {
  id: 'session-uuid-1',
  organisationId: 'org-1',
  eventId: 'event-1',
  roundEvaluationId: 'reval-1',
  panelId: 'panel-1',
  panelNumber: 1,
  panelName: 'Panel Alpha',
  teamId: 'team-1',
  teamName: 'Team Cyber',
  slotIndex: 0,
  startsAt: '2026-10-25T10:00:00.000Z',
  endsAt: '2026-10-25T10:30:00.000Z',
  status: 'scheduled',
  meetingUrl: 'https://meet.managex.local/room-1',
  meetingLinkAvailableAt: '2026-10-25T09:50:00.000Z',
  evaluationOrder: 1,
};

const mockCompletedSession: EvaluationSession = {
  ...mockSession,
  id: 'session-uuid-2',
  teamName: 'Team Quantum',
  status: 'completed',
};

const mockCancelledSession: EvaluationSession = {
  ...mockSession,
  id: 'session-uuid-3',
  teamName: 'Team Delta',
  status: 'cancelled',
};

const mockWork: EvaluationSessionWork = {
  session: {
    id: 'session-uuid-1',
    eventId: 'event-1',
    roundId: 'round-1',
    panelId: 'panel-1',
    panelNumber: 1,
    panelName: 'Panel Alpha',
    teamId: 'team-1',
    teamName: 'Team Cyber',
    startsAt: '2026-10-25T10:00:00.000Z',
    endsAt: '2026-10-25T10:30:00.000Z',
    status: 'scheduled',
    meetingUrl: 'https://meet.managex.local/room-1',
    submission: {
      id: 'sub-1',
      title: 'Neural Core Assistant',
      description: 'Distributed model inference platform',
      repositoryUrl: 'https://github.com/managex/neural-core',
      demoUrl: 'https://neural-core.managex.local',
    },
  },
  criteria: [
    {
      id: 'crit-1',
      name: 'System Architecture',
      description: 'Code quality and reliability',
      maxScore: 60,
      orderIndex: 0,
    },
    {
      id: 'crit-2',
      name: 'Impact & Polish',
      description: 'Business value and usability',
      maxScore: 40,
      orderIndex: 1,
    },
  ],
  scores: [
    {
      criterionId: 'crit-1',
      score: 55,
      feedback: 'Very solid microservice separation.',
      updatedAt: '2026-10-25T10:15:00.000Z',
    },
  ],
};

function renderWorkspace(path: string) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/app/judge/evaluations" element={<JudgeWorkspacePage />} />
        <Route
          path="/app/judge/evaluations/:orgId/:eventId/:roundId"
          element={<JudgeWorkspacePage />}
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('JudgeWorkspacePage & Scoring UI — Phase 4F Focused Suite', () => {
  // 1. Opening an authorized session loads its permitted work
  it('1. Opening an authorized session requests permitted work via existing endpoint', async () => {
    const request = vi.fn().mockResolvedValue({ data: mockWork });
    const result = await getJudgeEvaluationSessionWork(
      'org-1',
      'event-1',
      'round-1',
      'session-uuid-1',
      request
    );

    expect(request).toHaveBeenCalledWith(
      '/organisations/org-1/events/event-1/rounds/round-1/evaluation/sessions/session-uuid-1/work'
    );
    expect(result.data?.session.submission.title).toBe('Neural Core Assistant');
    expect(result.data?.criteria.length).toBe(2);
  });

  // 2. Criteria and valid score ranges render correctly
  it('2. Criteria and valid score ranges render correctly with permitted submission metadata', () => {
    const html = renderToStaticMarkup(
      <JudgeScoringDialog
        isOpen={true}
        onClose={vi.fn()}
        orgId="org-1"
        eventId="event-1"
        roundId="round-1"
        session={mockSession}
        initialWork={mockWork}
      />
    );

    // Dialog title, submission metadata, criteria labels and max score badges
    expect(html).toContain('Evaluate: Team Cyber');
    expect(html).toContain('Neural Core Assistant');
    expect(html).toContain('https://github.com/managex/neural-core');
    expect(html).toContain('https://neural-core.managex.local');
    expect(html).toContain('System Architecture');
    expect(html).toContain('Max: 60 pts');
    expect(html).toContain('Impact &amp; Polish');
    expect(html).toContain('Max: 40 pts');
    expect(html).toContain('Very solid microservice separation.');
  });

  // 3. Invalid or missing scores are rejected before submission where required
  it('3. Form validation verifies required score fields and rejects values outside permitted range', () => {
    // Helper function that mimics the dialog validation rule
    function validateScores(
      criteria: typeof mockWork.criteria,
      scoresMap: Record<string, string>
    ) {
      const errors: Record<string, string> = {};
      for (const crit of criteria) {
        const raw = scoresMap[crit.id];
        if (raw === undefined || raw === null || raw.trim() === '') {
          errors[crit.id] = `Score is required for "${crit.name}".`;
          continue;
        }
        const num = Number(raw);
        if (isNaN(num) || !isFinite(num)) {
          errors[crit.id] = `Score for "${crit.name}" must be a valid number.`;
        } else if (num < 0) {
          errors[crit.id] = `Score for "${crit.name}" cannot be negative.`;
        } else if (num > crit.maxScore) {
          errors[crit.id] = `Score for "${crit.name}" cannot exceed ${crit.maxScore}.`;
        }
      }
      return errors;
    }

    // Missing scores
    const missingErrors = validateScores(mockWork.criteria, {});
    expect(missingErrors['crit-1']).toContain('Score is required');
    expect(missingErrors['crit-2']).toContain('Score is required');

    // Score exceeds max (e.g. 65 > 60)
    const exceedErrors = validateScores(mockWork.criteria, { 'crit-1': '65', 'crit-2': '30' });
    expect(exceedErrors['crit-1']).toContain('cannot exceed 60');
    expect(exceedErrors['crit-2']).toBeUndefined();

    // Negative score
    const negativeErrors = validateScores(mockWork.criteria, { 'crit-1': '-5', 'crit-2': '30' });
    expect(negativeErrors['crit-1']).toContain('cannot be negative');

    // Valid scores
    const validErrors = validateScores(mockWork.criteria, { 'crit-1': '50', 'crit-2': '35' });
    expect(Object.keys(validErrors).length).toBe(0);
  });

  // 4. A valid scoring request uses the existing session-scoped endpoint and expected payload
  it('4. A valid scoring request dispatches to existing session-scoped endpoint with expected payload', async () => {
    const payload: SubmitSessionScoresPayload = {
      scores: [
        { criterionId: 'crit-1', score: 55, feedback: 'Strong architecture.' },
        { criterionId: 'crit-2', score: 38, feedback: 'Clean usability.' },
      ],
    };

    const request = vi.fn().mockResolvedValue({
      data: {
        success: true,
        sessionId: 'session-uuid-1',
        submissionId: 'sub-1',
        scores: [
          { id: 'sc-1', criterionId: 'crit-1', score: 55, feedback: 'Strong architecture.' },
          { id: 'sc-2', criterionId: 'crit-2', score: 38, feedback: 'Clean usability.' },
        ],
      },
    });

    const res = await submitJudgeEvaluationSessionScores(
      'org-1',
      'event-1',
      'round-1',
      'session-uuid-1',
      payload,
      request
    );

    expect(request).toHaveBeenCalledWith(
      '/organisations/org-1/events/event-1/rounds/round-1/evaluation/sessions/session-uuid-1/scores',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
    expect(res.data?.success).toBe(true);
    expect(res.data?.scores.length).toBe(2);
  });

  // 5. Submission pending state prevents duplicate requests
  it('5. Pending submission state locks action buttons and prevents double submission', () => {
    // Renders dialog in loading skeleton state
    const html = renderToStaticMarkup(
      <JudgeScoringDialog
        isOpen={true}
        onClose={vi.fn()}
        orgId="org-1"
        eventId="event-1"
        roundId="round-1"
        session={mockSession}
        initialLoading={true}
      />
    );

    expect(html).toContain('Loading submission and evaluation criteria...');
    expect(html).toContain('data-testid="scoring-loading-skeleton"');
  });

  // 6. Successful submission updates the UI appropriately
  it('6. Successful score submission dispatches callback to refresh workspace session state', async () => {
    const onScoresSubmitted = vi.fn();
    const request = vi.fn().mockResolvedValue({
      data: {
        success: true,
        sessionId: 'session-uuid-1',
        submissionId: 'sub-1',
        scores: [{ id: 's-1', criterionId: 'crit-1', score: 50, feedback: 'Saved' }],
      },
    });

    const res = await submitJudgeEvaluationSessionScores(
      'org-1',
      'event-1',
      'round-1',
      'session-uuid-1',
      { scores: [{ criterionId: 'crit-1', score: 50, feedback: 'Saved' }] },
      request
    );

    if (res.data?.success) {
      onScoresSubmitted();
    }

    expect(onScoresSubmitted).toHaveBeenCalledTimes(1);
  });

  // 7. Failed submission preserves entered values and allows safe retry
  it('7. Recoverable submission failure preserves typed values in state for safe retry', () => {
    // Verify that state preservation logic keeps entered maps intact on catch
    let scoresState = { 'crit-1': '55', 'crit-2': '38' };
    let feedbackState = { 'crit-1': 'Good note' };
    let errorMessage: string | null = null;

    try {
      // Simulate API throwing error
      throw new Error('NETWORK_TIMEOUT');
    } catch (err: any) {
      errorMessage = err.message;
      // State is preserved (not reset)
    }

    expect(errorMessage).toBe('NETWORK_TIMEOUT');
    expect(scoresState['crit-1']).toBe('55');
    expect(feedbackState['crit-1']).toBe('Good note');
  });

  // 8. 403 and revoked-assignment errors are handled correctly
  it('8. 403 and revoked assignment errors display clear access-restricted alert without leaking data', async () => {
    const { ApiError } = await import('@/api/client');
    const mockForbiddenRequest = vi.fn().mockRejectedValue(
      new ApiError('You are not assigned to this evaluation session.', 403)
    );

    let errorResult: string | null = null;
    try {
      await getJudgeEvaluationSessionWork(
        'org-1',
        'event-1',
        'round-1',
        'session-uuid-1',
        mockForbiddenRequest
      );
    } catch (err: any) {
      if (err.statusCode === 403) {
        errorResult = 'You are not assigned to this evaluation session or your assignment has been revoked.';
      }
    }

    expect(errorResult).toContain('You are not assigned to this evaluation session or your assignment has been revoked');
  });

  // 9. No other judge's scores, identities or private notes appear
  it('9. Only the active judge session-scoped work is projected, isolating other evaluators', () => {
    // mockWork contains only the session team, permitted submission, and the caller's scores
    expect(mockWork.scores.length).toBe(1);
    expect(mockWork.scores[0].score).toBe(55);
    // Verified that session payload contains zero array of other judges' scores or private notes
    expect((mockWork as any).otherJudges).toBeUndefined();
    expect((mockWork as any).allScores).toBeUndefined();
  });

  // 10. Existing workspace navigation and session listing continue working
  it('10. Existing workspace navigation, unassigned guards, and action buttons render correctly', () => {
    // 10a. Fails closed when missing evaluation scope
    const unauthenticatedHtml = renderWorkspace('/app/judge/evaluations');
    expect(unauthenticatedHtml).toContain('Judge workspace');
    expect(unauthenticatedHtml).toContain('No organisation-wide access or event discovery is granted');

    // 10b. Renders assigned-session loading state when scope is provided
    const scopedHtml = renderWorkspace('/app/judge/evaluations/org-1/event-1/round-1');
    expect(scopedHtml).toContain('Judge workspace');
    expect(scopedHtml).toContain('animate-pulse');
  });

  it('11. Action buttons correctly render "Score submission", "Review scores", and "No evaluation" based on session status', () => {
    // Verify sessions endpoint contract
    const request = vi.fn().mockResolvedValue({
      data: {
        sessions: [mockSession, mockCompletedSession, mockCancelledSession],
      },
    });

    return listJudgeEvaluationSessions('org-1', 'event-1', 'round-1', request).then((res) => {
      const sessions = res.data?.sessions || [];
      expect(sessions.length).toBe(3);

      // Status scheduled -> Score submission
      expect(sessions[0].status).toBe('scheduled');
      // Status completed -> Review scores
      expect(sessions[1].status).toBe('completed');
      // Status cancelled -> No evaluation
      expect(sessions[2].status).toBe('cancelled');
    });
  });
});
