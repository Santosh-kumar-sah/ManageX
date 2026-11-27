import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Trophy,
  Calendar,
  Clock,
  MapPin,
  Globe,
  Users,
  CheckCircle2,
  ExternalLink,
  ChevronRight,
  GitBranch,
  FileText,
  Building2,
  Award,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button, buttonStyles } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Alert } from '@/components/ui/Alert';
import { apiClient, ApiError } from '@/api/client';
import { useAuth } from '@/api/AuthContext';
import { ParticipantEvaluationSchedule } from '@/components/events/ParticipantEvaluationSchedule';

interface RegistrationItem {
  id: string;
  status: string;
  registeredAt: string | null;
  withdrawnAt?: string | null;
  reactivatedAt?: string | null;
  customAnswers: Record<string, unknown>;
  participantInstructions?: string | null;
}

interface EventMetadata {
  id: string;
  organisationId: string;
  title: string;
  slug: string;
  description: string | null;
  eventType: string;
  status: string;
  visibility: string;
  startAt: string | null;
  endAt: string | null;
  timezone: string;
  locationType: string;
  location: string | null;
  virtualUrl: string | null;
  registrationOpensAt?: string | null;
  registrationClosesAt?: string | null;
  resultsPublishedAt: string | null;
  organisation: {
    name: string;
    slug: string;
  };
}

interface TeamMember {
  userId: string;
  fullName: string;
  email: string;
  isOwner: boolean;
  joinedAt: string | null;
}

interface HackathonTeam {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isOwner: boolean;
  members: TeamMember[];
}

interface RoundItem {
  id: string;
  roundNumber: number;
  name: string;
  description: string | null;
  submissionOpensAt: string | null;
  submissionClosesAt: string | null;
  advancementRule: string;
  status: string;
}

interface SubmissionItem {
  id: string;
  roundId: string | null;
  roundNumber: number | null;
  roundName: string | null;
  teamId: string | null;
  submitterUserId: string;
  title: string;
  description: string | null;
  repositoryUrl: string | null;
  demoUrl: string | null;
  status: string;
  submittedAt: string | null;
}

interface AdvancementItem {
  id: string;
  roundId: string;
  roundNumber: number;
  roundName: string;
  status: string;
  qualificationRank: number | null;
  isManual: boolean;
  createdAt: string | null;
}

interface DashboardEntry {
  registration: RegistrationItem;
  event: EventMetadata;
  team: HackathonTeam | null;
  rounds: RoundItem[];
  submissions: SubmissionItem[];
  advancements: AdvancementItem[];
  resultsPublished: boolean;
}

export function StudentDashboardPage({
  initialRegistrations = null,
  initialLoading = true,
}: {
  initialRegistrations?: DashboardEntry[] | null;
  initialLoading?: boolean;
} = {}) {
  const { user } = useAuth();
  const [registrations, setRegistrations] = useState<DashboardEntry[]>(
    initialRegistrations || []
  );
  const [isLoading, setIsLoading] = useState(
    initialRegistrations !== null ? false : initialLoading
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  type TabFilter = 'all' | 'active' | 'withdrawn' | 'past';
  const [currentTab, setCurrentTab] = useState<TabFilter>('all');

  function isEventPast(event: EventMetadata): boolean {
    if (event.status === 'completed' || event.status === 'archived') return true;
    if (!event.endAt) return false;
    return new Date(event.endAt).getTime() < Date.now();
  }

  const activeRegistrations = registrations.filter(
    (r) => r.registration.status === 'registered' && !isEventPast(r.event)
  );
  const withdrawnRegistrations = registrations.filter(
    (r) => r.registration.status === 'withdrawn'
  );
  const pastRegistrations = registrations.filter(
    (r) => isEventPast(r.event)
  );

  const displayedRegistrations =
    currentTab === 'active'
      ? activeRegistrations
      : currentTab === 'withdrawn'
      ? withdrawnRegistrations
      : currentTab === 'past'
      ? pastRegistrations
      : registrations;

  const fetchDashboard = useCallback(async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);

      const res = await apiClient<{ registrations: DashboardEntry[] }>(
        '/events/participant/dashboard'
      );
      setRegistrations(res.data?.registrations || []);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('We could not load your events. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  function formatDate(isoString: string | null, timezone = 'UTC') {
    if (!isoString) return 'TBA';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: timezone,
      });
    } catch {
      return isoString;
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-8 sm:py-14">
      <header className="flex flex-col items-start justify-between gap-5 border-b border-border pb-7 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <h1 className="text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">My events</h1>
          <p className="mt-3 break-words text-base text-slate-600">Registrations, teams and submissions for {user?.fullName || user?.email}.</p>
        </div>
        <Link to="/events" className={buttonStyles({ variant: 'outline' })}>
          Browse events <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </header>

      {/* Error state */}
      {errorMessage && (
        <Alert variant="error" className="my-6">
          <div className="flex items-center justify-between">
            <span>{errorMessage}</span>
            <Button size="sm" variant="outline" onClick={fetchDashboard}>
              Retry
            </Button>
          </div>
        </Alert>
      )}

      <div aria-label="Filter registrations" role="group" className="mt-5 flex flex-wrap gap-1 border-b border-border pb-4">
        {([
          ['all', 'All events', registrations.length],
          ['active', 'Active', activeRegistrations.length],
          ['withdrawn', 'Withdrawn', withdrawnRegistrations.length],
          ['past', 'Past events', pastRegistrations.length],
        ] as const).map(([value, label, count]) => (
          <button
            key={value}
            type="button"
            aria-pressed={currentTab === value}
            onClick={() => setCurrentTab(value)}
            className={`rounded-md px-3 py-2 text-sm font-medium ${currentTab === value ? 'bg-brand-100 text-brand-900' : 'text-slate-600 hover:bg-white'}`}
          >
            {label}{!isLoading && !errorMessage && ` (${count})`}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="mt-8 space-y-8">
        {errorMessage ? null : isLoading ? (
          <div role="status" aria-label="Loading your events" className="space-y-6">
            {[1, 2].map((i) => (
              <Card key={i} className="p-6 space-y-4 animate-pulse">
                <Skeleton className="h-6 w-1/3 rounded" />
                <Skeleton className="h-4 w-1/4 rounded" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
                  <Skeleton className="h-20 rounded" />
                  <Skeleton className="h-20 rounded" />
                  <Skeleton className="h-20 rounded" />
                </div>
              </Card>
            ))}
          </div>
        ) : displayedRegistrations.length === 0 ? (
          <Card className="text-center py-14 px-6 border-border">
            <div className="h-14 w-14 rounded-full bg-brand-50 flex items-center justify-center mx-auto text-brand-600 mb-4">
              <Trophy className="h-7 w-7" />
            </div>
            <CardTitle className="text-xl font-bold text-slate-900">
              {registrations.length === 0
                ? 'No registrations yet'
                : `No ${currentTab === 'active' ? 'Active' : currentTab === 'withdrawn' ? 'Withdrawn' : 'Past'} Events Found`}
            </CardTitle>
            <p className="mt-2 text-sm text-slate-500 leading-relaxed">
              {registrations.length === 0
                ? 'Find a public event and register. Your event details and updates will appear here.'
                : currentTab === 'active'
                ? 'Browse public events to find one to join.'
                : currentTab === 'withdrawn'
                ? 'You do not have any withdrawn registrations.'
                : 'Finished events will appear here.'}
            </p>
            <div className="mt-6">
              {registrations.length === 0 || currentTab === 'active' ? (
                <Link to="/events" className={buttonStyles({})}>
                    <span>Browse public events</span>
                    <ChevronRight className="h-4 w-4" />
                  </Link>
              ) : (
                <Button size="md" variant="outline" onClick={() => setCurrentTab('all')}>
                  <span>View all registrations</span>
                </Button>
              )}
            </div>
          </Card>
        ) : (
          displayedRegistrations.map((entry) => {
            const { event, registration, team, rounds, submissions, advancements, resultsPublished } = entry;
            const isHackathon = event.eventType === 'hackathon';
            const isRegistered = registration.status === 'registered';
            const isPast = isEventPast(event);

            return (
              <Card key={event.id} className="overflow-hidden border-border shadow-xs hover:border-slate-300 transition-colors">
                {/* Event Header Banner */}
                <CardHeader className="border-b border-border bg-white py-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          variant={isHackathon ? 'brand' : 'neutral'}
                          className="capitalize text-xs font-semibold"
                        >
                          {isHackathon ? 'Hackathon' : 'General Event'}
                        </Badge>
                        <Badge
                          variant={isRegistered ? 'success' : 'neutral'}
                          className="text-xs font-medium"
                        >
                          {isRegistered ? 'Registered' : 'Withdrawn'}
                        </Badge>
                        <Badge
                          variant={isPast ? 'neutral' : event.status === 'in_progress' ? 'brand' : 'neutral'}
                          className="text-xs"
                        >
                          {isPast ? 'Past Event' : event.status === 'in_progress' ? 'In Progress' : 'Upcoming'}
                        </Badge>
                        {resultsPublished && (
                          <Badge variant="warning" className="text-xs flex items-center gap-1">
                            <Award className="h-3 w-3" />
                            <span>Results Published</span>
                          </Badge>
                        )}
                      </div>
                      <CardTitle className="text-xl font-bold text-slate-900">
                        <Link to={`/events/${event.id}`} className="hover:text-brand-600 transition-colors">
                          {event.title}
                        </Link>
                      </CardTitle>
                      {event.organisation?.name && (
                        <p className="text-xs text-slate-500 flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5 text-slate-400" />
                          <span>Organised by {event.organisation.name}</span>
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-center">
                      <Link to={`/events/${event.id}`} className={buttonStyles({ size: 'sm', variant: "outline", className: "gap-1.5" })}>
                          <span>View event</span>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                    </div>
                  </div>
                </CardHeader>

                {/* Registration Metadata Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-2.5 bg-slate-50/80 border-b border-border text-xs text-slate-600">
                  <div className="flex items-center gap-4 flex-wrap">
                    {registration.registeredAt && (
                      <span>
                        Registered: <strong className="text-slate-800">{formatDate(registration.registeredAt, event.timezone)}</strong>
                      </span>
                    )}
                    {registration.reactivatedAt && (
                      <span className="text-emerald-700 font-medium">
                        (Reactivated: {formatDate(registration.reactivatedAt, event.timezone)})
                      </span>
                    )}
                    {registration.withdrawnAt && (
                      <span className="text-amber-800 font-medium">
                        Withdrawn: {formatDate(registration.withdrawnAt, event.timezone)}
                      </span>
                    )}
                  </div>

                  {!isRegistered && (
                    <Link to={`/events/${event.id}`} className={buttonStyles({ size: 'sm', variant: "outline", className: "text-xs h-7 text-brand-600 border-brand-300 hover:bg-brand-50" })}>
                          Register again
                        </Link>
                  )}
                </div>

                <CardContent className="p-6 space-y-6">
                  {/* Confidential Participant Instructions (for active registrants) */}
                  {isRegistered && registration.participantInstructions && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-xs space-y-1">
                      <div className="flex items-center gap-2 font-bold text-emerald-900">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                        <span>Joining instructions</span>
                      </div>
                      <p className="text-emerald-800 whitespace-pre-line pl-6 leading-relaxed">
                        {registration.participantInstructions}
                      </p>
                    </div>
                  )}
                  {/* Schedule & Location Summary */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-slate-600 bg-slate-50 p-4 rounded-lg border border-border">
                    <div className="flex items-center gap-2.5">
                      <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
                      <div>
                        <div className="font-semibold text-slate-900">Starts</div>
                        <div>{formatDate(event.startAt, event.timezone)}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <Clock className="h-4 w-4 text-slate-400 shrink-0" />
                      <div>
                        <div className="font-semibold text-slate-900">Ends</div>
                        <div>{formatDate(event.endAt, event.timezone)}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5">
                      {event.locationType === 'virtual' ? (
                        <Globe className="h-4 w-4 text-slate-400 shrink-0" />
                      ) : (
                        <MapPin className="h-4 w-4 text-slate-400 shrink-0" />
                      )}
                      <div>
                        <div className="font-semibold text-slate-900">Location</div>
                        <div className="capitalize">{event.locationType.replace(/_/g, ' ')} {event.location ? `— ${event.location}` : ''}</div>
                      </div>
                    </div>
                  </div>

                  {/* Hackathon Team Section */}
                  {isHackathon && (
                    <div className="border border-border rounded-lg p-4 bg-white space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-brand-600" />
                          <h3 className="text-sm font-bold text-slate-900">
                            Team Status
                          </h3>
                        </div>
                        {team && (
                          <Badge variant="neutral" className="text-xs">
                            {team.isOwner ? 'Team Leader' : 'Team Member'}
                          </Badge>
                        )}
                      </div>

                      {team ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm font-semibold text-slate-900">
                            <span>Team: {team.name}</span>
                            <span className="text-xs text-slate-500 font-normal">
                              {team.members.length} member{team.members.length === 1 ? '' : 's'}
                            </span>
                          </div>
                          {team.description && (
                            <p className="text-xs text-slate-500">{team.description}</p>
                          )}
                          <div className="pt-2 flex flex-wrap gap-2">
                            {team.members.map((m) => (
                              <div
                                key={m.userId}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-100 text-xs text-slate-700"
                              >
                                <span className="font-medium">{m.fullName || m.email}</span>
                                {m.isOwner && (
                                  <span className="text-[10px] bg-brand-100 text-brand-700 px-1 py-0.2 rounded font-semibold">
                                    Leader
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500 flex items-center justify-between bg-slate-50 p-3 rounded">
                          <span>You have registered as an individual participant and have not joined a team yet.</span>
                          <Link to={`/events/${event.id}`} className={buttonStyles({ size: 'sm', variant: "outline", className: "text-xs" })}>
                          Manage Team
                        </Link>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Multi-Round Deliverables & Qualification Status */}
                  {rounds.length > 0 && (
                    <div className="border border-border rounded-lg p-4 bg-white space-y-4">
                      <div className="flex items-center gap-2">
                        <GitBranch className="h-4 w-4 text-brand-600" />
                        <h3 className="text-sm font-bold text-slate-900">
                          Rounds and submissions
                        </h3>
                      </div>

                      <div className="space-y-4">
                        {rounds.map((round) => {
                          const roundSubmission = submissions.find(
                            (s) => s.roundId === round.id || (s.roundNumber === round.roundNumber)
                          );
                          const roundAdvancement = advancements.find(
                            (a) => a.roundId === round.id || (a.roundNumber === round.roundNumber)
                          );

                          return (
                            <div
                              key={round.id}
                              className="border border-border rounded-lg p-3 bg-surface-subtle space-y-2.5"
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="h-5 w-5 rounded-full bg-brand-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                                    {round.roundNumber}
                                  </span>
                                  <span className="text-sm font-bold text-slate-900">
                                    {round.name}
                                  </span>
                                  <Badge variant="neutral" className="capitalize text-[11px]">
                                    {round.status.replace(/_/g, ' ')}
                                  </Badge>
                                </div>

                                {/* Advancement status badge */}
                                {roundAdvancement ? (
                                  <Badge
                                    variant={roundAdvancement.status === 'qualified' ? 'success' : 'neutral'}
                                    className="text-xs flex items-center gap-1 font-semibold"
                                  >
                                    <CheckCircle2 className="h-3 w-3" />
                                    <span className="capitalize">{roundAdvancement.status.replace(/_/g, ' ')}</span>
                                    {roundAdvancement.qualificationRank && (
                                      <span>(Rank #{roundAdvancement.qualificationRank})</span>
                                    )}
                                  </Badge>
                                ) : (
                                  <Badge variant="neutral" className="text-xs text-slate-500">
                                    Evaluation Pending
                                  </Badge>
                                )}
                              </div>

                              {round.description && (
                                <p className="text-xs text-slate-500 pl-7">
                                  {round.description}
                                </p>
                              )}

                              {/* Deliverable submission state */}
                              <div className="ml-7 pt-2 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                                {roundSubmission ? (
                                  <div className="space-y-1">
                                    <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                                      <FileText className="h-3.5 w-3.5 text-brand-600" />
                                      <span>Submitted: {roundSubmission.title}</span>
                                      <span className="text-slate-400 font-normal">
                                        ({formatDate(roundSubmission.submittedAt)})
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-3 text-brand-600">
                                      {roundSubmission.demoUrl && (
                                        <a
                                          href={roundSubmission.demoUrl}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="hover:underline flex items-center gap-1"
                                        >
                                          <span>Live Demo</span>
                                          <ExternalLink className="h-3 w-3" />
                                        </a>
                                      )}
                                      {roundSubmission.repositoryUrl && (
                                        <a
                                          href={roundSubmission.repositoryUrl}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="hover:underline flex items-center gap-1"
                                        >
                                          <span>Repository</span>
                                          <ExternalLink className="h-3 w-3" />
                                        </a>
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="text-slate-500 italic">
                                    No submission recorded for this round.
                                  </div>
                                )}

                                <Link to={`/events/${event.id}`} className={buttonStyles({ size: 'sm', variant: "ghost", className: "text-xs text-brand-600 hover:text-brand-700" })}>
                          <span>{roundSubmission ? 'Edit Submission' : 'Submit Project'}</span>
                                    <ChevronRight className="h-3.5 w-3.5 ml-1" />
                        </Link>
                              </div>

                              {/* Scheduled Evaluation Appointment */}
                              {team?.id ? (
                                <div className="ml-7 pt-2.5 border-t border-border">
                                  <ParticipantEvaluationSchedule
                                    eventId={event.id}
                                    roundId={round.id}
                                    roundName={round.name}
                                    roundNumber={round.roundNumber}
                                    teamId={team.id}
                                    teamName={team.name}
                                    timezone={event.timezone}
                                    showEmptyState={true}
                                  />
                                </div>
                              ) : (
                                <div className="ml-7 pt-2 border-t border-border text-xs text-slate-500 italic">
                                  Join a team to see its judging appointments.
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Published Results Section */}
                  {resultsPublished && (
                    <div className="bg-amber-50/60 border border-amber-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2.5 text-amber-900 font-medium">
                        <Award className="h-5 w-5 text-amber-600 shrink-0" />
                        <div>
                          <div className="font-bold text-sm">Results are available</div>
                          <div>See the scores and rankings published by the organisers.</div>
                        </div>
                      </div>
                      <Link to={`/events/${event.id}`} className={buttonStyles({ size: 'sm', variant: "outline", className: "bg-white border-amber-300 text-amber-900 hover:bg-amber-50" })}>
                          View results
                        </Link>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

export { StudentDashboardPage as ParticipantDashboardPage };
