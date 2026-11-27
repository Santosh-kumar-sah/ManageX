import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, CalendarDays, MapPin, Search } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { Alert } from '@/components/ui/Alert';
import { apiClient, ApiError } from '@/api/client';
import type { EventItem } from '@/types/events';

const eventTypes = [
  { value: 'all', label: 'All events' },
  { value: 'hackathon', label: 'Hackathons' },
  { value: 'general_event', label: 'General events' },
] as const;

function eventTime(iso: string, timezone: string, options: Intl.DateTimeFormatOptions) {
  if (!iso) return 'To be announced';
  try {
    return new Intl.DateTimeFormat(undefined, { ...options, timeZone: timezone || 'UTC' }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function EventListing({ event }: { event: EventItem }) {
  const host = typeof event.organisation === 'string' ? event.organisation : event.organisation?.name;
  const format = event.locationType === 'virtual' ? 'Online' : event.locationType === 'hybrid' ? 'Hybrid' : 'In person';
  const dateOptions: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' };

  return (
    <li className="relative grid gap-x-6 gap-y-3 border-b border-border py-6 last:border-b-0 sm:grid-cols-[4.5rem_minmax(0,1fr)_auto] sm:py-7">
      <div className="hidden w-[4.5rem] self-start rounded-lg border border-brand-100 bg-brand-50 py-2 text-center text-brand-800 sm:block" aria-hidden="true">
        <span className="block text-xs font-semibold">{eventTime(event.startAt, event.timezone, { month: 'short' })}</span>
        <span className="block text-3xl font-semibold tracking-tight">{eventTime(event.startAt, event.timezone, { day: 'numeric' })}</span>
      </div>
      <div className="min-w-0">
        <div className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="font-semibold text-brand-700">{event.eventType === 'hackathon' ? 'Hackathon' : 'General Event'}</span>
          <span className="inline-flex items-center gap-1 text-slate-600"><MapPin className="h-3.5 w-3.5" aria-hidden="true" />{format}</span>
        </div>
        <h2 className="break-words text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          <Link to={`/events/${event.id}`} className="rounded-sm hover:text-brand-700 after:absolute after:inset-0">{event.title}</Link>
        </h2>
        {host && <p className="mt-1 text-sm text-slate-600">Hosted by {host}</p>}
        {event.description && <p className="mt-2 max-w-3xl line-clamp-2 text-sm leading-relaxed text-slate-600">{event.description}</p>}
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-700">
          <span>Starts <time dateTime={event.startAt}>{eventTime(event.startAt, event.timezone, dateOptions)}</time></span>
          <span>Ends <time dateTime={event.endAt}>{eventTime(event.endAt, event.timezone, dateOptions)}</time></span>
          <span>{event.timezone || 'UTC'}</span>
          {event.capacity != null && <span>Capacity: {event.capacity}</span>}
        </div>
      </div>
      <ArrowUpRight className="hidden h-5 w-5 self-center text-brand-700 sm:block" aria-hidden="true" />
    </li>
  );
}

export function EventsPortalHomePage() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<typeof eventTypes[number]['value']>('all');
  const latestRequest = useRef(0);

  const fetchEvents = useCallback(async (search: string) => {
    const requestId = ++latestRequest.current;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      params.set('limit', '50');
      const result = await apiClient<{ events: EventItem[] }>(`/events?${params}`);
      if (requestId === latestRequest.current) setEvents(result.data?.events || []);
    } catch (error) {
      if (requestId === latestRequest.current) {
        setErrorMessage(error instanceof ApiError ? error.message : 'We could not load the events. Please try again.');
      }
    } finally {
      if (requestId === latestRequest.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { void fetchEvents(searchQuery); }, 300);
    return () => {
      clearTimeout(timer);
      latestRequest.current++;
    };
  }, [searchQuery, fetchEvents]);

  const filteredEvents = selectedType === 'all' ? events : events.filter((event) => event.eventType === selectedType);
  const hasFilters = searchQuery.trim() !== '' || selectedType !== 'all';

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-8 sm:py-16">
      <header className="relative mb-7 grid items-center overflow-hidden rounded-xl border border-border bg-white sm:grid-cols-[1.4fr_1fr]">
        <div className="px-5 py-8 sm:px-9 sm:py-12"><h1 className="text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">Events &amp; hackathons</h1>
        <p className="mt-3 max-w-xl text-base leading-relaxed text-slate-600">Find a public event, check the dates and see how to take part.</p></div>
        <picture className="hidden self-stretch bg-brand-50 sm:block">
          <img src="/art/events-small.webp" srcSet="/art/events-small.webp 720w, /art/events.webp 1440w" sizes="(min-width: 1024px) 460px, 40vw" alt="" className="h-full max-h-60 w-full object-cover" />
        </picture>
      </header>
      <div className="flex flex-col gap-4 border-y border-border py-4 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:max-w-sm">
          <label className="sr-only" htmlFor="public-event-search">Search public events</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
          <Input id="public-event-search" type="search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search events" className="h-11 bg-white pl-9" />
        </div>
        <div aria-label="Filter by event type" role="group" className="flex flex-wrap gap-1">
          {eventTypes.map(({ value, label }) => (
            <button key={value} type="button" aria-pressed={selectedType === value} onClick={() => setSelectedType(value)}
              className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${selectedType === value ? 'bg-brand-100 text-brand-900' : 'text-slate-600 hover:bg-white hover:text-slate-900'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {errorMessage ? (
        <Alert variant="error" className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{errorMessage}</span><Button size="sm" variant="outline" onClick={() => fetchEvents(searchQuery)}>Try again</Button>
          </div>
        </Alert>
      ) : isLoading ? (
        <div role="status" className="space-y-4 py-6">
          <span className="sr-only">Loading events</span>
          {[0, 1, 2].map((row) => <Skeleton key={row} className="h-20 w-full rounded-lg" />)}
        </div>
      ) : filteredEvents.length ? (
        <ul aria-label="Public events" className="mt-2 bg-white px-4 sm:px-6">
          {filteredEvents.map((event) => <EventListing key={event.id} event={event} />)}
        </ul>
      ) : (
        <section className="mt-6 rounded-xl border border-border bg-white px-5 py-12 text-center sm:py-16">
          <CalendarDays className="mx-auto mb-4 h-8 w-8 text-brand-700" aria-hidden="true" />
          <h2 className="text-xl font-semibold text-slate-900">{hasFilters ? 'No matching events' : 'No public events yet'}</h2>
          <p className="mt-2 text-sm text-slate-600">{hasFilters ? 'Try a different event name or reset your filters.' : 'Events will appear here when organisers publish them.'}</p>
          {hasFilters && (
            <Button className="mt-5" variant="outline" onClick={() => { setSearchQuery(''); setSelectedType('all'); }}>Reset filters</Button>
          )}
        </section>
      )}
    </div>
  );
}
