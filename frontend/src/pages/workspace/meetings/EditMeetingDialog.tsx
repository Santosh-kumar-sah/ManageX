import React, { useState, useEffect } from 'react';
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

interface EditMeetingDialogProps {
  isOpen: boolean;
  onClose: () => void;
  orgId: string;
  meeting: MeetingItem;
  onMeetingUpdated: (updatedMeeting: MeetingItem) => void;
}

const formatToDateTimeLocal = (isoStr: string) => {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function EditMeetingDialog({
  isOpen,
  onClose,
  orgId,
  meeting,
  onMeetingUpdated,
}: EditMeetingDialogProps) {
  const [title, setTitle] = useState(meeting.title || '');
  const [description, setDescription] = useState(meeting.description || '');
  const [timezone, setTimezone] = useState(
    normalizeTimeZone(meeting.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata')
  );
  const [locationType, setLocationType] = useState<MeetingLocationType>(
    meeting.locationType || 'virtual'
  );
  const [location, setLocation] = useState(meeting.location || '');
  const [virtualUrl, setVirtualUrl] = useState(meeting.virtualUrl || '');
  const [visibility, setVisibility] = useState<MeetingVisibility>(
    meeting.visibility || 'organisation'
  );
  const [startAt, setStartAt] = useState(formatToDateTimeLocal(meeting.startAt));
  const [endAt, setEndAt] = useState(formatToDateTimeLocal(meeting.endAt));

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTitle(meeting.title || '');
      setDescription(meeting.description || '');
      setTimezone(normalizeTimeZone(meeting.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata'));
      setLocationType(meeting.locationType || 'virtual');
      setLocation(meeting.location || '');
      setVirtualUrl(meeting.virtualUrl || '');
      setVisibility(meeting.visibility || 'organisation');
      setStartAt(formatToDateTimeLocal(meeting.startAt));
      setEndAt(formatToDateTimeLocal(meeting.endAt));
      setErrorMsg(null);
    }
  }, [isOpen, meeting]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle || trimmedTitle.length < 2) {
      setErrorMsg('Meeting title must be at least 2 characters.');
      return;
    }

    const startDate = new Date(startAt);
    const endDate = new Date(endAt);

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

    if (virtualUrl.trim() && !/^https?:\/\//i.test(virtualUrl.trim())) {
      setErrorMsg('Virtual URL must be a valid http or https URL.');
      return;
    }

    try {
      setIsSubmitting(true);

      const payload = {
        title: trimmedTitle,
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
        `/organisations/${orgId}/meetings/${meeting.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify(payload),
        }
      );

      if (res.data?.meeting) {
        onMeetingUpdated(res.data.meeting);
        onClose();
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Failed to update meeting. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Meeting"
      description="Update meeting schedule, location, and visibility details."
      className="max-w-xl max-h-[90vh] overflow-y-auto"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {errorMsg && (
          <Alert variant="error" data-testid="edit-meeting-error">
            {errorMsg}
          </Alert>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Meeting Title <span className="text-red-500">*</span>
          </label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Weekly Product Sync"
            required
            disabled={isSubmitting}
            data-testid="edit-meeting-title"
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
            placeholder="Meeting goals, topics, or instructions..."
            disabled={isSubmitting}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-900 bg-white"
            data-testid="edit-meeting-description"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Start Time <span className="text-red-500">*</span>
            </label>
            <Input
              type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              required
              disabled={isSubmitting}
              data-testid="edit-meeting-start-at"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              End Time <span className="text-red-500">*</span>
            </label>
            <Input
              type="datetime-local"
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
              required
              disabled={isSubmitting}
              data-testid="edit-meeting-end-at"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Timezone <span className="text-red-500">*</span>
            </label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              disabled={isSubmitting}
              className="w-full h-10 px-3 py-2 text-sm border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-900 bg-white"
              data-testid="edit-meeting-timezone"
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
              Location Type <span className="text-red-500">*</span>
            </label>
            <select
              value={locationType}
              onChange={(e) =>
                setLocationType(e.target.value as MeetingLocationType)
              }
              disabled={isSubmitting}
              className="w-full h-10 px-3 py-2 text-sm border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-900 bg-white"
              data-testid="edit-meeting-location-type"
            >
              <option value="virtual">Virtual (Online)</option>
              <option value="in_person">In-Person</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </div>
        </div>

        {locationType !== 'virtual' && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Physical Location <span className="text-red-500">*</span>
            </label>
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Conference Room 3B, HQ Building"
              required
              disabled={isSubmitting}
              data-testid="edit-meeting-location"
            />
          </div>
        )}

        {locationType !== 'in_person' && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Virtual Meeting URL <span className="text-red-500">*</span>
            </label>
            <Input
              type="url"
              value={virtualUrl}
              onChange={(e) => setVirtualUrl(e.target.value)}
              placeholder="https://meet.google.com/... or https://zoom.us/j/..."
              required
              disabled={isSubmitting}
              data-testid="edit-meeting-virtual-url"
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Visibility
          </label>
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as MeetingVisibility)}
            disabled={isSubmitting}
            className="w-full h-10 px-3 py-2 text-sm border border-slate-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-900 bg-white"
            data-testid="edit-meeting-visibility"
          >
            <option value="organisation">Organisation (Visible to all members)</option>
            <option value="attendees_only">Attendees Only (Restricted to invited participants)</option>
          </select>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={isSubmitting}
            data-testid="edit-meeting-submit"
          >
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
