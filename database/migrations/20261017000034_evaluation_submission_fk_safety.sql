-- Keep the tenant key intact when a submission is referenced by an evaluation session.
-- Historical evaluation sessions must not be silently detached from their tenant.

ALTER TABLE evaluation_sessions
  DROP CONSTRAINT IF EXISTS fk_evaluation_sessions_submission;

ALTER TABLE evaluation_sessions
  ADD CONSTRAINT fk_evaluation_sessions_submission
  FOREIGN KEY (organisation_id, submission_id)
  REFERENCES event_submissions(organisation_id, id) ON DELETE RESTRICT;
