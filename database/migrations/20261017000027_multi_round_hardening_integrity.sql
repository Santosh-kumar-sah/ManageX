-- ==============================================================================
-- ManageX Database Migration: 20261017000027_multi_round_hardening_integrity.sql
-- Phase 02D: Multi-Round Hackathon Finalization & Integrity Hardening
-- Strictly adheres to ADR-001, ADR-003, ADR-008, ADR-009, docs/security.md, and PRD Section 7.
-- ==============================================================================

-- 1. Add is_manual column to event_round_advancements to preserve manual qualification decisions
ALTER TABLE event_round_advancements
  ADD COLUMN IF NOT EXISTS is_manual BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Update event_judge_assignments uniqueness to support round-scoped assignments
ALTER TABLE event_judge_assignments
  DROP CONSTRAINT IF EXISTS uq_judge_assignments_event_judge_sub;

ALTER TABLE event_judge_assignments
  DROP CONSTRAINT IF EXISTS uq_judge_assignments_event_round_judge_sub;

ALTER TABLE event_judge_assignments
  ADD CONSTRAINT uq_judge_assignments_event_round_judge_sub
  UNIQUE NULLS NOT DISTINCT (event_id, round_id, judge_user_id, submission_id);

-- 3. Composite Foreign Key on event_judge_assignments
-- Enforces that round_id must belong to the exact same event_id and restricts round deletion
ALTER TABLE event_judge_assignments
  DROP CONSTRAINT IF EXISTS fk_judge_assignments_event_round;

ALTER TABLE event_judge_assignments
  ADD CONSTRAINT fk_judge_assignments_event_round
  FOREIGN KEY (event_id, round_id)
  REFERENCES event_rounds(event_id, id)
  ON DELETE RESTRICT;

-- 4. Index on event_round_advancements (round_id, is_manual) for efficient lookup
CREATE INDEX IF NOT EXISTS idx_advancements_round_manual
  ON event_round_advancements (round_id, is_manual);
