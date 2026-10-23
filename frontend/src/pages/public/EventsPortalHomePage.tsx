import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  Calendar,
  Clock,
  MapPin,
  Globe,
  Trophy,
  Users,
  Building2,
  ArrowRight,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { Alert } from '@/components/ui/Alert';
import { apiClient, ApiError } from '@/api/client';
import { EventItem } from '@/types/events';

export function EventsPortalHomePage() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<'all' | 'hackathon' | 'general_event'>('all');

  const fetchEvents = useCallback(async (search?: string) => {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      const queryParams = new URLSearchParams();
      if (search && search.trim()) {
        queryParams.set('search', search.trim());
      }
      queryParams.set('limit', '50');

      const url = `/events?${queryParams.toString()}`;
      const res = await apiClient<{ events: EventItem[] }>(url);
      setEvents(res.data?.events || []);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to load events. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchEvents(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, fetchEvents]);

  const filteredEvents = events.filter((evt) => {
    if (selectedType === 'all') return true;
    return evt.eventType === selectedType;
  });

  function formatDate(isoString: string | null, timezone?: string) {
    if (!isoString) return 'TBA';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: timezone || 'UTC',
      });
    } catch {
      return isoString;
    }
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] pb-16">
      {/* Hero Section */}
      <section className="bg-white border-b border-border py-12 md:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-brand-50 text-brand-700 border border-brand-200 text-xs font-semibold mb-4">
              <Trophy className="h-3.5 w-3.5" />
              <span>ManageX Event Portal</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Events & Hackathons
            </h1>
            <p className="mt-3 text-base sm:text-lg text-slate-600 leading-relaxed">
              Discover, register, and compete in multi-round hackathons and collegiate technical events hosted on the ManageX enterprise platform.
            </p>
          </div>

          {/* Search & Filter Bar */}
          <div className="mt-8 flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between">
            <div className="relative flex-1 max-w-lg">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                type="text"
                placeholder="Search events by title or keywords..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-surface-subtle"
              />
            </div>

            <div className="flex items-center gap-2 border border-border rounded-lg p-1 bg-surface-subtle self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setSelectedType('all')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  selectedType === 'all'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All Events
              </button>
              <button
                type="button"
                onClick={() => setSelectedType('hackathon')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  selectedType === 'hackathon'
                    ? 'bg-white text-brand-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Hackathons
              </button>
              <button
                type="button"
                onClick={() => setSelectedType('general_event')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  selectedType === 'general_event'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                General Events
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-10">
        {errorMessage && (
          <Alert variant="error" className="mb-6">
            <div className="flex items-center justify-between">
              <span>{errorMessage}</span>
              <Button size="sm" variant="outline" onClick={() => fetchEvents(searchQuery)}>
                Retry
              </Button>
            </div>
          </Alert>
        )}

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i} className="animate-pulse p-6 space-y-4">
                <Skeleton className="h-6 w-3/4 rounded" />
                <Skeleton className="h-4 w-1/2 rounded" />
                <div className="space-y-2 pt-4">
                  <Skeleton className="h-4 w-full rounded" />
                  <Skeleton className="h-4 w-5/6 rounded" />
                </div>
                <Skeleton className="h-10 w-full rounded mt-4" />
              </Card>
            ))}
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="text-center py-16 bg-white border border-border rounded-xl p-8 max-w-xl mx-auto shadow-xs">
            <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400 mb-4">
              <Trophy className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900">No events found</h3>
            <p className="mt-1 text-sm text-slate-500">
              {searchQuery
                ? `No published events matching "${searchQuery}". Try a different search keyword.`
                : 'There are currently no public events published. Check back soon!'}
            </p>
            {searchQuery && (
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => setSearchQuery('')}
              >
                Clear Search
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredEvents.map((evt) => {
              const isHackathon = evt.eventType === 'hackathon';
              return (
                <Card
                  key={evt.id}
                  className="flex flex-col justify-between hover:shadow-card-hover transition-shadow border-border"
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <Badge
                        variant={isHackathon ? 'brand' : 'neutral'}
                        className="capitalize text-xs font-semibold"
                      >
                        {isHackathon ? 'Hackathon' : 'General Event'}
                      </Badge>
                      <span className="text-xs text-slate-500 font-medium capitalize flex items-center gap-1">
                        {evt.locationType === 'virtual' ? (
                          <>
                            <Globe className="h-3 w-3 text-slate-400" />
                            <span>Virtual</span>
                          </>
                        ) : evt.locationType === 'in_person' ? (
                          <>
                            <MapPin className="h-3 w-3 text-slate-400" />
                            <span>In Person</span>
                          </>
                        ) : (
                          <>
                            <Globe className="h-3 w-3 text-slate-400" />
                            <span>Hybrid</span>
                          </>
                        )}
                      </span>
                    </div>

                    <CardTitle className="text-lg font-bold text-slate-900 line-clamp-2">
                      <Link
                        to={`/events/${evt.id}`}
                        className="hover:text-brand-600 transition-colors"
                      >
                        {evt.title}
                      </Link>
                    </CardTitle>

                    {evt.organisation && (
                      <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-1">
                        <Building2 className="h-3.5 w-3.5 text-slate-400" />
                        <span>
                          Hosted by{' '}
                          {typeof evt.organisation === 'object' && evt.organisation
                            ? (evt.organisation as { name?: string }).name || ''
                            : String(evt.organisation)}
                        </span>
                      </p>
                    )}
                  </CardHeader>

                  <CardContent className="space-y-3 flex-1 text-xs text-slate-600">
                    {evt.description && (
                      <p className="line-clamp-2 text-slate-500 leading-relaxed">
                        {evt.description}
                      </p>
                    )}

                    <div className="space-y-1.5 pt-2 border-t border-border text-slate-600">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span>Starts: {formatDate(evt.startAt, evt.timezone)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span>Ends: {formatDate(evt.endAt, evt.timezone)}</span>
                      </div>
                      {evt.capacity && (
                        <div className="flex items-center gap-2">
                          <Users className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span>Capacity: {evt.capacity} participants</span>
                        </div>
                      )}
                    </div>
                  </CardContent>

                  <CardFooter className="pt-3 border-t border-border">
                    <Link to={`/events/${evt.id}`} className="w-full">
                      <Button variant="outline" className="w-full justify-between group">
                        <span>View Details & Register</span>
                        <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                      </Button>
                    </Link>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
