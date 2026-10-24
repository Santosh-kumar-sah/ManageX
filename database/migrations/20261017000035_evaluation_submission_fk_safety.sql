-- Detach only the optional submission reference when a submission is removed.
-- The tenant key remains intact for the historical evaluation session.

ALTER TABLE evaluation_sessions
  DROP CONSTRAINT IF EXISTS fk_evaluation_sessions_submission;

ALTER TABLE evaluation_sessions
  ADD CONSTRAINT fk_evaluation_sessions_submission
  FOREIGN KEY (organisation_id, submission_id)
  REFERENCES event_submissions(organisation_id, id)
  ON DELETE SET NULL (submission_id);
