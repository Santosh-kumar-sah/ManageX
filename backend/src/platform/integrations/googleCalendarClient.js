/**
 * ManageX Google Calendar API v3 Gateway (Phase 1B.4)
 * Strictly adheres to docs/google-meet-integration-plan.md (Sections 3.2 #3, 5.2, 6, 7.2, 11.3),
 * AGENTS.md, docs/security.md, and PRD Section 8.1.
 *
 * Invariants:
 * - Option A Pure Conferencing Container: attendees: [] passed to Google Calendar (Section 7.2).
 * - sendUpdates=none strictly enforced to suppress Google email delivery (Section 7.1).
 * - Bounded HTTP timeout (8,000ms) enforced via AbortController (Section 5.2 #1).
 * - Transient backoff: max 1 retry for HTTP 429 or 503 provider errors (1,000ms delay).
 * - Deterministic Base32hex Event IDs ([0-9a-v], meet + 32-hex UUID) (Section 6.2).
 * - Upstream ETag If-Match validation on events.patch (Section 5.2 #4).
 * - Idempotent deletion semantics: HTTP 200, 204, 404, and 410 treated as successful deletion.
 * - Zero secrets exposed in logs or errors.
 */

import { logger } from '../middleware/logger.js';
import { AppError } from '../common/errors.js';

export const GOOGLE_CALENDAR_EVENTS_ENDPOINT = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
export const HTTP_TIMEOUT_MS = 8000;
export const RETRY_DELAY_MS = 1000;

/**
 * Executes an HTTP request to Google Calendar API with timeout and bounded backoff.
 *
 * @param {object} params
 * @param {string} params.url
 * @param {string} [params.method='GET']
 * @param {string} params.accessToken
 * @param {object} [params.headers={}]
 * @param {object} [params.body=null]
 * @param {number} [params.timeoutMs=8000]
 * @param {number} [params.retryCount=1]
 * @returns {Promise<{ status: number, data: any, headers: Headers }>}
 */
async function executeCalendarRequest({
  url,
  method = 'GET',
  accessToken,
  headers = {},
  body = null,
  timeoutMs = HTTP_TIMEOUT_MS,
  retryCount = 1,
}) {
  let attempt = 0;
  const maxAttempts = 1 + Math.max(0, retryCount);

  while (attempt < maxAttempts) {
    attempt++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const requestHeaders = {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        ...headers,
      };

      const requestInit = {
        method,
        headers: requestHeaders,
        signal: controller.signal,
      };

      if (body) {
        requestHeaders['Content-Type'] = 'application/json';
        requestInit.body = JSON.stringify(body);
      }

      const response = await fetch(url, requestInit);

      // Handle transient rate limit (429) or temporary server unavailability (503)
      if ((response.status === 429 || response.status === 503) && attempt < maxAttempts) {
        logger.warn(
          { status: response.status, attempt, maxAttempts, url },
          'Google Calendar API returned transient status, retrying after delay'
        );
        clearTimeout(timer);
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        continue;
      }

      let data = null;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await response.json().catch(() => null);
      } else {
        const text = await response.text().catch(() => '');
        if (text) {
          try {
            data = JSON.parse(text);
          } catch {
            data = { text };
          }
        }
      }

      return {
        status: response.status,
        data,
        headers: response.headers,
      };
    } catch (err) {
      if (err.name === 'AbortError') {
        logger.error({ method, url, timeoutMs }, 'Google Calendar API request timed out');
        throw new AppError(
          `Google Calendar API request timed out after ${timeoutMs}ms`,
          504,
          'GOOGLE_API_TIMEOUT'
        );
      }

      // If network failure on transient attempt, retry once
      if (attempt < maxAttempts) {
        logger.warn({ err: err.message, attempt }, 'Google Calendar API request failed, retrying');
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        continue;
      }

      logger.error({ err: err.message, method, url }, 'Google Calendar API request failed');
      throw new AppError(
        `Google Calendar API network error: ${err.message}`,
        502,
        'GOOGLE_API_NETWORK_ERROR'
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Creates a Google Calendar event with Hangouts Meet conferencing under Option A.
 *
 * @param {object} params
 * @param {string} params.accessToken - Valid OAuth access token
 * @param {string} params.eventId - Deterministic Base32hex event ID (meet + cleanUuid)
 * @param {string} params.summary - Meeting title
 * @param {string} [params.description] - Meeting description
 * @param {string} params.startAt - ISO 8601 start timestamp
 * @param {string} params.endAt - ISO 8601 end timestamp
 * @param {string} params.timezone - IANA timezone identifier
 * @param {string} params.conferenceRequestId - Unique UUID for Hangouts Meet creation request
 * @returns {Promise<{ eventId: string, hangoutLink: string | null, etag: string, conferenceStatus: string | null, raw: object }>}
 */
export async function createCalendarEvent({
  accessToken,
  eventId,
  summary,
  description,
  startAt,
  endAt,
  timezone,
  conferenceRequestId,
}) {
  const url = `${GOOGLE_CALENDAR_EVENTS_ENDPOINT}?conferenceDataVersion=1&sendUpdates=none`;

  // Option A (Section 7.2): Pure Conferencing Container
  // attendees: [] (strict privacy guarantee: zero attendee emails passed to Google)
  const body = {
    id: eventId,
    summary,
    description: description || undefined,
    start: {
      dateTime: startAt,
      timeZone: timezone,
    },
    end: {
      dateTime: endAt,
      timeZone: timezone,
    },
    attendees: [],
    conferenceData: {
      createRequest: {
        requestId: conferenceRequestId,
        conferenceSolutionKey: {
          type: 'hangoutsMeet',
        },
      },
    },
  };

  const res = await executeCalendarRequest({
    url,
    method: 'POST',
    accessToken,
    body,
  });

  if (res.status === 409) {
    throw new AppError(
      `Google Calendar event with ID '${eventId}' already exists`,
      409,
      'GOOGLE_EVENT_CONFLICT'
    );
  }

  if (res.status === 401) {
    throw new AppError(
      'Google OAuth access token is invalid or expired',
      401,
      'GOOGLE_TOKEN_EXPIRED'
    );
  }

  if (res.status < 200 || res.status >= 300) {
    const errorMsg = res.data?.error?.message || `HTTP ${res.status}`;
    logger.error({ status: res.status, error: res.data?.error }, 'Google Calendar event creation failed');
    throw new AppError(
      `Google Calendar event creation failed: ${errorMsg}`,
      res.status === 400 ? 400 : 502,
      'GOOGLE_EVENT_CREATE_FAILED'
    );
  }

  const data = res.data;
  const hangoutLink =
    data.hangoutLink ||
    data.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri ||
    null;

  const conferenceStatus = data.conferenceData?.createRequest?.status?.statusCode || null;

  return {
    eventId: data.id,
    hangoutLink,
    etag: data.etag,
    conferenceStatus,
    raw: data,
  };
}

/**
 * Retrieves a Google Calendar event by ID.
 *
 * @param {object} params
 * @param {string} params.accessToken
 * @param {string} params.eventId
 * @returns {Promise<{ eventId: string, hangoutLink: string | null, etag: string, description: string | null, status: string }|null>}
 */
export async function getCalendarEvent({ accessToken, eventId }) {
  const url = `${GOOGLE_CALENDAR_EVENTS_ENDPOINT}/${encodeURIComponent(eventId)}`;

  const res = await executeCalendarRequest({
    url,
    method: 'GET',
    accessToken,
  });

  if (res.status === 404 || res.status === 410) {
    return null;
  }

  if (res.status === 401) {
    throw new AppError(
      'Google OAuth access token is invalid or expired',
      401,
      'GOOGLE_TOKEN_EXPIRED'
    );
  }

  if (res.status < 200 || res.status >= 300) {
    const errorMsg = res.data?.error?.message || `HTTP ${res.status}`;
    throw new AppError(
      `Failed to retrieve Google Calendar event: ${errorMsg}`,
      502,
      'GOOGLE_EVENT_GET_FAILED'
    );
  }

  const data = res.data;
  const hangoutLink =
    data.hangoutLink ||
    data.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri ||
    null;

  return {
    eventId: data.id,
    hangoutLink,
    etag: data.etag,
    description: data.description || null,
    status: data.status,
    raw: data,
  };
}

/**
 * Updates an existing Google Calendar event via PATCH with optimistic concurrency (ETag).
 *
 * @param {object} params
 * @param {string} params.accessToken
 * @param {string} params.eventId
 * @param {string} [params.summary]
 * @param {string} [params.description]
 * @param {string} [params.startAt]
 * @param {string} [params.endAt]
 * @param {string} [params.timezone]
 * @param {string} [params.etag] - Optional ETag for If-Match concurrency guard
 * @returns {Promise<{ eventId: string, hangoutLink: string | null, etag: string, raw: object }>}
 */
export async function patchCalendarEvent({
  accessToken,
  eventId,
  summary,
  description,
  startAt,
  endAt,
  timezone,
  etag,
}) {
  const url = `${GOOGLE_CALENDAR_EVENTS_ENDPOINT}/${encodeURIComponent(eventId)}?sendUpdates=none`;

  const body = {};
  if (summary !== undefined) body.summary = summary;
  if (description !== undefined) body.description = description;
  if (startAt && timezone) {
    body.start = { dateTime: startAt, timeZone: timezone };
  }
  if (endAt && timezone) {
    body.end = { dateTime: endAt, timeZone: timezone };
  }

  const headers = {};
  if (etag) {
    headers['If-Match'] = etag;
  }

  const res = await executeCalendarRequest({
    url,
    method: 'PATCH',
    accessToken,
    headers,
    body,
  });

  if (res.status === 412) {
    throw new AppError(
      `Google Calendar ETag mismatch for event '${eventId}'. Resource was modified concurrently.`,
      412,
      'GOOGLE_ETAG_PRECONDITION_FAILED'
    );
  }

  if (res.status === 404 || res.status === 410) {
    throw new AppError(
      `Google Calendar event '${eventId}' not found for update`,
      404,
      'GOOGLE_EVENT_NOT_FOUND'
    );
  }

  if (res.status === 401) {
    throw new AppError(
      'Google OAuth access token is invalid or expired',
      401,
      'GOOGLE_TOKEN_EXPIRED'
    );
  }

  if (res.status < 200 || res.status >= 300) {
    const errorMsg = res.data?.error?.message || `HTTP ${res.status}`;
    throw new AppError(
      `Failed to patch Google Calendar event: ${errorMsg}`,
      502,
      'GOOGLE_EVENT_PATCH_FAILED'
    );
  }

  const data = res.data;
  const hangoutLink =
    data.hangoutLink ||
    data.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri ||
    null;

  return {
    eventId: data.id,
    hangoutLink,
    etag: data.etag,
    raw: data,
  };
}

/**
 * Deletes a Google Calendar event.
 * Idempotent: HTTP 200, 204, 404, and 410 are all treated as successful deletion.
 *
 * @param {object} params
 * @param {string} params.accessToken
 * @param {string} params.eventId
 * @returns {Promise<boolean>} True if event is deleted or was already non-existent
 */
export async function deleteCalendarEvent({ accessToken, eventId }) {
  const url = `${GOOGLE_CALENDAR_EVENTS_ENDPOINT}/${encodeURIComponent(eventId)}?sendUpdates=none`;

  const res = await executeCalendarRequest({
    url,
    method: 'DELETE',
    accessToken,
  });

  // 200/204: cleanly deleted
  // 404/410: already gone (idempotent success)
  if (res.status === 200 || res.status === 204 || res.status === 404 || res.status === 410) {
    return true;
  }

  if (res.status === 401) {
    throw new AppError(
      'Google OAuth access token is invalid or expired',
      401,
      'GOOGLE_TOKEN_EXPIRED'
    );
  }

  const errorMsg = res.data?.error?.message || `HTTP ${res.status}`;
  throw new AppError(
    `Failed to delete Google Calendar event: ${errorMsg}`,
    502,
    'GOOGLE_EVENT_DELETE_FAILED'
  );
}
