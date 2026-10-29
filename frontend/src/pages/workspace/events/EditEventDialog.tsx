import React, { useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { apiClient, ApiError } from '@/api/client';
import { EventItem, EventType, EventVisibility, EventLocationType } from '@/types/events';

interface EditEventDialogProps {
  isOpen: boolean;
  onClose: () => void;
  orgId: string;
  event: EventItem;
  onEventUpdated: (updatedEvent: EventItem) => void;
}

const COMMON_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
];

export function EditEventDialog({
  isOpen,
  onClose,
  orgId,
  event,
  onEventUpdated,
}: EditEventDialogProps) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const toLocalIso = (isoStr: string | null | undefined) => {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return '';
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
      return '';
    }
  };

  const [title, setTitle] = useState(event.title || '');
  const [description, setDescription] = useState(event.description || '');
  const [eventType, setEventType] = useState<EventType>(event.eventType || 'general_event');
  const [visibility, setVisibility] = useState<EventVisibility>(event.visibility || 'private');
  const [timezone, setTimezone] = useState(event.timezone || 'UTC');
  const [startAt, setStartAt] = useState(toLocalIso(event.startAt));
  const [endAt, setEndAt] = useState(toLocalIso(event.endAt));
  const [locationType, setLocationType] = useState<EventLocationType>(
    event.locationType || 'in_person'
  );
  const [location, setLocation] = useState(event.location || '');
  const [virtualUrl, setVirtualUrl] = useState(event.virtualUrl || '');
  const [registrationOpensAt, setRegistrationOpensAt] = useState(
    toLocalIso(event.registrationOpensAt)
  );
  const [registrationClosesAt, setRegistrationClosesAt] = useState(
    toLocalIso(event.registrationClosesAt)
  );
  const [capacity, setCapacity] = useState<string>(
    event.capacity !== null && event.capacity !== undefined ? String(event.capacity) : ''
  );
  const [participantInstructions, setParticipantInstructions] = useState(
    event.participantInstructions || ''
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!title.trim() || title.trim().length < 2) {
      setErrorMsg('Event title must be at least 2 characters long.');
      return;
    }

    const startDate = new Date(startAt);
    const endDate = new Date(endAt);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      setErrorMsg('Please specify valid start and end dates.');
      return;
    }

    if (endDate <= startDate) {
      setErrorMsg('End time must be strictly after the start time.');
      return;
    }

    let regOpenDate: Date | null = null;
    let regCloseDate: Date | null = null;

    if (registrationOpensAt) {
      regOpenDate = new Date(registrationOpensAt);
      if (isNaN(regOpenDate.getTime())) {
        setErrorMsg('Invalid registration opening date-time.');
        return;
      }
    }

    if (registrationClosesAt) {
      regCloseDate = new Date(registrationClosesAt);
      if (isNaN(regCloseDate.getTime())) {
        setErrorMsg('Invalid registration closing date-time.');
        return;
      }
      if (regCloseDate > startDate) {
        setErrorMsg('Registration closing time cannot be after the event start time.');
        return;
      }
      if (regOpenDate && regCloseDate <= regOpenDate) {
        setErrorMsg('Registration closing time must be after opening time.');
        return;
      }
    }

    if (capacity) {
      const capNum = Number(capacity);
      if (!Number.isInteger(capNum) || capNum <= 0) {
        setErrorMsg('Capacity must be a positive integer.');
        return;
      }
    }

    try {
      setIsSubmitting(true);

      const payload = {
        title: title.trim(),
        description: description.trim() ? description.trim() : null,
        eventType,
        visibility,
        timezone,
        startAt: startDate.toISOString(),
        endAt: endDate.toISOString(),
        locationType,
        location: locationType !== 'virtual' && location.trim() ? location.trim() : null,
        virtualUrl:
          locationType !== 'in_person' && virtualUrl.trim() ? virtualUrl.trim() : null,
        registrationOpensAt: regOpenDate ? regOpenDate.toISOString() : null,
        registrationClosesAt: regCloseDate ? regCloseDate.toISOString() : null,
        capacity: capacity ? parseInt(capacity, 10) : null,
        participantInstructions: participantInstructions.trim()
          ? participantInstructions.trim()
          : null,
      };

      const res = await apiClient<{ event: EventItem }>(
        `/organisations/${orgId}/events/${event.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify(payload),
        }
      );

      if (res.data?.event) {
        onEventUpdated(res.data.event);
        onClose();
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Failed to update event. Please check your inputs.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Event Details"
      description="Update event schedule, location, instructions, and registration parameters."
      className="max-w-2xl max-h-[90vh] overflow-y-auto"
    >
      <form onSubmit={handleSubmit} className="space-y-4 pt-2">
        {errorMsg && <Alert variant="error">{errorMsg}</Alert>}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Event Title <span className="text-rose-500">*</span>
          </label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Annual Global Hackathon 2026"
            required
            disabled={isSubmitting}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Event Type</label>
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value as EventType)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
              disabled={isSubmitting}
            >
              <option value="general_event">General Event / Conference</option>
              <option value="hackathon">Hackathon & Challenge</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Visibility</label>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as EventVisibility)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
              disabled={isSubmitting}
            >
              <option value="private">Private (Organisation Only)</option>
              <option value="public">Public (Listed Once Published)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Start Date & Time <span className="text-rose-500">*</span>
            </label>
            <Input
              type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              required
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              End Date & Time <span className="text-rose-500">*</span>
            </label>
            <Input
              type="datetime-local"
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
              required
              disabled={isSubmitting}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Event Timezone <span className="text-rose-500">*</span>
            </label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
              disabled={isSubmitting}
            >
              {!COMMON_TIMEZONES.includes(timezone) && (
                <option value={timezone}>{timezone}</option>
              )}
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Location Type</label>
            <select
              value={locationType}
              onChange={(e) => setLocationType(e.target.value as EventLocationType)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
              disabled={isSubmitting}
            >
              <option value="in_person">In-Person</option>
              <option value="virtual">Virtual Online</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </div>
        </div>

        {locationType !== 'virtual' && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Physical Location / Venue
            </label>
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Building 4, Conference Hall A, San Francisco"
              disabled={isSubmitting}
            />
          </div>
        )}

        {locationType !== 'in_person' && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Virtual URL (Stream or Conference)
            </label>
            <Input
              type="url"
              value={virtualUrl}
              onChange={(e) => setVirtualUrl(e.target.value)}
              placeholder="https://meet.google.com/abc-defg-hij"
              disabled={isSubmitting}
            />
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Registration Opens At
            </label>
            <Input
              type="datetime-local"
              value={registrationOpensAt}
              onChange={(e) => setRegistrationOpensAt(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Registration Closes At
            </label>
            <Input
              type="datetime-local"
              value={registrationClosesAt}
              onChange={(e) => setRegistrationClosesAt(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Max Capacity (Optional)
            </label>
            <Input
              type="number"
              min="1"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              placeholder="e.g. 150"
              disabled={isSubmitting}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Event Description
          </label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief overview of the event theme, agenda, and expectations..."
            className="w-full rounded-md border border-slate-300 p-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
            disabled={isSubmitting}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Participant Instructions (Private to Registrants)
          </label>
          <textarea
            rows={3}
            value={participantInstructions}
            onChange={(e) => setParticipantInstructions(e.target.value)}
            placeholder="Important instructions displayed only to confirmed registered participants..."
            className="w-full rounded-md border border-slate-300 p-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
            disabled={isSubmitting}
          />
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={isSubmitting}>
            Save Changes
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
