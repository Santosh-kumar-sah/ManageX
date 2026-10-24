/**
 * ManageX Public / Member Invitation Router
 * Strictly adheres to PRD Section 6.2 (ORG-005, ORG-006) and docs/api-contracts.md.
 * 
 * Endpoints:
 * - GET  /api/v1/invitations/:token        -> Safe inspection of invitation details (unauthenticated)
 * - POST /api/v1/invitations/:token/accept -> Accept invitation & create active membership (requires authenticated matching user)
 */

import { Router } from 'express';
import { requireAuth, requireVerifiedUser } from '../platform/middleware/auth.js';
import {
  getInvitationByToken,
  acceptInvitation,
} from '../platform/organisations/organisationService.js';
import { acceptEvaluationJudgeInvitation } from '../platform/events/evaluationService.js';
import { sendSuccess } from '../platform/common/responses.js';

export const invitationsRouter = Router();

// -----------------------------------------------------------------------------
// 1. Safe Public Inspection of Invitation (ORG-005)
// -----------------------------------------------------------------------------
invitationsRouter.get('/:token', async (req, res, next) => {
  try {
    const invitation = await getInvitationByToken(req.params.token);
    return sendSuccess(res, 200, { invitation });
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------------
// 2. Accept Invitation and Join Organisation (ORG-005, ORG-006)
// -----------------------------------------------------------------------------
invitationsRouter.post('/:token/accept', requireAuth, requireVerifiedUser, async (req, res, next) => {
  try {
    const result = await acceptInvitation({
      rawToken: req.params.token,
      currentUser: req.user,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return sendSuccess(res, 200, {
      message: 'Invitation accepted successfully. You are now a member of this organisation.',
      ...result,
    });
  } catch (err) {
    next(err);
  }
});

invitationsRouter.post('/evaluation/:token/accept', requireAuth, requireVerifiedUser, async (req, res, next) => {
  try {
    const result = await acceptEvaluationJudgeInvitation(req.params.token, req.user, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return sendSuccess(res, 200, {
      message: 'Evaluation judge invitation accepted.',
      ...result,
    });
  } catch (err) {
    next(err);
  }
});
