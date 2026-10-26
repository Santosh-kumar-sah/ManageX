-- ManageX Migration 038: Meetings Lifecycle - Add Missed Status (Phase 1)
-- Strictly adheres to docs/meetings-mom-enhancement-roadmap.md (Phase 1, Section 5.1).

-- 1. Update check constraint on meetings to include 'missed'
ALTER TABLE meetings DROP CONSTRAINT IF EXISTS chk_meetings_status;

ALTER TABLE meetings ADD CONSTRAINT chk_meetings_status
  CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled', 'missed'));
