-- ManageX Migration 033: Evaluation invitations, submission linkage, and completion state

CREATE TABLE evaluation_judge_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  event_id UUID NOT NULL,
  round_evaluation_id UUID NOT NULL,
  panel_id UUID NOT NULL,
  invited_by_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  invited_email VARCHAR(255) NOT NULL,
  invited_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  status VARCHAR(32) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_eval_invitation_event
    FOREIGN KEY (organisation_id, event_id)
    REFERENCES events(organisation_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_eval_invitation_eval
    FOREIGN KEY (organisation_id, round_evaluation_id)
    REFERENCES round_evaluations(organisation_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_eval_invitation_panel
    FOREIGN KEY (round_evaluation_id, panel_id)
    REFERENCES evaluation_panels(round_evaluation_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_eval_invitation_scope
  ON evaluation_judge_invitations (organisation_id, event_id, round_evaluation_id, panel_id);
CREATE INDEX idx_eval_invitation_email
  ON evaluation_judge_invitations (LOWER(invited_email));

ALTER TABLE evaluation_judge_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluation_judge_invitations FORCE ROW LEVEL SECURITY;

CREATE POLICY evaluation_judge_invitation_select ON evaluation_judge_invitations
  FOR SELECT TO managex_app
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
    OR invited_user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  );

CREATE POLICY evaluation_judge_invitation_insert ON evaluation_judge_invitations
  FOR INSERT TO managex_app
  WITH CHECK (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY evaluation_judge_invitation_update ON evaluation_judge_invitations
  FOR UPDATE TO managex_app
  USING (
    COALESCE(NULLIF(current_setting('app.current_is_platform_admin', true), ''), 'false')::boolean = true
    OR organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
    OR invited_user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
  )
  WITH CHECK (
    organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid
  );

CREATE POLICY evaluation_judge_invitation_delete ON evaluation_judge_invitations
  FOR DELETE TO managex_app
  USING (organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON evaluation_judge_invitations TO managex_app;

CREATE POLICY pjudges_invitation_accept ON evaluation_panel_judges
  FOR INSERT TO managex_app
  WITH CHECK (
    judge_user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    AND EXISTS (
      SELECT 1
      FROM evaluation_judge_invitations i
      WHERE i.organisation_id = evaluation_panel_judges.organisation_id
        AND i.round_evaluation_id = evaluation_panel_judges.round_evaluation_id
        AND i.panel_id = evaluation_panel_judges.panel_id
        AND i.invited_user_id = evaluation_panel_judges.judge_user_id
        AND i.status = 'accepted'
    )
  );

ALTER TABLE evaluation_sessions
  ADD COLUMN submission_id UUID;

ALTER TABLE evaluation_sessions
  ADD CONSTRAINT fk_evaluation_sessions_submission
  FOREIGN KEY (organisation_id, submission_id)
  REFERENCES event_submissions(organisation_id, id) ON DELETE SET NULL;

CREATE INDEX idx_evaluation_sessions_submission
  ON evaluation_sessions (submission_id)
  WHERE submission_id IS NOT NULL;
