-- ==============================================================================
-- ManageX Database Migration: 20261017000031_evaluation_judge_assignment_sync.sql
-- Phase 2B: Evaluation Judge Assignment Synchronization & Lineage Tracking
-- Strictly satisfies Phase 2B Requirement 4: Distinguish assignments generated
-- by the evaluation subsystem from manually created assignments without guessing.
-- ==============================================================================

-- 1. Add source, panel, and session references to event_judge_assignments
ALTER TABLE event_judge_assignments
  ADD COLUMN IF NOT EXISTS source VARCHAR(32) NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS evaluation_panel_id UUID REFERENCES evaluation_panels(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS evaluation_session_id UUID REFERENCES evaluation_sessions(id) ON DELETE CASCADE;

-- 2. Check constraint on source
ALTER TABLE event_judge_assignments
  ADD CONSTRAINT chk_judge_assignment_source
  CHECK (source IN ('manual', 'evaluation_panel', 'evaluation_session'));

-- 3. Composite and Partial Indexes for high-performance sync reconciliation
CREATE INDEX IF NOT EXISTS idx_judge_assignments_eval_panel
  ON event_judge_assignments (evaluation_panel_id)
  WHERE evaluation_panel_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_judge_assignments_eval_session
  ON event_judge_assignments (evaluation_session_id)
  WHERE evaluation_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_judge_assignments_source
  ON event_judge_assignments (source);
