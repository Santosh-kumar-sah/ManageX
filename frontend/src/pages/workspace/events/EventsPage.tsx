import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import {
  Calendar,
  Plus,
  Search,
  MapPin,
  Globe,
  Clock,
  ArrowRight,
  Code2,
  ShieldAlert,
} from 'lucide-react';
import { apiClient, ApiError } from '@/api/client';
import { useOrg } from '@/api/OrgContext';
import {
  EventItem,
  EVENT_STATUS_LABELS,
  EVENT_STATUS_VARIANTS,
} from '@/types/events';
import { CreateEventDialog } from './CreateEventDialog';

export function EventsPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const { activeOrg, activeDetails } = useOrg();

  const effectiveOrgId = orgId && orgId !== 'default' ? orgId : activeOrg?.id;

  const [events, setEvents] = useState<EventItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const canCreateEvent =
    activeDetails?.membership?.permissions?.includes('event.create') ||
    activeDetails?.membership?.role?.slug === 'organisation_owner' ||
    activeDetails?.membership?.role?.slug === 'organisation_admin' ||
    activeDetails?.membership?.role?.slug === 'event_admin';

  const fetchEvents = useCallback(async () => {
    if (!effectiveOrgId) return;

    try {
      setIsLoading(true);
      setErrorMsg(null);
      setAccessDenied(null);

      const params = new URLSearchParams();
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      if (statusFilter !== 'all') params.append('status', statusFilter);

      const queryString = params.toString() ? `?${params.toString()}` : '';
      const res = await apiClient<{ events: EventItem[] }>(
        `/organisations/${effectiveOrgId}/events${queryString}`
      );

      if (res.data) {
        setEvents(res.data.events || []);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.statusCode === 403 || err.statusCode === 401) {
          setAccessDenied(err.message || 'Access to organisation events is restricted to active members.');
        } else {
          setErrorMsg(err.message);
        }
      } else {
        setErrorMsg('Failed to load organisation events.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [effectiveOrgId, searchQuery, statusFilter]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleEventCreated = (newEvent: EventItem) => {
    setEvents((prev) => [newEvent, ...prev]);
  };

  const formatEventDate = (isoString: string, timezone: string) => {
    try {
      const date = new Date(isoString);
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: timezone,
        timeZoneName: 'short',
      }).format(date);
    } catch {
      return new Date(isoString).toLocaleString();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Breadcrumbs
            items={[
              { label: 'Workspace', href: '/app' },
              { label: activeOrg?.name || 'Organisation', href: '/app' },
              { label: 'Events & Hackathons' },
            ]}
          />
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
            Events & Hackathons
          </h1>
          <p className="text-sm text-slate-500">
            Organise conferences, workshops, and hackathons with timezone-aware scheduling.
          </p>
        </div>

        {canCreateEvent && (
          <Button
            variant="primary"
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-2 self-start sm:self-auto"
          >
            <Plus className="h-4 w-4" />
            Create Event
          </Button>
        )}
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
      ) : (
        <>
          {errorMsg && <Alert variant="error">{errorMsg}</Alert>}

          {/* Filter and Search Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search events by name or keyword..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="w-full sm:w-56">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="all">All Statuses</option>
                <option value="draft">Drafts</option>
                <option value="published">Published</option>
                <option value="registration_closed">Registration Closed</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Events Listing */}
      {isLoading ? (
        <div className="py-12 text-center text-slate-500">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-slate-200 border-t-brand-600 mb-2"></div>
          <p>Loading events...</p>
        </div>
      ) : events.length === 0 ? (
        <Card className="text-center py-12 px-4">
          <Calendar className="mx-auto h-12 w-12 text-slate-300 mb-3" />
          <h3 className="text-base font-semibold text-slate-900">No events found</h3>
          <p className="mt-1 text-sm text-slate-500 max-w-sm mx-auto">
            {searchQuery || statusFilter !== 'all'
              ? 'No events match the selected filters. Try clearing your search.'
              : 'Get started by creating your organisation’s first event or hackathon.'}
          </p>
          {canCreateEvent && !searchQuery && statusFilter === 'all' && (
            <div className="mt-4">
              <Button variant="primary" onClick={() => setIsCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Event
              </Button>
            </div>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {events.map((evt) => (
            <Card
              key={evt.id}
              className="flex flex-col hover:border-slate-300 transition-colors duration-150"
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <Badge variant={EVENT_STATUS_VARIANTS[evt.status]}>
                    {EVENT_STATUS_LABELS[evt.status]}
                  </Badge>
                  <span className="text-xs font-mono text-slate-400 capitalize">
                    {evt.visibility}
                  </span>
                </div>
                <CardTitle className="text-lg line-clamp-1">
                  <Link
                    to={`/app/organisations/${effectiveOrgId}/events/${evt.id}`}
                    className="hover:text-brand-600 transition-colors"
                  >
                    {evt.title}
                  </Link>
                </CardTitle>
                <CardDescription className="line-clamp-2 min-h-[2.5rem]">
                  {evt.description || 'No description provided.'}
                </CardDescription>
              </CardHeader>

              <CardContent className="flex-1 flex flex-col justify-between pt-0">
                <div className="space-y-2 text-xs text-slate-600 border-t border-slate-100 pt-3 mb-4">
                  <div className="flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <span>{formatEventDate(evt.startAt, evt.timezone)}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {evt.locationType === 'in_person' ? (
                      <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    ) : (
                      <Globe className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    )}
                    <span className="truncate">
                      {evt.locationType === 'in_person'
                        ? evt.location || 'Venue TBD'
                        : evt.locationType === 'virtual'
                          ? 'Online / Virtual'
                          : `Hybrid (${evt.location || 'Venue TBD'})`}
                    </span>
                  </div>

                  {evt.eventType === 'hackathon' && (
                    <div className="flex items-center gap-2 text-brand-600 font-medium">
                      <Code2 className="h-3.5 w-3.5 shrink-0" />
                      <span>Hackathon & Challenge</span>
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-mono text-slate-400">
                    TZ: {evt.timezone}
                  </span>
                  <Link
                    to={`/app/organisations/${effectiveOrgId}/events/${evt.id}`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
                  >
                    Manage Event <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal Dialog */}
      {effectiveOrgId && (
        <CreateEventDialog
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          orgId={effectiveOrgId}
          onEventCreated={handleEventCreated}
        />
      )}
        </>
      )}
    </div>
  );
}
