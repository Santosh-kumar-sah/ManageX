import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { Card, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import {
  Calendar,
  Plus,
  Search,
  MapPin,
  Video,
  Clock,
  ArrowRight,
  Users,
  ListOrdered,
  Lock,
} from 'lucide-react';
import { apiClient, ApiError } from '@/api/client';
import { useOrg } from '@/api/OrgContext';
import {
  MeetingItem,
  MEETING_STATUS_LABELS,
  MEETING_STATUS_VARIANTS,
} from '@/types/meetings';
import { ScheduleMeetingDialog } from './ScheduleMeetingDialog';

export function MeetingsPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const { activeOrg, activeDetails } = useOrg();

  const effectiveOrgId = orgId && orgId !== 'default' ? orgId : activeOrg?.id;

  const [meetings, setMeetings] = useState<MeetingItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [timeframeFilter, setTimeframeFilter] = useState<'upcoming' | 'past' | 'all'>('upcoming');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);

  const canCreateMeeting =
    activeDetails?.membership?.permissions?.includes('meeting.create') ||
    activeDetails?.membership?.role?.slug === 'organisation_owner' ||
    activeDetails?.membership?.role?.slug === 'organisation_admin';

  const fetchMeetings = useCallback(async () => {
    if (!effectiveOrgId) return;

    try {
      setIsLoading(true);
      setErrorMsg(null);

      const params = new URLSearchParams();
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      if (timeframeFilter !== 'all') params.append('timeframe', timeframeFilter);
      if (statusFilter !== 'all') params.append('status', statusFilter);

      const queryString = params.toString() ? `?${params.toString()}` : '';
      const res = await apiClient<{ meetings: MeetingItem[] }>(
        `/organisations/${effectiveOrgId}/meetings${queryString}`
      );
      setMeetings(res.data?.meetings || []);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Failed to load meetings.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [effectiveOrgId, searchQuery, timeframeFilter, statusFilter]);

  useEffect(() => {
    fetchMeetings();
  }, [fetchMeetings]);

  const formatMeetingDate = (isoString: string, timezone: string) => {
    try {
      return new Intl.DateTimeFormat('en-US', {
        timeZone: timezone || 'UTC',
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(isoString));
    } catch {
      return new Date(isoString).toLocaleString();
    }
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: activeOrg?.name || 'Organisation', href: `/app/organisations/${effectiveOrgId}` },
          { label: 'Meetings' },
        ]}
      />

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Meetings</h1>
          <p className="mt-1 text-sm text-slate-500">
            Schedule, track, and organize structured meetings with ordered agendas and attendee management.
          </p>
        </div>

        {canCreateMeeting && (
          <Button
            variant="primary"
            className="flex items-center gap-2 shrink-0"
            onClick={() => setIsScheduleOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Schedule Meeting
          </Button>
        )}
      </div>

      {errorMsg && (
        <Alert variant="error" title="Error Loading Meetings">
          {errorMsg}
        </Alert>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-white p-4 rounded-lg border border-border shadow-xs">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search meetings by title..."
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Timeframe Filter Tabs */}
          <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5 text-xs">
            <button
              onClick={() => setTimeframeFilter('upcoming')}
              className={`rounded px-3 py-1.5 font-medium transition-all ${
                timeframeFilter === 'upcoming'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Upcoming
            </button>
            <button
              onClick={() => setTimeframeFilter('past')}
              className={`rounded px-3 py-1.5 font-medium transition-all ${
                timeframeFilter === 'past'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Past
            </button>
            <button
              onClick={() => setTimeframeFilter('all')}
              className={`rounded px-3 py-1.5 font-medium transition-all ${
                timeframeFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Time
            </button>
          </div>

          {/* Status Dropdown */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="all">All Statuses</option>
            <option value="scheduled">Scheduled</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Meetings List */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-28 rounded-lg border border-border bg-white animate-pulse p-5"
            />
          ))}
        </div>
      ) : meetings.length === 0 ? (
        <Card className="border-dashed text-center py-12">
          <CardContent className="space-y-3">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <Calendar className="h-6 w-6" />
            </div>
            <CardTitle className="text-base text-slate-800">No meetings found</CardTitle>
            <CardDescription className="max-w-md mx-auto text-slate-500">
              {searchQuery || timeframeFilter !== 'all' || statusFilter !== 'all'
                ? 'No meetings match your selected filters. Try clearing your search or filters.'
                : 'Get started by scheduling your first team or project meeting.'}
            </CardDescription>
            {canCreateMeeting && !searchQuery && (
              <Button
                variant="primary"
                size="sm"
                className="mt-2"
                onClick={() => setIsScheduleOpen(true)}
              >
                <Plus className="h-4 w-4 mr-1" />
                Schedule Meeting
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {meetings.map((meeting) => (
            <Card
              key={meeting.id}
              className="hover:border-slate-300 transition-all shadow-xs overflow-hidden"
            >
              <CardContent className="p-5">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="space-y-2 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={MEETING_STATUS_VARIANTS[meeting.status]}>
                        {MEETING_STATUS_LABELS[meeting.status] || meeting.status}
                      </Badge>

                      {meeting.visibility === 'attendees_only' && (
                        <Badge variant="warning" className="flex items-center gap-1">
                          <Lock className="h-3 w-3" />
                          Attendees Only
                        </Badge>
                      )}

                      <span className="text-xs text-slate-500 flex items-center gap-1 font-mono">
                        <Clock className="h-3 w-3" />
                        {meeting.timezone}
                      </span>
                    </div>

                    <h2 className="text-lg font-semibold text-slate-900 hover:text-brand-600">
                      <Link to={`/app/organisations/${effectiveOrgId}/meetings/${meeting.id}`}>
                        {meeting.title}
                      </Link>
                    </h2>

                    {meeting.description && (
                      <p className="text-sm text-slate-600 line-clamp-1">
                        {meeting.description}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-slate-500 pt-1">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5 text-slate-400" />
                        {formatMeetingDate(meeting.startAt, meeting.timezone)} -{' '}
                        {formatMeetingDate(meeting.endAt, meeting.timezone)}
                      </span>

                      {meeting.locationType === 'virtual' && (
                        <span className="flex items-center gap-1 text-brand-600">
                          <Video className="h-3.5 w-3.5" />
                          Virtual
                        </span>
                      )}

                      {meeting.locationType === 'in_person' && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5 text-slate-400" />
                          {meeting.location || 'In-Person'}
                        </span>
                      )}

                      {meeting.locationType === 'hybrid' && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5 text-slate-400" />
                          Hybrid ({meeting.location || 'Physical + Virtual'})
                        </span>
                      )}

                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5 text-slate-400" />
                        {meeting.attendeeCount ?? 1} attendee{meeting.attendeeCount === 1 ? '' : 's'}
                      </span>

                      <span className="flex items-center gap-1">
                        <ListOrdered className="h-3.5 w-3.5 text-slate-400" />
                        {meeting.agendaCount ?? 0} agenda item{meeting.agendaCount === 1 ? '' : 's'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100">
                    <Link
                      to={`/app/organisations/${effectiveOrgId}/meetings/${meeting.id}`}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      Details
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Schedule Meeting Modal */}
      {effectiveOrgId && (
        <ScheduleMeetingDialog
          isOpen={isScheduleOpen}
          onClose={() => setIsScheduleOpen(false)}
          orgId={effectiveOrgId}
          onMeetingScheduled={() => {
            fetchMeetings();
          }}
        />
      )}
    </div>
  );
}
