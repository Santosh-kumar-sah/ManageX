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
import { Button } from '@/components/ui/Button';
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
        setErrorMessage('Failed to load your participant dashboard. Please try again.');
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header Profile Greeting */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-8 border-b border-border">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200 text-xs font-semibold mb-2">
            <Trophy className="h-3.5 w-3.5" />
            <span>Participant Dashboard</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Participant Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Welcome back, <span className="font-semibold text-slate-700">{user?.fullName || user?.email}</span>. View your event registrations, hackathon teams, and project submissions.
          </p>
        </div>

        <Link to="/events">
          <Button variant="outline" className="gap-2">
            <span>Browse More Events</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>

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

      {/* Quick Stats Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
        <div className="p-4 bg-white rounded-lg border border-border shadow-xs">
          <div className="text-xs font-medium text-slate-500">Active Registrations</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{activeRegistrations.length}</div>
        </div>
        <div className="p-4 bg-white rounded-lg border border-border shadow-xs">
          <div className="text-xs font-medium text-slate-500">Withdrawn</div>
          <div className="text-2xl font-bold text-slate-600 mt-1">{withdrawnRegistrations.length}</div>
        </div>
        <div className="p-4 bg-white rounded-lg border border-border shadow-xs">
          <div className="text-xs font-medium text-slate-500">Past Events</div>
          <div className="text-2xl font-bold text-slate-600 mt-1">{pastRegistrations.length}</div>
        </div>
        <div className="p-4 bg-white rounded-lg border border-border shadow-xs">
          <div className="text-xs font-medium text-slate-500">Total Events</div>
          <div className="text-2xl font-bold text-brand-600 mt-1">{registrations.length}</div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex border-b border-border mt-8 gap-2 overflow-x-auto">
        <button
          onClick={() => setCurrentTab('all')}
          className={`pb-3 px-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            currentTab === 'all'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          All Events ({registrations.length})
        </button>
        <button
          onClick={() => setCurrentTab('active')}
          className={`pb-3 px-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            currentTab === 'active'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Active ({activeRegistrations.length})
        </button>
        <button
          onClick={() => setCurrentTab('withdrawn')}
          className={`pb-3 px-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            currentTab === 'withdrawn'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Withdrawn ({withdrawnRegistrations.length})
        </button>
        <button
          onClick={() => setCurrentTab('past')}
          className={`pb-3 px-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            currentTab === 'past'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Past Events ({pastRegistrations.length})
        </button>
      </div>

      {/* Content Area */}
      <div className="mt-8 space-y-8">
        {isLoading ? (
          <div className="space-y-6">
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
          <Card className="text-center py-16 px-6 max-w-xl mx-auto shadow-xs border-dashed border-2">
            <div className="h-14 w-14 rounded-full bg-brand-50 flex items-center justify-center mx-auto text-brand-600 mb-4">
              <Trophy className="h-7 w-7" />
            </div>
            <CardTitle className="text-xl font-bold text-slate-900">
              {registrations.length === 0
                ? 'No Event Registrations Yet'
                : `No ${currentTab === 'active' ? 'Active' : currentTab === 'withdrawn' ? 'Withdrawn' : 'Past'} Events Found`}
            </CardTitle>
            <p className="mt-2 text-sm text-slate-500 leading-relaxed">
              {registrations.length === 0
                ? 'You have not registered for any hackathons or technical events. Browse our directory of upcoming events to compete, innovate, and showcase your skills.'
                : currentTab === 'active'
                ? 'You are not currently enrolled in any upcoming events. Explore our public directory to find hackathons and workshops.'
                : currentTab === 'withdrawn'
                ? 'You do not have any withdrawn registrations.'
                : 'No past completed events found.'}
            </p>
            <div className="mt-6">
              {registrations.length === 0 || currentTab === 'active' ? (
                <Link to="/events">
                  <Button size="md" className="gap-2">
                    <span>Browse Upcoming Events</span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </Link>
              ) : (
                <Button size="md" variant="outline" onClick={() => setCurrentTab('all')}>
                  <span>View All Registrations</span>
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
                <CardHeader className="bg-surface-subtle border-b border-border py-4">
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
                          {isRegistered ? 'Confirmed Registration' : 'Withdrawn'}
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
                      <Link to={`/events/${event.id}`}>
                        <Button variant="outline" size="sm" className="gap-1.5">
                          <span>View Event Page</span>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
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
                    <Link to={`/events/${event.id}`}>
                      <Button size="sm" variant="outline" className="text-xs h-7 text-brand-600 border-brand-300 hover:bg-brand-50">
                        Re-register for Event
                      </Button>
                    </Link>
                  )}
                </div>

                <CardContent className="p-6 space-y-6">
                  {/* Confidential Participant Instructions (for active registrants) */}
                  {isRegistered && registration.participantInstructions && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-xs space-y-1">
                      <div className="flex items-center gap-2 font-bold text-emerald-900">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                        <span>Instructions for Registered Participants</span>
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
                        <div className="font-semibold text-slate-900">Event Start</div>
                        <div>{formatDate(event.startAt, event.timezone)}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <Clock className="h-4 w-4 text-slate-400 shrink-0" />
                      <div>
                        <div className="font-semibold text-slate-900">Event End</div>
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
                        <div className="capitalize">{event.locationType} {event.location ? `— ${event.location}` : ''}</div>
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
                          <Link to={`/events/${event.id}`}>
                            <Button variant="outline" size="sm" className="text-xs">
                              Manage Team
                            </Button>
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
                          Rounds & Deliverables
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
                                    {round.status}
                                  </Badge>
                                </div>

                                {/* Advancement status badge */}
                                {roundAdvancement ? (
                                  <Badge
                                    variant={roundAdvancement.status === 'qualified' ? 'success' : 'neutral'}
                                    className="text-xs flex items-center gap-1 font-semibold"
                                  >
                                    <CheckCircle2 className="h-3 w-3" />
                                    <span className="capitalize">{roundAdvancement.status}</span>
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

                                <Link to={`/events/${event.id}`}>
                                  <Button variant="ghost" size="sm" className="text-xs text-brand-600 hover:text-brand-700">
                                    <span>{roundSubmission ? 'Edit Submission' : 'Submit Project'}</span>
                                    <ChevronRight className="h-3.5 w-3.5 ml-1" />
                                  </Button>
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
                                  Form or join a team to view scheduled round evaluation appointments.
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
                          <div className="font-bold text-sm">Competition Results are Published!</div>
                          <div>Official scoring and rankings have been finalized by event judges and organisers.</div>
                        </div>
                      </div>
                      <Link to={`/events/${event.id}`}>
                        <Button size="sm" variant="outline" className="bg-white border-amber-300 text-amber-900 hover:bg-amber-50">
                          View Results Leaderboard
                        </Button>
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
