-- ManageX Migration 039: Meeting Action Items - Decision & Projects Task Linking (Phase 2)
-- Strictly adheres to docs/meetings-mom-enhancement-roadmap.md (Phase 2), docs/security.md, and PRD §8.2 / §9.2.

-- 1. Ensure meeting_decisions has a composite unique constraint for tenant-and-meeting-scoped foreign keys
ALTER TABLE meeting_decisions
  ADD CONSTRAINT uq_meeting_decisions_id_meeting_org
  UNIQUE (id, meeting_id, organisation_id);

-- 2. Add decision_id to meeting_action_items with composite foreign key enforcing same-meeting & same-org
ALTER TABLE meeting_action_items
  ADD COLUMN IF NOT EXISTS decision_id UUID;

ALTER TABLE meeting_action_items
  ADD CONSTRAINT fk_meeting_action_items_decision
  FOREIGN KEY (decision_id, meeting_id, organisation_id)
  REFERENCES meeting_decisions(id, meeting_id, organisation_id)
  ON DELETE SET NULL (decision_id);

-- 3. Add project_task_id to meeting_action_items with composite foreign key enforcing same-org
ALTER TABLE meeting_action_items
  ADD COLUMN IF NOT EXISTS project_task_id UUID;

ALTER TABLE meeting_action_items
  ADD CONSTRAINT fk_meeting_action_items_project_task
  FOREIGN KEY (project_task_id, organisation_id)
  REFERENCES tasks(id, organisation_id)
  ON DELETE SET NULL (project_task_id);

-- 4. Create performance indexes for decision linking and cross-meeting queries
CREATE INDEX IF NOT EXISTS ix_meeting_action_items_decision ON meeting_action_items(decision_id);
CREATE INDEX IF NOT EXISTS ix_meeting_action_items_project_task ON meeting_action_items(project_task_id);
CREATE INDEX IF NOT EXISTS ix_meeting_action_items_org_assignee_status ON meeting_action_items(organisation_id, assignee_id, status);
CREATE INDEX IF NOT EXISTS ix_meeting_action_items_org_due_date ON meeting_action_items(organisation_id, due_date);
