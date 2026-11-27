import './events.css';
import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { Card, CardContent } from '@/components/ui/Card';
import { Button, buttonStyles } from '@/components/ui/Button';
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
  ChevronRight,

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
    <div className="mx-events space-y-6">
      <header className="mx-event-heading">
        <div>
          <Breadcrumbs
            items={[
              { label: 'Workspace', href: '/app' },
              { label: activeOrg?.name || 'Organisation', href: '/app' },
              { label: 'Events & Hackathons' },
            ]}
          />
          <h1 className="mx-event-title">
            Events & Hackathons
          </h1>
          <p className="mx-event-intro">
            Manage registrations, teams and submissions for your events.
          </p>
        </div>

        {canCreateEvent && (
          <Button
            variant="primary"
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-2 self-start sm:self-auto"
          >
            <Plus className="h-4 w-4" />
            Create event
          </Button>
        )}
      </header>

      {accessDenied ? (
        <Card className="border-red-200 bg-red-50/20 p-8 text-center max-w-xl mx-auto my-8">
          <CardContent className="space-y-4">
            <div className="mx-auto h-12 w-12 rounded-full bg-red-50 border border-red-100 flex items-center justify-center text-red-600">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-slate-900">Event access restricted</h2>
              <p className="text-xs text-slate-600 max-w-md mx-auto">{accessDenied}</p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <Link to="/app" className={buttonStyles({ size: 'sm', variant: 'outline' })}>Back to workspace</Link>
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
                aria-label="Search events"
                placeholder="Search events by name or keyword"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="w-full sm:w-56">
              <select
                aria-label="Filter events by status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="all">All statuses</option>
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
        <div role="status" className="py-12 text-center text-slate-500">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-slate-200 border-t-brand-600 mb-2"></div>
          <p>Loading events...</p>
        </div>
      ) : errorMsg ? (
        <Button variant="outline" onClick={fetchEvents}>Try again</Button>
      ) : events.length === 0 ? (
        <Card className="text-center py-12 px-4">
          <Calendar className="mx-auto h-12 w-12 text-slate-300 mb-3" />
          <h3 className="text-base font-semibold text-slate-900">No events found</h3>
          <p className="mt-1 text-sm text-slate-500 max-w-sm mx-auto">
            {searchQuery || statusFilter !== 'all'
              ? 'No events match the selected filters. Try clearing your search.'
              : canCreateEvent ? 'Create an event to open registration and invite participants.' : 'Events shared with your workspace will appear here.'}
          </p>
          {canCreateEvent && !searchQuery && statusFilter === 'all' && (
            <div className="mt-4">
              <Button variant="primary" onClick={() => setIsCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create event
              </Button>
            </div>
          )}
        </Card>
      ) : (
        <ul className="mx-event-list" aria-label="Events">
          {events.map(evt => (
            <li key={evt.id}>
              <Link className="mx-event-list-row" to={`/app/organisations/${effectiveOrgId}/events/${evt.id}`}>
                <div className="mx-event-list-title">
                  <span className="mx-event-kind">{evt.eventType === 'hackathon' ? 'Hackathon' : 'General event'} · {evt.visibility === 'public' ? 'Public' : 'Private'}</span>
                  <h2>{evt.title}</h2>
                  {evt.description && <p className="line-clamp-2">{evt.description}</p>}
                </div>
                <div className="mx-event-list-logistics">
                  <span><Clock aria-hidden="true" />{formatEventDate(evt.startAt, evt.timezone)}</span>
                  <span>
                    {evt.locationType === 'in_person' ? <MapPin aria-hidden="true" /> : <Globe aria-hidden="true" />}
                    {evt.locationType === 'virtual' ? 'Online' : evt.location || 'Venue to be confirmed'}
                    {evt.locationType === 'hybrid' && ' · Hybrid'}
                  </span>
                </div>
                <Badge variant={EVENT_STATUS_VARIANTS[evt.status]}>{EVENT_STATUS_LABELS[evt.status]}</Badge>
                <ChevronRight aria-hidden="true" className="mx-event-row-arrow" />
              </Link>
            </li>
          ))}
        </ul>
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
