import React, { useState, useEffect } from 'react';
import { Video } from 'lucide-react';
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
  const [conferenceProvider, setConferenceProvider] = useState<'google_meet' | 'manual'>('manual');
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);
  const [isLoadingIntegration, setIsLoadingIntegration] = useState(false);

  useEffect(() => {
    if (isOpen && orgId) {
      let isMounted = true;
      setIsLoadingIntegration(true);
      apiClient<{ status: string; isConnected?: boolean }>(
        `/organisations/${orgId}/integrations/google/status`
      )
        .then((res) => {
          if (isMounted) {
            const connected = res.data?.status === 'connected';
            setIsGoogleConnected(connected);
            if (connected) {
              setConferenceProvider('google_meet');
            } else {
              setConferenceProvider('manual');
            }
          }
        })
        .catch(() => {
          if (isMounted) {
            setIsGoogleConnected(false);
            setConferenceProvider('manual');
          }
        })
        .finally(() => {
          if (isMounted) {
            setIsLoadingIntegration(false);
          }
        });

      return () => {
        isMounted = false;
      };
    }
  }, [isOpen, orgId]);

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
    setConferenceProvider(isGoogleConnected ? 'google_meet' : 'manual');
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

    if (locationType === 'virtual' || locationType === 'hybrid') {
      if (conferenceProvider === 'manual' && !virtualUrl.trim()) {
        setErrorMsg('Virtual meeting URL is required for manual link meetings.');
        return;
      }
    }

    try {
      setIsSubmitting(true);

      let finalConferenceProvider: 'manual' | 'google_meet' | 'none' = 'none';
      if (locationType === 'virtual' || locationType === 'hybrid') {
        finalConferenceProvider = conferenceProvider === 'google_meet' && isGoogleConnected
          ? 'google_meet'
          : 'manual';
      }

      const payload = {
        title: title.trim(),
        description: description.trim() || undefined,
        startAt: startDate.toISOString(),
        endAt: endDate.toISOString(),
        timezone,
        locationType,
        location: locationType !== 'virtual' ? location.trim() : undefined,
        virtualUrl: (locationType !== 'in_person' && finalConferenceProvider === 'manual') ? virtualUrl.trim() : undefined,
        visibility,
        conferenceProvider: finalConferenceProvider,
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
          <div className={(locationType === 'in_person' || locationType === 'hybrid') ? 'md:col-span-1' : 'col-span-full'}>
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
        </div>

        {(locationType === 'virtual' || locationType === 'hybrid') && (
          <div className="space-y-3 pt-1">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Conferencing Provider <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={!isGoogleConnected}
                  onClick={() => setConferenceProvider('google_meet')}
                  className={`flex items-start gap-2.5 p-3 rounded-lg border text-left transition-all ${
                    conferenceProvider === 'google_meet' && isGoogleConnected
                      ? 'border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600 text-slate-900'
                      : isGoogleConnected
                      ? 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                      : 'border-slate-200 bg-slate-50 opacity-60 cursor-not-allowed text-slate-400'
                  }`}
                  data-testid="provider-google-meet-option"
                >
                  <Video
                    className={`h-4 w-4 mt-0.5 shrink-0 ${
                      conferenceProvider === 'google_meet' && isGoogleConnected
                        ? 'text-indigo-600'
                        : 'text-slate-400'
                    }`}
                  />
                  <div>
                    <div className="text-sm font-medium flex items-center gap-1.5">
                      Google Meet (Automatic)
                      {!isGoogleConnected && !isLoadingIntegration && (
                        <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-500 bg-slate-200/70 px-1.5 py-0.5 rounded">
                          Not connected
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {isGoogleConnected
                        ? 'A Google Meet link will be generated automatically.'
                        : 'Requires Google Workspace connection in Organisation Settings.'}
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setConferenceProvider('manual')}
                  className={`flex items-start gap-2.5 p-3 rounded-lg border text-left transition-all ${
                    conferenceProvider === 'manual'
                      ? 'border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600 text-slate-900'
                      : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                  }`}
                  data-testid="provider-manual-option"
                >
                  <div className="h-4 w-4 mt-0.5 shrink-0 flex items-center justify-center font-bold text-xs text-slate-500">
                    🔗
                  </div>
                  <div>
                    <div className="text-sm font-medium">Manual Link</div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Paste an existing Zoom, Microsoft Teams, or custom URL.
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {conferenceProvider === 'google_meet' && isGoogleConnected ? (
              <div
                className="p-3 bg-indigo-50/60 rounded-md border border-indigo-100 text-xs text-indigo-900 space-y-1"
                data-testid="google-meet-provisioning-notice"
              >
                <p className="font-medium flex items-center gap-1.5">
                  <Video className="h-3.5 w-3.5 text-indigo-600" />
                  Automatic Meeting Provisioning
                </p>
                <p className="text-indigo-700">
                  ManageX will provision a video conference container on the organisation's Google Calendar.
                  Attendee emails are not shared with Google; participants join securely through ManageX.
                </p>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Virtual Meeting URL <span className="text-red-500">*</span>
                </label>
                <Input
                  type="url"
                  value={virtualUrl}
                  onChange={(e) => setVirtualUrl(e.target.value)}
                  placeholder="https://meet.google.com/xyz-abc or Zoom URL"
                  required={conferenceProvider === 'manual'}
                  data-testid="manual-virtual-url-input"
                />
              </div>
            )}
          </div>
        )}

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
