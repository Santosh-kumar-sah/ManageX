import React, { useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { apiClient, ApiError } from '@/api/client';
import {
  MeetingItem,
  MeetingLocationType,
  MeetingVisibility,
  COMMON_TIMEZONE_OPTIONS,
  normalizeTimeZone,
} from '@/types/meetings';

interface ScheduleMeetingDialogProps {
  isOpen: boolean;
  onClose: () => void;
  orgId: string;
  onMeetingScheduled: (meeting: MeetingItem) => void;
}

export function ScheduleMeetingDialog({
  isOpen,
  onClose,
  orgId,
  onMeetingScheduled,
}: ScheduleMeetingDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [timezone, setTimezone] = useState(
    normalizeTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata')
  );
  const [locationType, setLocationType] = useState<MeetingLocationType>('virtual');
  const [location, setLocation] = useState('');
  const [virtualUrl, setVirtualUrl] = useState('');
  const [visibility, setVisibility] = useState<MeetingVisibility>('organisation');

  const getDefaultDates = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);

    const tomorrowEnd = new Date(tomorrow);
    tomorrowEnd.setHours(11, 0, 0, 0);

    const pad = (n: number) => String(n).padStart(2, '0');
    const toLocalIso = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

    return {
      start: toLocalIso(tomorrow),
      end: toLocalIso(tomorrowEnd),
    };
  };

  const [dateTimes, setDateTimes] = useState(getDefaultDates());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setTimezone(normalizeTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata'));
    setLocationType('virtual');
    setLocation('');
    setVirtualUrl('');
    setVisibility('organisation');
    setDateTimes(getDefaultDates());
    setErrorMsg(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!title.trim()) {
      setErrorMsg('Meeting title is required.');
      return;
    }

    const startDate = new Date(dateTimes.start);
    const endDate = new Date(dateTimes.end);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      setErrorMsg('Valid start and end dates are required.');
      return;
    }

    if (startDate >= endDate) {
      setErrorMsg('Meeting end time must be strictly after the start time.');
      return;
    }

    if ((locationType === 'in_person' || locationType === 'hybrid') && !location.trim()) {
      setErrorMsg('Physical location is required for in-person or hybrid meetings.');
      return;
    }

    if ((locationType === 'virtual' || locationType === 'hybrid') && !virtualUrl.trim()) {
      setErrorMsg('Virtual meeting URL is required for virtual or hybrid meetings.');
      return;
    }

    try {
      setIsSubmitting(true);

      const payload = {
        title: title.trim(),
        description: description.trim() || undefined,
        startAt: startDate.toISOString(),
        endAt: endDate.toISOString(),
        timezone,
        locationType,
        location: locationType !== 'virtual' ? location.trim() : undefined,
        virtualUrl: locationType !== 'in_person' ? virtualUrl.trim() : undefined,
        visibility,
      };

      const res = await apiClient<{ meeting: MeetingItem }>(
        `/organisations/${orgId}/meetings`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      );

      if (res.data?.meeting) {
        onMeetingScheduled(res.data.meeting);
        handleClose();
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Failed to schedule meeting. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title="Schedule Meeting"
      description="Plan and coordinate a meeting with timezone-aware scheduling and attendee access control."
      className="max-w-2xl max-h-[90vh] overflow-y-auto"
    >
      <form onSubmit={handleSubmit} className="space-y-4 pt-2">
        {errorMsg && <Alert variant="error">{errorMsg}</Alert>}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Meeting Title <span className="text-red-500">*</span>
          </label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Weekly Engineering Sync"
            required
            maxLength={200}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            placeholder="Key discussion topics or purpose of the meeting..."
            maxLength={2000}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Start Date & Time <span className="text-red-500">*</span>
            </label>
            <Input
              type="datetime-local"
              value={dateTimes.start}
              onChange={(e) =>
                setDateTimes((prev) => ({ ...prev, start: e.target.value }))
              }
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              End Date & Time <span className="text-red-500">*</span>
            </label>
            <Input
              type="datetime-local"
              value={dateTimes.end}
              onChange={(e) =>
                setDateTimes((prev) => ({ ...prev, end: e.target.value }))
              }
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Timezone <span className="text-red-500">*</span>
            </label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              {COMMON_TIMEZONE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
              {!COMMON_TIMEZONE_OPTIONS.some((opt) => opt.value === timezone) && (
                <option value={timezone}>{timezone}</option>
              )}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Visibility <span className="text-red-500">*</span>
            </label>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as MeetingVisibility)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="organisation">Organisation (Visible to all members)</option>
              <option value="attendees_only">Attendees Only (Restricted / Private)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Location Type <span className="text-red-500">*</span>
            </label>
            <select
              value={locationType}
              onChange={(e) => setLocationType(e.target.value as MeetingLocationType)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="virtual">Virtual</option>
              <option value="in_person">In-Person</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </div>

          {(locationType === 'in_person' || locationType === 'hybrid') && (
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Physical Location <span className="text-red-500">*</span>
              </label>
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Conference Room A, HQ"
                required
              />
            </div>
          )}

          {(locationType === 'virtual' || locationType === 'hybrid') && (
            <div className={locationType === 'hybrid' ? 'col-span-full' : 'md:col-span-2'}>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Virtual Meeting URL <span className="text-red-500">*</span>
              </label>
              <Input
                type="url"
                value={virtualUrl}
                onChange={(e) => setVirtualUrl(e.target.value)}
                placeholder="https://meet.google.com/xyz-abc or Zoom URL"
                required
              />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
          <Button type="button" variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={isSubmitting}>
            {isSubmitting ? 'Scheduling...' : 'Schedule Meeting'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
