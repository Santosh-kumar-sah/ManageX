import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  Calendar,
  Clock,
  MapPin,
  Globe,
  Users,
  CheckCircle2,
  AlertCircle,
  Building2,
  Code2,
  ArrowLeft,
  Share2,
  Award,
} from 'lucide-react';
import { apiClient, ApiError } from '@/api/client';
import { useAuth } from '@/api/AuthContext';
import { EventItem, RegistrationItem } from '@/types/events';

export function PublicEventDetailPage({
  initialEvent = null,
  initialLoading = true,
}: {
  initialEvent?: EventItem | null;
  initialLoading?: boolean;
} = {}) {
  const { eventId } = useParams<{ eventId: string }>();
  const location = useLocation();
  const { user, isAuthenticated } = useAuth();

  const [event, setEvent] = useState<EventItem | null>(initialEvent);
  const [registration, setRegistration] = useState<RegistrationItem | null>(null);
  const [isLoading, setIsLoading] = useState(initialEvent ? false : initialLoading);
  const [isStatusLoading, setIsStatusLoading] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);
  const [actionErrorMessage, setActionErrorMessage] = useState<string | null>(null);
  const [showWithdrawConfirm, setShowWithdrawConfirm] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // 1. Fetch public event details
  const fetchEventDetails = useCallback(async () => {
    if (!eventId) return;

    try {
      setIsLoading(true);
      setErrorMessage(null);

      const res = await apiClient<{ event: EventItem }>(`/events/${eventId}`);
      if (res.data?.event) {
        setEvent(res.data.event);
      } else {
        setErrorMessage('Event not found or is not publicly accessible.');
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to load event details. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [eventId]);

  // 2. Fetch authenticated user's registration status
  const fetchRegistrationStatus = useCallback(async (orgId: string, evtId: string) => {
    if (!isAuthenticated) {
      setRegistration(null);
      return;
    }

    try {
      setIsStatusLoading(true);
      const res = await apiClient<{ registration: RegistrationItem | null }>(
        `/organisations/${orgId}/events/${evtId}/my-registration`
      );
      setRegistration(res.data?.registration || null);
    } catch {
      // If fetching status fails (e.g. not registered), set null
      setRegistration(null);
    } finally {
      setIsStatusLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchEventDetails();
  }, [fetchEventDetails]);

  useEffect(() => {
    if (event?.organisationId && event?.id) {
      fetchRegistrationStatus(event.organisationId, event.id);
    }
  }, [event?.organisationId, event?.id, fetchRegistrationStatus]);

  // 3. Register Handler
  async function handleRegister() {
    if (!event) return;
    setIsActionLoading(true);
    setActionErrorMessage(null);
    setActionSuccessMessage(null);

    try {
      const res = await apiClient<{ registration: RegistrationItem }>(
        `/organisations/${event.organisationId}/events/${event.id}/register`,
        {
          method: 'POST',
          body: JSON.stringify({ customAnswers: {} }),
        }
      );

      if (res.data?.registration) {
        setRegistration(res.data.registration);
        setActionSuccessMessage('Successfully registered for this event!');
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setActionErrorMessage(err.message);
      } else {
        setActionErrorMessage('Failed to complete registration. Please try again.');
      }
    } finally {
      setIsActionLoading(false);
    }
  }

  // 4. Withdraw Handler
  async function handleWithdraw() {
    if (!event) return;
    setIsActionLoading(true);
    setActionErrorMessage(null);
    setActionSuccessMessage(null);

    try {
      const res = await apiClient<{ registration: RegistrationItem }>(
        `/organisations/${event.organisationId}/events/${event.id}/withdraw`,
        {
          method: 'POST',
        }
      );

      if (res.data?.registration) {
        setRegistration(res.data.registration);
        setActionSuccessMessage('Your registration has been withdrawn.');
        setShowWithdrawConfirm(false);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setActionErrorMessage(err.message);
      } else {
        setActionErrorMessage('Failed to withdraw registration. Please try again.');
      }
    } finally {
      setIsActionLoading(false);
    }
  }

  function handleShare() {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  }

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return isoString;
    }
  };

  const formatTime = (isoString?: string | null, tz?: string) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return `${d.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
      })} ${tz || ''}`.trim();
    } catch {
      return '';
    }
  };

  // Registration window check
  const now = new Date();
  const regOpen = event?.registrationOpensAt ? new Date(event.registrationOpensAt) : null;
  const regClose = event?.registrationClosesAt
    ? new Date(event.registrationClosesAt)
    : event?.startAt
    ? new Date(event.startAt)
    : null;

  const isRegistrationNotYetOpen = regOpen && now < regOpen;
  const isRegistrationClosed = regClose && now > regClose;
  const isEventOpenForRegistration =
    event?.status === 'published' && !isRegistrationNotYetOpen && !isRegistrationClosed;
  const isRegistered = registration?.status === 'registered';

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-10 w-3/4" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
          <div>
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (errorMessage || !event) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
        <Alert variant="error" title="Event Unavailable">
          {errorMessage || 'The requested event could not be found or is not publicly published.'}
        </Alert>
        <div className="mt-6">
          <Link to="/">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              <span>Back to ManageX</span>
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const isHackathon = event.eventType === 'hackathon';

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Top Back Navigation & Action Bar */}
      <div className="mb-6 flex items-center justify-between">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>ManageX Home</span>
        </Link>

        <button
          type="button"
          onClick={handleShare}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <Share2 className="h-3.5 w-3.5 text-slate-400" />
          <span>{copiedLink ? 'Link Copied!' : 'Share Event'}</span>
        </button>
      </div>

      {/* Main Grid: Details (Left 2 cols) & Registration Card (Right 1 col) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Left Column: Event Metadata & Body */}
        <div className="lg:col-span-2 space-y-6">
          {/* Header Card */}
          <Card className="p-6 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={isHackathon ? 'brand' : 'neutral'}>
                {isHackathon ? (
                  <span className="flex items-center gap-1">
                    <Code2 className="h-3 w-3" />
                    Hackathon
                  </span>
                ) : (
                  'General Event'
                )}
              </Badge>

              <Badge variant="success">Published</Badge>

              {event.organisation && (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 ml-auto">
                  <Building2 className="h-3.5 w-3.5 text-slate-400" />
                  <span>Hosted by {event.organisation.name}</span>
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              {event.title}
            </h1>

            {/* Quick Meta Ribbon */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-border text-xs text-slate-600">
              <div className="flex items-start gap-2">
                <Clock className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-slate-800">Event Schedule</div>
                  <div>
                    {formatDate(event.startAt)} – {formatDate(event.endAt)}
                  </div>
                  <div className="text-slate-500">
                    {formatTime(event.startAt, event.timezone)}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2">
                {event.locationType === 'virtual' ? (
                  <Globe className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                ) : (
                  <MapPin className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="font-semibold text-slate-800">
                    {event.locationType === 'virtual'
                      ? 'Virtual Event'
                      : event.locationType === 'hybrid'
                      ? 'Hybrid Format'
                      : 'In-Person Venue'}
                  </div>
                  <div className="text-slate-500">
                    {event.location || (event.locationType === 'virtual' ? 'Online meeting' : 'Venue TBA')}
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* About / Description */}
          <Card className="p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-900 border-b border-border pb-3">
              About this Event
            </h2>
            <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
              {event.description || 'No detailed description provided by the event host.'}
            </div>

            {event.participantInstructions && (
              <div className="mt-6 pt-4 border-t border-border bg-slate-50 p-4 rounded-lg">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">
                  Instructions for Registered Participants
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">
                  {event.participantInstructions}
                </p>
              </div>
            )}
          </Card>

          {/* Hackathon Details (If applicable) */}
          {isHackathon && (
            <Card className="p-6 space-y-4">
              <h2 className="text-lg font-bold text-slate-900 border-b border-border pb-3 flex items-center gap-2">
                <Code2 className="h-5 w-5 text-brand-600" />
                <span>Hackathon Guidelines & Rules</span>
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-3 rounded-lg bg-surface-subtle border border-border">
                  <div className="font-semibold text-slate-800 flex items-center gap-1.5 mb-1">
                    <Users className="h-3.5 w-3.5 text-brand-600" />
                    <span>Team Composition</span>
                  </div>
                  <div className="text-slate-600">
                    Teams may range from{' '}
                    <span className="font-semibold text-slate-900">
                      {event.teamSizeMin || 1}
                    </span>{' '}
                    to{' '}
                    <span className="font-semibold text-slate-900">
                      {event.teamSizeMax || 4} members
                    </span>.
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-surface-subtle border border-border">
                  <div className="font-semibold text-slate-800 flex items-center gap-1.5 mb-1">
                    <Calendar className="h-3.5 w-3.5 text-brand-600" />
                    <span>Project Submissions</span>
                  </div>
                  <div className="text-slate-600">
                    {event.submissionOpensAt && event.submissionClosesAt ? (
                      <span>
                        Opens: {formatDate(event.submissionOpensAt)}
                        <br />
                        Closes: {formatDate(event.submissionClosesAt)}
                      </span>
                    ) : (
                      <span>Submissions accepted during the event window.</span>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Results Link Banner if results are published */}
          {event.resultsPublishedAt && (
            <Card className="p-5 border-brand-200 bg-brand-50/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-brand-100 rounded-lg text-brand-700">
                  <Award className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Event Results Published</h3>
                  <p className="text-xs text-slate-600">
                    Final rankings, winners, and scores are publicly available for this event.
                  </p>
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* Right Column: Registration Card & Action Panel */}
        <div className="space-y-6">
          <Card className="p-6 shadow-card border-border sticky top-20">
            <CardHeader className="p-0 pb-4 border-b border-border">
              <CardTitle className="text-lg font-bold text-slate-900 flex items-center justify-between">
                <span>Participation</span>
                {event.capacity && (
                  <Badge variant="neutral" className="text-xs font-normal">
                    Capacity: {event.capacity}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>

            <CardContent className="p-0 pt-4 space-y-4">
              {/* Action feedback alerts */}
              {actionSuccessMessage && (
                <Alert variant="success" title="Success">
                  {actionSuccessMessage}
                </Alert>
              )}

              {actionErrorMessage && (
                <Alert variant="error" title="Registration Error">
                  {actionErrorMessage}
                </Alert>
              )}

              {/* Status Timeline */}
              <div className="space-y-2 text-xs text-slate-600">
                <div className="flex justify-between py-1 border-b border-border">
                  <span className="text-slate-500">Registration Opens</span>
                  <span className="font-medium text-slate-800">
                    {event.registrationOpensAt ? formatDate(event.registrationOpensAt) : 'Immediately'}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-border">
                  <span className="text-slate-500">Registration Closes</span>
                  <span className="font-medium text-slate-800">
                    {event.registrationClosesAt ? formatDate(event.registrationClosesAt) : formatDate(event.startAt)}
                  </span>
                </div>
              </div>

              {/* Authentication / Registration State */}
              {isStatusLoading ? (
                <div className="py-6 text-center">
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : !isAuthenticated ? (
                /* 1. Unauthenticated Visitor */
                <div className="space-y-3 pt-2">
                  <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-600 leading-relaxed border border-border">
                    <p className="font-semibold text-slate-800 mb-1">Authenticated Registration</p>
                    ManageX requires a verified account to register. Organisation membership is not required for public events.
                  </div>

                  <Link
                    to="/auth/login"
                    state={{ from: { pathname: location.pathname } }}
                    className="block w-full"
                  >
                    <Button className="w-full justify-center">
                      Sign in to Register
                    </Button>
                  </Link>

                  <div className="text-center text-xs text-slate-500 pt-1">
                    Don't have an account?{' '}
                    <Link to="/auth/register" className="text-brand-600 hover:underline font-medium">
                      Create an account
                    </Link>
                  </div>
                </div>
              ) : isRegistered ? (
                /* 2. Authenticated & Registered */
                <div className="space-y-4 pt-2">
                  <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4">
                    <div className="flex items-start gap-2.5">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-xs font-bold text-emerald-900">You Are Registered</h4>
                        <p className="text-xs text-emerald-700 mt-0.5">
                          Registered under{' '}
                          <span className="font-medium">{user?.email}</span>
                        </p>
                        {registration?.registeredAt && (
                          <p className="text-[11px] text-emerald-600 mt-1">
                            Registered on {formatDate(registration.registeredAt)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {!showWithdrawConfirm ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowWithdrawConfirm(true)}
                      className="w-full text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200"
                    >
                      Withdraw Registration
                    </Button>
                  ) : (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg space-y-2">
                      <p className="text-xs text-rose-800">
                        Are you sure you want to withdraw from this event?
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={isActionLoading}
                          onClick={handleWithdraw}
                          className="flex-1"
                        >
                          {isActionLoading ? 'Withdrawing...' : 'Confirm Withdrawal'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowWithdrawConfirm(false)}
                          className="flex-1"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* 3. Authenticated & Not Registered */
                <div className="space-y-3 pt-2">
                  {!isEventOpenForRegistration ? (
                    <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">Registration Closed</p>
                        <p className="mt-0.5">
                          {isRegistrationNotYetOpen
                            ? `Registration opens on ${formatDate(event.registrationOpensAt)}.`
                            : 'Registration for this event is now closed.'}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <Button
                      onClick={handleRegister}
                      disabled={isActionLoading}
                      className="w-full justify-center"
                    >
                      {isActionLoading ? 'Registering...' : 'Register for Event'}
                    </Button>
                  )}

                  <p className="text-center text-[11px] text-slate-500">
                    Logged in as <span className="font-medium text-slate-700">{user?.fullName || user?.email}</span>
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
