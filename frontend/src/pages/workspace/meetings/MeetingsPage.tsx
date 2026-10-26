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
  ShieldAlert,
  CheckSquare,
  CheckCircle2,
  Circle,
  Sparkles,
  FolderKanban,
  BarChart2,
  TrendingUp,
  CheckCircle,
  XCircle,
  AlertTriangle,
  FileText,
  CheckCheck,
} from 'lucide-react';
import { apiClient, ApiError } from '@/api/client';
import { useOrg } from '@/api/OrgContext';
import {
  MeetingItem,
  MeetingActionItem,
  MeetingAnalyticsData,
  AnalyticsTimeframe,
  MEETING_STATUS_LABELS,
  MEETING_STATUS_VARIANTS,
  ACTION_ITEM_STATUS_LABELS,
  ACTION_ITEM_STATUS_VARIANTS,
  ACTION_ITEM_PRIORITY_LABELS,
  ACTION_ITEM_PRIORITY_VARIANTS,
  getTimezoneLabel,
  isMeetingOverdue,
} from '@/types/meetings';
import { ScheduleMeetingDialog } from './ScheduleMeetingDialog';

interface MeetingsPageProps {
  initialMeetings?: MeetingItem[];
  initialLoading?: boolean;
  initialTab?: 'meetings' | 'action-items' | 'analytics';
  initialActionItems?: MeetingActionItem[];
  initialAnalytics?: MeetingAnalyticsData | null;
}

export function MeetingsPage({
  initialMeetings,
  initialLoading,
  initialTab = 'meetings',
  initialActionItems,
  initialAnalytics,
}: MeetingsPageProps = {}) {
  const { orgId } = useParams<{ orgId: string }>();
  const { activeOrg, activeDetails } = useOrg();

  const effectiveOrgId = orgId && orgId !== 'default' ? orgId : activeOrg?.id;

  const [activeTab, setActiveTab] = useState<'meetings' | 'action-items' | 'analytics'>(initialTab);

  // Meetings tab state
  const [meetings, setMeetings] = useState<MeetingItem[]>(initialMeetings || []);
  const [isLoading, setIsLoading] = useState(
    initialMeetings !== undefined ? (initialLoading ?? false) : true
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [timeframeFilter, setTimeframeFilter] = useState<'upcoming' | 'past' | 'all'>('upcoming');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);

  // Analytics tab state
  const [analyticsData, setAnalyticsData] = useState<MeetingAnalyticsData | null>(initialAnalytics ?? null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [analyticsTimeframe, setAnalyticsTimeframe] = useState<AnalyticsTimeframe>('all');

  // Action items tab state
  const [actionItems, setActionItems] = useState<MeetingActionItem[]>(initialActionItems || []);
  const [isLoadingActionItems, setIsLoadingActionItems] = useState(
    initialActionItems !== undefined ? false : false
  );
  const [actionItemError, setActionItemError] = useState<string | null>(null);
  const [actionItemTimeframe, setActionItemTimeframe] = useState<'all' | 'overdue' | 'due_soon' | 'completed'>('all');
  const [actionItemStatus, setActionItemStatus] = useState<string>('all');
  const [actionItemPriority, setActionItemPriority] = useState<string>('all');
  const [actionItemSearch, setActionItemSearch] = useState('');
  const [isTogglingItem, setIsTogglingItem] = useState<string | null>(null);

  // Dynamic recalculation when upcoming meeting end time passes (single-shot timer, zero polling, zero leaks)
  const [timeTick, setTimeTick] = useState(() => Date.now());
  useEffect(() => {
    const now = Date.now();
    let minFutureDiff: number | null = null;
    for (const m of meetings) {
      if ((m.status === 'scheduled' || m.status === 'in_progress') && m.endAt) {
        const diff = new Date(m.endAt).getTime() - now;
        if (diff > 0 && (minFutureDiff === null || diff < minFutureDiff)) {
          minFutureDiff = diff;
        }
      }
    }
    if (minFutureDiff !== null && minFutureDiff < 86400000) {
      const timer = setTimeout(() => {
        setTimeTick(Date.now());
      }, minFutureDiff + 100);
      return () => clearTimeout(timer);
    }
  }, [meetings]);

  const canCreateMeeting =
    activeDetails?.membership?.permissions?.includes('meeting.create') ||
    activeDetails?.membership?.role?.slug === 'organisation_owner' ||
    activeDetails?.membership?.role?.slug === 'organisation_admin';

  const fetchMeetings = useCallback(async () => {
    if (!effectiveOrgId) return;

    try {
      setIsLoading(true);
      setErrorMsg(null);
      setAccessDenied(null);

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
        if (err.statusCode === 403 || err.statusCode === 401) {
          setAccessDenied(err.message || 'Access to organisation meetings is restricted to active members.');
        } else {
          setErrorMsg(err.message);
        }
      } else {
        setErrorMsg('Failed to load meetings.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [effectiveOrgId, searchQuery, timeframeFilter, statusFilter]);

  const fetchActionItems = useCallback(async () => {
    if (!effectiveOrgId) return;

    try {
      setIsLoadingActionItems(true);
      setActionItemError(null);

      const params = new URLSearchParams();
      if (actionItemTimeframe !== 'all') params.append('timeframe', actionItemTimeframe);
      if (actionItemStatus !== 'all') params.append('status', actionItemStatus);
      if (actionItemPriority !== 'all') params.append('priority', actionItemPriority);

      const queryString = params.toString() ? `?${params.toString()}` : '';
      const res = await apiClient<{ actionItems: MeetingActionItem[] }>(
        `/organisations/${effectiveOrgId}/meetings/action-items${queryString}`
      );
      setActionItems(res.data?.actionItems || []);
    } catch (err) {
      if (err instanceof ApiError) {
        setActionItemError(err.message);
      } else {
        setActionItemError('Failed to load action items.');
      }
    } finally {
      setIsLoadingActionItems(false);
    }
  }, [effectiveOrgId, actionItemTimeframe, actionItemStatus, actionItemPriority]);

  useEffect(() => {
    if (initialMeetings === undefined) {
      fetchMeetings();
    }
  }, [fetchMeetings, initialMeetings]);

  useEffect(() => {
    if (activeTab === 'action-items' && initialActionItems === undefined) {
      fetchActionItems();
    }
  }, [activeTab, fetchActionItems, initialActionItems]);

  const fetchAnalytics = useCallback(async (timeframe: AnalyticsTimeframe) => {
    if (!effectiveOrgId) return;

    try {
      setIsLoadingAnalytics(true);
      setAnalyticsError(null);

      const res = await apiClient<{ analytics: MeetingAnalyticsData }>(
        `/organisations/${effectiveOrgId}/meetings/analytics?timeframe=${timeframe}`
      );
      if (res.data?.analytics) {
        setAnalyticsData(res.data.analytics);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setAnalyticsError(err.message);
      } else {
        setAnalyticsError('Failed to load meeting analytics.');
      }
    } finally {
      setIsLoadingAnalytics(false);
    }
  }, [effectiveOrgId]);

  useEffect(() => {
    if (activeTab === 'analytics' && effectiveOrgId && initialAnalytics === undefined) {
      fetchAnalytics(analyticsTimeframe);
    }
  }, [activeTab, analyticsTimeframe, effectiveOrgId, fetchAnalytics, initialAnalytics]);

  const handleToggleActionItemStatus = async (item: MeetingActionItem) => {
    if (!effectiveOrgId) return;
    if (item.status === 'done' || item.status === 'cancelled') {
      return; // Terminal state: cannot be transitioned
    }
    const newStatus = 'done';

    try {
      setIsTogglingItem(item.id);
      await apiClient(
        `/organisations/${effectiveOrgId}/meetings/${item.meetingId}/action-items/${item.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status: newStatus }),
          headers: { 'Content-Type': 'application/json' },
        }
      );
      setActionItems((prev) =>
        prev.map((ai) => (ai.id === item.id ? { ...ai, status: newStatus } : ai))
      );
    } catch (err) {
      if (err instanceof ApiError) {
        setActionItemError(err.message);
      } else {
        setActionItemError('Failed to update action item status.');
      }
    } finally {
      setIsTogglingItem(null);
    }
  };

  const filteredActionItems = actionItems.filter((item) => {
    if (!actionItemSearch.trim()) return true;
    const q = actionItemSearch.toLowerCase();
    return (
      item.title.toLowerCase().includes(q) ||
      (item.description && item.description.toLowerCase().includes(q)) ||
      (item.meetingTitle && item.meetingTitle.toLowerCase().includes(q)) ||
      (item.decisionTitle && item.decisionTitle.toLowerCase().includes(q))
    );
  });

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
          { label: 'Workspace', href: '/app' },
          { label: activeOrg?.name || 'Organisation', href: '/app' },
          { label: 'Meetings' },
        ]}
      />

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Meetings & MOM</h1>
          <p className="mt-1 text-sm text-slate-500">
            Schedule, track, and organize structured meetings with decisions and action items.
          </p>
        </div>

        {canCreateMeeting && activeTab === 'meetings' && (
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

      {/* Top-Level Navigation Tabs */}
      <div className="flex border-b border-border gap-6">
        <button
          type="button"
          onClick={() => setActiveTab('meetings')}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'meetings'
              ? 'border-brand-600 text-brand-600 font-semibold'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
          data-testid="tab-meetings"
        >
          <Calendar className="h-4 w-4" />
          <span>Meetings</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('action-items')}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'action-items'
              ? 'border-brand-600 text-brand-600 font-semibold'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
          data-testid="tab-action-items"
        >
          <CheckSquare className="h-4 w-4" />
          <span>My Action Items</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('analytics')}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'analytics'
              ? 'border-brand-600 text-brand-600 font-semibold'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
          data-testid="tab-analytics"
        >
          <BarChart2 className="h-4 w-4" />
          <span>Analytics</span>
        </button>
      </div>

      {accessDenied ? (
        <Card className="border-red-200 bg-red-50/20 p-8 text-center max-w-xl mx-auto my-8">
          <CardContent className="space-y-4">
            <div className="mx-auto h-12 w-12 rounded-full bg-red-50 border border-red-100 flex items-center justify-center text-red-600">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-slate-900">Access Restricted</h2>
              <p className="text-xs text-slate-600 max-w-md mx-auto">{accessDenied}</p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <Link to="/app">
                <Button size="sm" variant="outline">
                  Return to Workspace
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : activeTab === 'meetings' ? (
        <>
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
            <option value="missed">Missed</option>
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

                      {isMeetingOverdue(meeting.status, meeting.endAt, timeTick) && (
                        <Badge variant="warning" className="flex items-center gap-1" data-testid="overdue-badge">
                          Overdue
                        </Badge>
                      )}

                      {meeting.visibility === 'attendees_only' && (
                        <Badge variant="warning" className="flex items-center gap-1">
                          <Lock className="h-3 w-3" />
                          Attendees Only
                        </Badge>
                      )}

                      <span className="text-xs text-slate-500 flex items-center gap-1 font-mono">
                        <Clock className="h-3 w-3" />
                        {getTimezoneLabel(meeting.timezone)}
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
        </>
      ) : (
        /* My Action Items View */
        <>
          {actionItemError && (
            <Alert variant="error" title="Error Loading Action Items">
              {actionItemError}
            </Alert>
          )}

          {/* Filter and Search Bar for Action Items */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-white p-4 rounded-lg border border-border shadow-xs">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                value={actionItemSearch}
                onChange={(e) => setActionItemSearch(e.target.value)}
                placeholder="Search action items or meetings..."
                className="pl-9"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Timeframe Filter Tabs */}
              <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5 text-xs">
                <button
                  onClick={() => setActionItemTimeframe('all')}
                  className={`rounded px-3 py-1.5 font-medium transition-all ${
                    actionItemTimeframe === 'all'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setActionItemTimeframe('overdue')}
                  className={`rounded px-3 py-1.5 font-medium transition-all ${
                    actionItemTimeframe === 'overdue'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Overdue
                </button>
                <button
                  onClick={() => setActionItemTimeframe('due_soon')}
                  className={`rounded px-3 py-1.5 font-medium transition-all ${
                    actionItemTimeframe === 'due_soon'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Due Soon
                </button>
                <button
                  onClick={() => setActionItemTimeframe('completed')}
                  className={`rounded px-3 py-1.5 font-medium transition-all ${
                    actionItemTimeframe === 'completed'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Completed
                </button>
              </div>

              {/* Status Dropdown */}
              <select
                value={actionItemStatus}
                onChange={(e) => setActionItemStatus(e.target.value)}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="all">All Statuses</option>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="done">Done</option>
                <option value="cancelled">Cancelled</option>
              </select>

              {/* Priority Dropdown */}
              <select
                value={actionItemPriority}
                onChange={(e) => setActionItemPriority(e.target.value)}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="all">All Priorities</option>
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          {/* Action Items List */}
          {isLoadingActionItems ? (
            <div className="space-y-3">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="h-24 rounded-lg border border-border bg-white animate-pulse p-4"
                />
              ))}
            </div>
          ) : filteredActionItems.length === 0 ? (
            <Card className="border-dashed text-center py-12">
              <CardContent className="space-y-3">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                  <CheckSquare className="h-6 w-6" />
                </div>
                <CardTitle className="text-base text-slate-800">No action items found</CardTitle>
                <CardDescription className="max-w-md mx-auto text-slate-500">
                  {actionItemSearch || actionItemTimeframe !== 'all' || actionItemStatus !== 'all' || actionItemPriority !== 'all'
                    ? 'No action items match your selected filters. Try adjusting your search or filters.'
                    : "You're all caught up! No open action items currently assigned to you."}
                </CardDescription>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredActionItems.map((item) => {
                const isOverdue =
                  item.dueDate &&
                  new Date(item.dueDate).getTime() < Date.now() &&
                  item.status !== 'done' &&
                  item.status !== 'cancelled';

                return (
                  <Card
                    key={item.id}
                    className="hover:border-slate-300 transition-all shadow-xs overflow-hidden"
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        {/* Quick Status Toggle Button */}
                        <button
                          type="button"
                          disabled={isTogglingItem === item.id || item.status === 'done' || item.status === 'cancelled'}
                          onClick={() => handleToggleActionItemStatus(item)}
                          className={`mt-0.5 shrink-0 focus:outline-none ${
                            item.status === 'done' || item.status === 'cancelled'
                              ? 'cursor-default text-emerald-600'
                              : 'text-slate-400 hover:text-slate-600'
                          }`}
                          title={
                            item.status === 'done'
                              ? 'Completed'
                              : item.status === 'cancelled'
                              ? 'Cancelled'
                              : 'Mark as Done'
                          }
                        >
                          {item.status === 'done' ? (
                            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                          ) : (
                            <Circle className="h-5 w-5 text-slate-400 hover:text-slate-600" />
                          )}
                        </button>

                        {/* Content */}
                        <div className="flex-1 space-y-1.5 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={ACTION_ITEM_STATUS_VARIANTS[item.status]}>
                              {ACTION_ITEM_STATUS_LABELS[item.status] || item.status}
                            </Badge>

                            <Badge variant={ACTION_ITEM_PRIORITY_VARIANTS[item.priority]}>
                              {ACTION_ITEM_PRIORITY_LABELS[item.priority] || item.priority}
                            </Badge>

                            {isOverdue && (
                              <Badge variant="danger" className="text-xs" data-testid="action-item-overdue">
                                Overdue
                              </Badge>
                            )}

                            {item.decisionTitle && (
                              <Badge variant="brand" className="text-xs flex items-center gap-1">
                                <Sparkles className="h-3 w-3" />
                                Decision: {item.decisionTitle}
                              </Badge>
                            )}

                            {item.projectTaskId && (
                              <Badge variant="neutral" className="text-xs flex items-center gap-1">
                                <FolderKanban className="h-3 w-3" />
                                In Project: {item.projectTaskTitle || 'Task'}
                              </Badge>
                            )}
                          </div>

                          <p
                            className={`text-sm font-medium ${
                              item.status === 'done' ? 'line-through text-slate-400' : 'text-slate-900'
                            }`}
                          >
                            {item.title}
                          </p>

                          {item.description && (
                            <p className="text-xs text-slate-600 line-clamp-2">
                              {item.description}
                            </p>
                          )}

                          <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-slate-500 pt-1">
                            <Link
                              to={`/app/organisations/${effectiveOrgId}/meetings/${item.meetingId}`}
                              className="inline-flex items-center gap-1 text-brand-600 hover:text-brand-800 font-medium"
                            >
                              <Calendar className="h-3.5 w-3.5" />
                              {item.meetingTitle || 'Meeting'}
                            </Link>

                            {item.dueDate && (
                              <span
                                className={`inline-flex items-center gap-1 ${
                                  isOverdue ? 'text-rose-600 font-medium' : 'text-slate-500'
                                }`}
                              >
                                <Clock className="h-3.5 w-3.5" />
                                Due {new Date(item.dueDate).toLocaleDateString()}
                              </span>
                            )}

                            {item.assigneeName && (
                              <span className="inline-flex items-center gap-1 text-slate-500">
                                <Users className="h-3.5 w-3.5" />
                                {item.assigneeName}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Right Action */}
                        <div className="shrink-0 pt-0.5">
                          <Link
                            to={`/app/organisations/${effectiveOrgId}/meetings/${item.meetingId}`}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
                          >
                            View
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Tab 3: Analytics Dashboard */}
      {activeTab === 'analytics' && (
        <div className="space-y-6" data-testid="analytics-tab-content">
          {/* Controls Header: Timeframe Selector */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Meeting Analytics & Performance</h2>
              <p className="text-xs text-slate-500">Real-time metrics on organisation meeting lifecycle, RSVP engagement, and action items.</p>
            </div>

            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setAnalyticsTimeframe('all')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  analyticsTimeframe === 'all'
                    ? 'bg-white text-indigo-700 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                data-testid="analytics-timeframe-all"
              >
                All Time
              </button>
              <button
                type="button"
                onClick={() => setAnalyticsTimeframe('30d')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  analyticsTimeframe === '30d'
                    ? 'bg-white text-indigo-700 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                data-testid="analytics-timeframe-30d"
              >
                Past 30 Days
              </button>
              <button
                type="button"
                onClick={() => setAnalyticsTimeframe('90d')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  analyticsTimeframe === '90d'
                    ? 'bg-white text-indigo-700 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                data-testid="analytics-timeframe-90d"
              >
                Past 90 Days
              </button>
            </div>
          </div>

          {isLoadingAnalytics ? (
            <div className="p-12 text-center text-slate-500 text-sm">
              Loading analytics...
            </div>
          ) : analyticsError ? (
            <Alert variant="error" title="Failed to Load Analytics">
              {analyticsError}
            </Alert>
          ) : !analyticsData || analyticsData.summary.totalMeetings === 0 ? (
            <Card className="border-dashed border-2 border-slate-200 p-12 text-center max-w-lg mx-auto">
              <CardContent className="space-y-3">
                <div className="mx-auto h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                  <BarChart2 className="h-6 w-6" />
                </div>
                <h3 className="text-base font-semibold text-slate-800">No meeting activity found</h3>
                <p className="text-sm text-slate-500">
                  There are no recorded meetings in this organisation for the selected timeframe. As meetings are scheduled and held, completion rates and actionable outcomes will automatically populate here.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Executive Metrics Overview Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Metric 1: Total Meetings */}
                <Card className="shadow-xs">
                  <CardContent className="p-5 space-y-2">
                    <div className="flex items-center justify-between text-slate-500">
                      <span className="text-xs font-medium uppercase tracking-wider">Total Meetings</span>
                      <Calendar className="h-4 w-4 text-slate-400" />
                    </div>
                    <div className="text-2xl font-bold text-slate-900" data-testid="metric-total-meetings">
                      {analyticsData.summary.totalMeetings}
                    </div>
                    <div className="text-xs text-slate-500">
                      {analyticsData.summary.completedMeetings} completed · {analyticsData.summary.scheduledMeetings} scheduled
                    </div>
                  </CardContent>
                </Card>

                {/* Metric 2: Meeting Completion Rate */}
                <Card className="shadow-xs">
                  <CardContent className="p-5 space-y-2">
                    <div className="flex items-center justify-between text-slate-500">
                      <span className="text-xs font-medium uppercase tracking-wider">Completion Rate</span>
                      <TrendingUp className="h-4 w-4 text-emerald-500" />
                    </div>
                    <div className="text-2xl font-bold text-slate-900" data-testid="metric-completion-rate">
                      {analyticsData.summary.meetingCompletionRate}%
                    </div>
                    <div className="text-xs text-slate-500">
                      {analyticsData.summary.missedMeetings} missed · {analyticsData.summary.cancelledMeetings} cancelled
                    </div>
                  </CardContent>
                </Card>

                {/* Metric 3: RSVP Acceptance Rate */}
                <Card className="shadow-xs">
                  <CardContent className="p-5 space-y-2">
                    <div className="flex items-center justify-between text-slate-500">
                      <span className="text-xs font-medium uppercase tracking-wider">RSVP Acceptance Rate</span>
                      <Users className="h-4 w-4 text-indigo-500" />
                    </div>
                    <div className="text-2xl font-bold text-slate-900" data-testid="metric-attendance-rate">
                      {analyticsData.attendance.acceptanceRate}%
                    </div>
                    <div className="text-xs text-slate-500">
                      {analyticsData.attendance.accepted} of {analyticsData.attendance.totalInvitations} accepted
                    </div>
                  </CardContent>
                </Card>

                {/* Metric 4: Action Items Completion Rate */}
                <Card className="shadow-xs">
                  <CardContent className="p-5 space-y-2">
                    <div className="flex items-center justify-between text-slate-500">
                      <span className="text-xs font-medium uppercase tracking-wider">Actions Completed</span>
                      <CheckCheck className="h-4 w-4 text-emerald-600" />
                    </div>
                    <div className="text-2xl font-bold text-slate-900" data-testid="metric-action-rate">
                      {analyticsData.actionItems.actionableCompletionRate ?? analyticsData.actionItems.completionRate}%
                    </div>
                    <div className="text-xs text-slate-500">
                      {analyticsData.actionItems.total === 0 ? (
                        'No action items recorded'
                      ) : (analyticsData.actionItems.actionableTotal ?? (analyticsData.actionItems.total - analyticsData.actionItems.cancelled)) === 0 ? (
                        `All ${analyticsData.actionItems.total} item${analyticsData.actionItems.total === 1 ? '' : 's'} cancelled`
                      ) : (
                        <>
                          {analyticsData.actionItems.done} of{' '}
                          {analyticsData.actionItems.actionableTotal ??
                            (analyticsData.actionItems.total - analyticsData.actionItems.cancelled)}{' '}
                          actionable item
                          {(analyticsData.actionItems.actionableTotal ??
                            (analyticsData.actionItems.total - analyticsData.actionItems.cancelled)) === 1
                            ? ''
                            : 's'}{' '}
                          completed
                          {analyticsData.actionItems.cancelled > 0 && (
                            <span> · {analyticsData.actionItems.cancelled} cancelled</span>
                          )}
                        </>
                      )}
                      {analyticsData.actionItems.overdue > 0 && (
                        <span className="text-rose-600 font-medium"> · {analyticsData.actionItems.overdue} overdue</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Detailed Breakdown Cards */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Card A: Meeting Status Breakdown */}
                <Card className="shadow-xs">
                  <CardContent className="p-6 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <h3 className="text-sm font-semibold text-slate-900">Meeting Status Breakdown</h3>
                      <span className="text-xs text-slate-500">{analyticsData.summary.totalMeetings} total</span>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-slate-700">
                          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                          Completed
                        </span>
                        <span className="font-medium text-slate-900">{analyticsData.summary.completedMeetings}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-slate-700">
                          <span className="h-2.5 w-2.5 rounded-full bg-indigo-500" />
                          Scheduled
                        </span>
                        <span className="font-medium text-slate-900">{analyticsData.summary.scheduledMeetings}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-slate-700">
                          <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                          In Progress
                        </span>
                        <span className="font-medium text-slate-900">{analyticsData.summary.inProgressMeetings}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-slate-700">
                          <span className="h-2.5 w-2.5 rounded-full bg-slate-400" />
                          Cancelled
                        </span>
                        <span className="font-medium text-slate-900">{analyticsData.summary.cancelledMeetings}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-slate-700">
                          <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                          Missed
                        </span>
                        <span className="font-medium text-slate-900">{analyticsData.summary.missedMeetings}</span>
                      </div>
                      {analyticsData.summary.overdueScheduledMeetings > 0 && (
                        <div className="flex items-center justify-between text-sm pt-2 border-t border-slate-100 text-amber-700 font-medium">
                          <span className="flex items-center gap-1.5">
                            <AlertTriangle className="h-4 w-4 text-amber-600" />
                            Overdue Scheduled Meetings
                          </span>
                          <span>{analyticsData.summary.overdueScheduledMeetings}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Card B: RSVP Status & Responses */}
                <Card className="shadow-xs">
                  <CardContent className="p-6 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <h3 className="text-sm font-semibold text-slate-900">RSVP Status & Responses</h3>
                      <span className="text-xs text-slate-500">{analyticsData.attendance.totalInvitations} invitations</span>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-slate-700">
                          <CheckCircle className="h-4 w-4 text-emerald-500" />
                          Accepted
                        </span>
                        <span className="font-medium text-slate-900">{analyticsData.attendance.accepted}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-slate-700">
                          <Clock className="h-4 w-4 text-amber-500" />
                          Tentative
                        </span>
                        <span className="font-medium text-slate-900">{analyticsData.attendance.tentative}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-slate-700">
                          <XCircle className="h-4 w-4 text-rose-500" />
                          Declined
                        </span>
                        <span className="font-medium text-slate-900">{analyticsData.attendance.declined}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-slate-700">
                          <Users className="h-4 w-4 text-slate-400" />
                          Pending RSVP
                        </span>
                        <span className="font-medium text-slate-900">{analyticsData.attendance.pending}</span>
                      </div>
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-sm text-slate-700">
                        <span>RSVP Acceptance Rate</span>
                        <span className="font-semibold text-brand-600">{analyticsData.attendance.acceptanceRate}%</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Card C: Action Items Lifecycle */}
                <Card className="shadow-xs">
                  <CardContent className="p-6 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <h3 className="text-sm font-semibold text-slate-900">Action Items Lifecycle</h3>
                      <span className="text-xs text-slate-500">
                        {analyticsData.actionItems.total} total item{analyticsData.actionItems.total === 1 ? '' : 's'}
                        {analyticsData.actionItems.cancelled > 0 &&
                          ` (${analyticsData.actionItems.actionableTotal ?? (analyticsData.actionItems.total - analyticsData.actionItems.cancelled)} actionable)`}
                      </span>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-slate-700">
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          Completed (Done)
                        </span>
                        <span className="font-medium text-slate-900">{analyticsData.actionItems.done}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-slate-700">
                          <Clock className="h-4 w-4 text-indigo-500" />
                          In Progress
                        </span>
                        <span className="font-medium text-slate-900">{analyticsData.actionItems.inProgress}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-slate-700">
                          <Circle className="h-4 w-4 text-slate-400" />
                          Open
                        </span>
                        <span className="font-medium text-slate-900">{analyticsData.actionItems.open}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-slate-700">
                          <XCircle className="h-4 w-4 text-slate-400" />
                          Cancelled
                        </span>
                        <span className="font-medium text-slate-900">{analyticsData.actionItems.cancelled}</span>
                      </div>
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-sm text-slate-700">
                        <span>Actionable Completion Rate</span>
                        <span className="font-semibold text-emerald-600">
                          {analyticsData.actionItems.actionableCompletionRate ?? analyticsData.actionItems.completionRate}%
                        </span>
                      </div>
                      {analyticsData.actionItems.overdue > 0 && (
                        <div className="flex items-center justify-between text-sm pt-2 border-t border-slate-100 text-rose-600 font-medium">
                          <span className="flex items-center gap-1.5">
                            <AlertTriangle className="h-4 w-4 text-rose-500" />
                            Overdue Action Items
                          </span>
                          <span>{analyticsData.actionItems.overdue}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Card D: Structured MOM & Outcomes */}
                <Card className="shadow-xs">
                  <CardContent className="p-6 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <h3 className="text-sm font-semibold text-slate-900">Structured MOM Artifacts</h3>
                      <span className="text-xs text-slate-500">Outcomes & Insights</span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-2">
                      <div className="p-4 bg-slate-50 rounded-lg border border-slate-200/80 text-center space-y-1">
                        <FileText className="h-5 w-5 text-indigo-600 mx-auto" />
                        <div className="text-2xl font-bold text-slate-900" data-testid="metric-discussion-points">
                          {analyticsData.mom.totalDiscussionPoints}
                        </div>
                        <div className="text-xs text-slate-500 font-medium">Discussion Points</div>
                      </div>

                      <div className="p-4 bg-slate-50 rounded-lg border border-slate-200/80 text-center space-y-1">
                        <Sparkles className="h-5 w-5 text-amber-600 mx-auto" />
                        <div className="text-2xl font-bold text-slate-900" data-testid="metric-decisions">
                          {analyticsData.mom.totalDecisions}
                        </div>
                        <div className="text-xs text-slate-500 font-medium">Key Decisions</div>
                      </div>
                    </div>

                    <p className="text-xs text-slate-500 pt-2 text-center">
                      Structured minutes ensure accountability and institutional knowledge retention across all teams.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
