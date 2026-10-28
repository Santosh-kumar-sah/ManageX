/**
 * ManageX Google Meet Orchestration Service (Phase 1B.4)
 * Strictly adheres to docs/google-meet-integration-plan.md (Sections 3.2 #4, 5, 6, 7.2, 11.3),
 * AGENTS.md, docs/security.md, and PRD Section 8.1.
 *
 * Invariants:
 * - Two-Stage Decoupled Pattern: 0 database transactions held open across Google HTTP calls.
 * - 45-second atomic database lease claim prevents concurrent worker clashes.
 * - Deterministic Base32hex Event IDs (meet + 32-hex UUID) prevent duplicate events.
 * - Option A Pure Conferencing Container: attendees: [] (strict privacy guarantee).
 * - ETag If-Match validation on events.patch with self-healing on lease expiration.
 * - Compensation logic: in-flight creation/update during cancellation triggers events.delete.
 * - Revoked credentials during cancellation mark status 'abandoned' (zero infinite loops).
 * - Provider errors mark 'failed_create' / 'failed_reschedule' without invalidating meetings.
 */

import { randomUUID } from 'node:crypto';
import { withTenantTransaction } from '../database/transaction.js';
import { refreshAccessToken } from './googleOAuthService.js';
import {
  createCalendarEvent,
  getCalendarEvent,
  patchCalendarEvent,
  deleteCalendarEvent,
} from './googleCalendarClient.js';
import { recordAuditEvent } from '../audit/auditService.js';
import { logger } from '../middleware/logger.js';
import { AppError } from '../common/errors.js';

export const LEASE_DURATION_INTERVAL = "INTERVAL '45 seconds'";

/**
 * Derives the deterministic Google Calendar Event ID from a ManageX meeting UUID.
 * Constraints: Base32hex characters [0-9a-v], length 5-1024.
 *
 * @param {string} meetingId - Canonical meeting UUID
 * @returns {string} Deterministic Google event ID: meet + 32 hex characters
 */
export function deriveGoogleEventId(meetingId) {
  if (!meetingId || typeof meetingId !== 'string') {
    throw new Error('Valid meetingId required to derive Google event ID');
  }
  return `meet${meetingId.replace(/-/g, '').toLowerCase()}`;
}

/**
 * Atomically acquires a 45-second synchronization lease on a meeting record.
 *
 * @param {object} params
 * @param {string} params.organisationId - Target organisation UUID
 * @param {string} params.meetingId - Target meeting UUID
 * @param {string} [params.actorUserId] - Optional user context
 * @returns {Promise<object|null>} Meeting claim details or null if lease could not be acquired
 */
export async function acquireMeetingSyncLease({ organisationId, meetingId, actorUserId = null }) {
  const claimToken = randomUUID();

  return withTenantTransaction(
    { organisationId, userId: actorUserId, isPlatformAdmin: false },
    async (client) => {
      const query = `
        UPDATE meetings
        SET google_sync_claimed_at = NOW(),
            google_sync_claim_token = $1,
            google_sync_last_attempt_at = NOW()
        WHERE id = $2 AND organisation_id = $3
          AND google_sync_status IN (
            'pending_create', 'failed_create',
            'pending_update', 'failed_reschedule',
            'pending_delete', 'failed_cancel'
          )
          AND (google_sync_claimed_at IS NULL OR google_sync_claimed_at < NOW() - ${LEASE_DURATION_INTERVAL})
          AND (status != 'cancelled' OR google_sync_status IN ('pending_delete', 'failed_cancel'))
        RETURNING
          id,
          organisation_id,
          title,
          description,
          start_at,
          end_at,
          timezone,
          location_type,
          conference_provider,
          google_calendar_event_id,
          google_calendar_etag,
          google_conference_request_id,
          google_sync_status,
          google_sync_claim_token,
          status;
      `;

      const res = await client.query(query, [claimToken, meetingId, organisationId]);
      if (res.rows.length === 0) {
        return null;
      }
      return res.rows[0];
    }
  );
}

/**
 * Executes high-level Google Meet synchronization for a meeting.
 * Implements the Two-Stage Decoupled Pattern across create, update, and cancel lifecycles.
 *
 * @param {object} params
 * @param {string} params.organisationId - Target organisation UUID
 * @param {string} params.meetingId - Target meeting UUID
 * @param {string} [params.actorUserId] - Optional initiating user UUID
 * @returns {Promise<{ success: boolean, status: string, virtualUrl?: string | null, error?: string | null }>}
 */
export async function syncMeetingWithGoogle({ organisationId, meetingId, actorUserId = null }) {
  if (!organisationId || !meetingId) {
    throw new Error('Organisation ID and Meeting ID are required for Google synchronization');
  }

  // 1. Acquire 45s atomic lease (Stage 1 short-lived DB transaction)
  const claimedMeeting = await acquireMeetingSyncLease({
    organisationId,
    meetingId,
    actorUserId,
  });

  if (!claimedMeeting) {
    logger.info(
      { organisationId, meetingId },
      'Could not acquire Google sync lease (already claimed, synced, or ineligible)'
    );
    return {
      success: false,
      status: 'lease_unavailable',
    };
  }

  const claimToken = claimedMeeting.google_sync_claim_token;
  const syncOperation = claimedMeeting.google_sync_status;
  const googleEventId = deriveGoogleEventId(meetingId);
  const conferenceRequestId = claimedMeeting.google_conference_request_id || randomUUID();

  // 2. Stage 2: External HTTP calls (OUTSIDE any database transaction)
  let accessToken = null;
  try {
    const tokenResult = await refreshAccessToken({ organisationId });
    accessToken = tokenResult.accessToken;
  } catch (authErr) {
    logger.warn(
      { organisationId, meetingId, err: authErr.message },
      'Failed to resolve Google access token for sync'
    );

    // If meeting was cancelled and credentials are revoked/missing -> mark abandoned (Section 5.3 Outcome C)
    const isCancelledOrDeleting =
      claimedMeeting.status === 'cancelled' ||
      syncOperation === 'pending_delete' ||
      syncOperation === 'failed_cancel';

    if (isCancelledOrDeleting) {
      await withTenantTransaction(
        { organisationId, userId: actorUserId, isPlatformAdmin: false },
        async (txClient) => {
          await txClient.query(
            `UPDATE meetings
             SET google_sync_status = 'abandoned',
                 google_sync_error = 'Google credentials revoked or disconnected',
                 google_sync_claimed_at = NULL,
                 google_sync_claim_token = NULL,
                 updated_at = NOW()
             WHERE id = $1 AND organisation_id = $2 AND google_sync_claim_token = $3`,
            [meetingId, organisationId, claimToken]
          );

          await recordAuditEvent({
            organisationId,
            actorId: actorUserId,
            action: 'meeting.google_sync_abandoned',
            entityType: 'meeting',
            entityId: meetingId,
            metadata: {
              reason: 'Credentials revoked or disconnected during cancellation',
            },
            client: txClient,
          });
        }
      );

      return {
        success: false,
        status: 'abandoned',
        error: 'Google credentials revoked or disconnected',
      };
    }

    // Otherwise mark failed_create or failed_reschedule
    const failedStatus =
      syncOperation === 'pending_update' || syncOperation === 'failed_reschedule'
        ? 'failed_reschedule'
        : 'failed_create';

    await withTenantTransaction(
      { organisationId, userId: actorUserId, isPlatformAdmin: false },
      async (txClient) => {
        await txClient.query(
          `UPDATE meetings
           SET google_sync_status = $1,
               google_sync_error = $2,
               google_sync_claimed_at = NULL,
               google_sync_claim_token = NULL,
               updated_at = NOW()
           WHERE id = $3 AND organisation_id = $4 AND google_sync_claim_token = $5`,
          [failedStatus, authErr.message, meetingId, organisationId, claimToken]
        );
      }
    );

    return {
      success: false,
      status: failedStatus,
      error: authErr.message,
    };
  }

  // 3. Execute appropriate lifecycle action
  try {
    // -------------------------------------------------------------------------
    // Case 1: Create Link (pending_create, failed_create)
    // -------------------------------------------------------------------------
    if (syncOperation === 'pending_create' || syncOperation === 'failed_create') {
      let createdEvent = null;

      // Reconciliation probe: check if event already exists upstream (Section 6.2 #2)
      const existingUpstream = await getCalendarEvent({
        accessToken,
        eventId: googleEventId,
      });

      if (existingUpstream && existingUpstream.status !== 'cancelled') {
        createdEvent = existingUpstream;
      } else {
        try {
          createdEvent = await createCalendarEvent({
            accessToken,
            eventId: googleEventId,
            summary: claimedMeeting.title,
            description: claimedMeeting.description || `managex-meeting-${meetingId}`,
            startAt: claimedMeeting.start_at.toISOString(),
            endAt: claimedMeeting.end_at.toISOString(),
            timezone: claimedMeeting.timezone,
            conferenceRequestId,
          });
        } catch (createErr) {
          // If 409 conflict: another worker created it upstream, fetch it
          if (createErr.code === 'GOOGLE_EVENT_CONFLICT' || createErr.status === 409) {
            createdEvent = await getCalendarEvent({
              accessToken,
              eventId: googleEventId,
            });
          } else {
            throw createErr;
          }
        }
      }

      const hangoutLink = createdEvent?.hangoutLink || null;
      const etag = createdEvent?.etag || null;

      // Stage 3 write: commit Meet link and synced status
      const writeResult = await withTenantTransaction(
        { organisationId, userId: actorUserId, isPlatformAdmin: false },
        async (txClient) => {
          const updateRes = await txClient.query(
            `UPDATE meetings
             SET virtual_url = COALESCE($1, virtual_url),
                 google_calendar_event_id = $2,
                 google_calendar_etag = $3,
                 google_sync_status = 'synced',
                 google_sync_claimed_at = NULL,
                 google_sync_claim_token = NULL,
                 google_sync_error = NULL,
                 updated_at = NOW()
             WHERE id = $4 AND organisation_id = $5
               AND google_sync_claim_token = $6
               AND status != 'cancelled'
             RETURNING id, virtual_url, status;`,
            [hangoutLink, googleEventId, etag, meetingId, organisationId, claimToken]
          );

          if (updateRes.rows.length === 0) {
            // Check why rowCount === 0: either lease expired or meeting was cancelled in-flight
            const checkRes = await txClient.query(
              'SELECT status, google_sync_status FROM meetings WHERE id = $1 AND organisation_id = $2',
              [meetingId, organisationId]
            );
            return {
              rowCount: 0,
              currentMeeting: checkRes.rows[0] || null,
            };
          }

          await recordAuditEvent({
            organisationId,
            actorId: actorUserId,
            action: 'meeting.google_synced',
            entityType: 'meeting',
            entityId: meetingId,
            metadata: {
              googleEventId,
              hangoutLink,
            },
            client: txClient,
          });

          return {
            rowCount: 1,
            meeting: updateRes.rows[0],
          };
        }
      );

      // Handle lost lease / in-flight cancellation compensation (Section 5.2 #3, 5.3 #1)
      if (writeResult.rowCount === 0) {
        if (writeResult.currentMeeting?.status === 'cancelled') {
          logger.info(
            { organisationId, meetingId, googleEventId },
            'Meeting cancelled during in-flight Google creation. Triggering compensation delete.'
          );
          await deleteCalendarEvent({ accessToken, eventId: googleEventId }).catch((e) =>
            logger.warn({ err: e.message }, 'Compensation delete failed')
          );
        }
        return {
          success: false,
          status: 'stale_write_discarded',
        };
      }

      return {
        success: true,
        status: 'synced',
        virtualUrl: hangoutLink,
      };
    }

    // -------------------------------------------------------------------------
    // Case 2: Reschedule Event (pending_update, failed_reschedule)
    // -------------------------------------------------------------------------
    if (syncOperation === 'pending_update' || syncOperation === 'failed_reschedule') {
      let patchedEvent = null;

      try {
        patchedEvent = await patchCalendarEvent({
          accessToken,
          eventId: googleEventId,
          summary: claimedMeeting.title,
          description: claimedMeeting.description || undefined,
          startAt: claimedMeeting.start_at.toISOString(),
          endAt: claimedMeeting.end_at.toISOString(),
          timezone: claimedMeeting.timezone,
          etag: claimedMeeting.google_calendar_etag || undefined,
        });
      } catch (patchErr) {
        // If 412 Precondition Failed: ETag mismatch, re-fetch event ETag and retry patch once (Section 5.2 #4)
        if (patchErr.code === 'GOOGLE_ETAG_PRECONDITION_FAILED' || patchErr.status === 412) {
          logger.warn(
            { organisationId, meetingId, googleEventId },
            'ETag mismatch on patch, refreshing upstream event and retrying'
          );
          const currentUpstream = await getCalendarEvent({ accessToken, eventId: googleEventId });
          if (currentUpstream) {
            patchedEvent = await patchCalendarEvent({
              accessToken,
              eventId: googleEventId,
              summary: claimedMeeting.title,
              description: claimedMeeting.description || undefined,
              startAt: claimedMeeting.start_at.toISOString(),
              endAt: claimedMeeting.end_at.toISOString(),
              timezone: claimedMeeting.timezone,
              etag: currentUpstream.etag,
            });
          }
        } else if (patchErr.code === 'GOOGLE_EVENT_NOT_FOUND' || patchErr.status === 404) {
          // Event vanished upstream: re-create it
          patchedEvent = await createCalendarEvent({
            accessToken,
            eventId: googleEventId,
            summary: claimedMeeting.title,
            description: claimedMeeting.description || undefined,
            startAt: claimedMeeting.start_at.toISOString(),
            endAt: claimedMeeting.end_at.toISOString(),
            timezone: claimedMeeting.timezone,
            conferenceRequestId,
          });
        } else {
          throw patchErr;
        }
      }

      const etag = patchedEvent?.etag || null;
      const hangoutLink = patchedEvent?.hangoutLink || null;

      // Stage 3 write
      const writeResult = await withTenantTransaction(
        { organisationId, userId: actorUserId, isPlatformAdmin: false },
        async (txClient) => {
          const updateRes = await txClient.query(
            `UPDATE meetings
             SET virtual_url = COALESCE($1, virtual_url),
                 google_calendar_etag = $2,
                 google_sync_status = 'synced',
                 google_sync_claimed_at = NULL,
                 google_sync_claim_token = NULL,
                 google_sync_error = NULL,
                 updated_at = NOW()
             WHERE id = $3 AND organisation_id = $4
               AND google_sync_claim_token = $5
               AND status != 'cancelled'
             RETURNING id, virtual_url, status;`,
            [hangoutLink, etag, meetingId, organisationId, claimToken]
          );

          if (updateRes.rows.length === 0) {
            const checkRes = await txClient.query(
              'SELECT status, start_at, end_at FROM meetings WHERE id = $1 AND organisation_id = $2',
              [meetingId, organisationId]
            );
            return {
              rowCount: 0,
              currentMeeting: checkRes.rows[0] || null,
            };
          }

          await recordAuditEvent({
            organisationId,
            actorId: actorUserId,
            action: 'meeting.google_rescheduled',
            entityType: 'meeting',
            entityId: meetingId,
            metadata: {
              googleEventId,
              etag,
            },
            client: txClient,
          });

          return { rowCount: 1 };
        }
      );

      if (writeResult.rowCount === 0) {
        if (writeResult.currentMeeting?.status === 'cancelled') {
          await deleteCalendarEvent({ accessToken, eventId: googleEventId }).catch((e) =>
            logger.warn({ err: e.message }, 'Compensation delete failed')
          );
        }
        return {
          success: false,
          status: 'stale_write_discarded',
        };
      }

      return {
        success: true,
        status: 'synced',
        virtualUrl: hangoutLink,
      };
    }

    // -------------------------------------------------------------------------
    // Case 3: Cancel/Delete Event (pending_delete, failed_cancel)
    // -------------------------------------------------------------------------
    if (syncOperation === 'pending_delete' || syncOperation === 'failed_cancel') {
      await deleteCalendarEvent({
        accessToken,
        eventId: googleEventId,
      });

      await withTenantTransaction(
        { organisationId, userId: actorUserId, isPlatformAdmin: false },
        async (txClient) => {
          await txClient.query(
            `UPDATE meetings
             SET google_sync_status = 'none',
                 google_calendar_event_id = NULL,
                 google_calendar_etag = NULL,
                 google_sync_claimed_at = NULL,
                 google_sync_claim_token = NULL,
                 google_sync_error = NULL,
                 updated_at = NOW()
             WHERE id = $1 AND organisation_id = $2
               AND google_sync_claim_token = $3`,
            [meetingId, organisationId, claimToken]
          );

          await recordAuditEvent({
            organisationId,
            actorId: actorUserId,
            action: 'meeting.google_deleted',
            entityType: 'meeting',
            entityId: meetingId,
            metadata: {
              googleEventId,
            },
            client: txClient,
          });
        }
      );

      return {
        success: true,
        status: 'none',
      };
    }
  } catch (syncErr) {
    logger.error(
      { organisationId, meetingId, syncOperation, err: syncErr.message },
      'Google Calendar synchronization operation failed'
    );

    // Determine error state
    let targetFailureStatus = 'failed_create';
    if (syncOperation === 'pending_update' || syncOperation === 'failed_reschedule') {
      targetFailureStatus = 'failed_reschedule';
    } else if (syncOperation === 'pending_delete' || syncOperation === 'failed_cancel') {
      targetFailureStatus = 'failed_cancel';
    }

    await withTenantTransaction(
      { organisationId, userId: actorUserId, isPlatformAdmin: false },
      async (txClient) => {
        await txClient.query(
          `UPDATE meetings
           SET google_sync_status = $1,
               google_sync_error = $2,
               google_sync_claimed_at = NULL,
               google_sync_claim_token = NULL,
               updated_at = NOW()
           WHERE id = $3 AND organisation_id = $4
             AND google_sync_claim_token = $5`,
          [targetFailureStatus, syncErr.message, meetingId, organisationId, claimToken]
        );

        await recordAuditEvent({
          organisationId,
          actorId: actorUserId,
          action: 'meeting.google_sync_failed',
          entityType: 'meeting',
          entityId: meetingId,
          metadata: {
            operation: syncOperation,
            error: syncErr.message,
          },
          client: txClient,
        });
      }
    );

    return {
      success: false,
      status: targetFailureStatus,
      error: syncErr.message,
    };
  }
}
