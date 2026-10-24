-- ==============================================================================
-- ManageX Database Migration: 20261017000026_round_scoped_submissions_evaluations.sql
-- Phase 02C: Multi-Round Submissions, Advancement & Scoring Core Integrity
-- Strictly adheres to ADR-001, ADR-003, ADR-008, ADR-009, docs/security.md, and PRD Section 7.
-- ==============================================================================

-- 1. Backfill any unassigned submissions to Round 1 of the respective event
UPDATE event_submissions s
SET round_id = r.id
FROM event_rounds r
WHERE r.event_id = s.event_id AND r.round_number = 1 AND s.round_id IS NULL;

-- 2. Drop legacy single-round submission uniqueness constraint
ALTER TABLE event_submissions DROP CONSTRAINT IF EXISTS uq_event_submissions_event_team;

-- 3. Composite Foreign Key & Round-Scoped Integrity on event_submissions
ALTER TABLE event_submissions
  DROP CONSTRAINT IF EXISTS fk_event_submissions_event_round,
  ADD CONSTRAINT fk_event_submissions_event_round
    FOREIGN KEY (event_id, round_id)
    REFERENCES event_rounds(event_id, id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_event_submissions_round_team
  ON event_submissions (round_id, team_id)
  WHERE team_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_event_submissions_round_user
  ON event_submissions (round_id, submitter_user_id)
  WHERE team_id IS NULL;

ALTER TABLE event_submissions
  DROP CONSTRAINT IF EXISTS uq_event_submissions_round_id,
  ADD CONSTRAINT uq_event_submissions_round_id UNIQUE (round_id, id);

-- 4. Backfill any unassigned scores to matching submission's round
UPDATE event_scores sc
SET round_id = s.round_id
FROM event_submissions s
WHERE sc.submission_id = s.id AND sc.round_id IS NULL;

-- Composite foreign key on event_scores ensuring scores belong to the same round as the submission
ALTER TABLE event_scores
  DROP CONSTRAINT IF EXISTS fk_event_scores_round_submission,
  ADD CONSTRAINT fk_event_scores_round_submission
    FOREIGN KEY (round_id, submission_id)
    REFERENCES event_submissions(round_id, id) ON DELETE CASCADE;

-- 5. Round-Scoped Scoring Criteria Integrity
ALTER TABLE event_scoring_criteria DROP CONSTRAINT IF EXISTS uq_criteria_event_name;

CREATE UNIQUE INDEX IF NOT EXISTS uq_criteria_round_name
  ON event_scoring_criteria (round_id, name)
  WHERE round_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_criteria_event_global_name
  ON event_scoring_criteria (event_id, name)
  WHERE round_id IS NULL;

ALTER TABLE event_scoring_criteria
  DROP CONSTRAINT IF EXISTS fk_criteria_event_round,
  ADD CONSTRAINT fk_criteria_event_round
    FOREIGN KEY (event_id, round_id)
    REFERENCES event_rounds(event_id, id) ON DELETE CASCADE;

-- 6. Composite Foreign Key on event_round_advancements
ALTER TABLE event_round_advancements
  DROP CONSTRAINT IF EXISTS fk_advancements_event_round,
  ADD CONSTRAINT fk_advancements_event_round
    FOREIGN KEY (event_id, round_id)
    REFERENCES event_rounds(event_id, id) ON DELETE CASCADE;

-- 7. Fix Advancement Uniqueness: Replace NULLS NOT DISTINCT with Partial Unique Indexes
-- Standard NULLS NOT DISTINCT blocked having multiple teams with participant_user_id = NULL
ALTER TABLE event_round_advancements
  DROP CONSTRAINT IF EXISTS uq_round_advancements_team,
  DROP CONSTRAINT IF EXISTS uq_round_advancements_user;

CREATE UNIQUE INDEX IF NOT EXISTS uq_round_advancements_team
  ON event_round_advancements (round_id, team_id)
  WHERE team_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_round_advancements_user
  ON event_round_advancements (round_id, participant_user_id)
  WHERE participant_user_id IS NOT NULL;

