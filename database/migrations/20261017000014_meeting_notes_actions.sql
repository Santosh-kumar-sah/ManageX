-- Migration: 20261017000014_meeting_notes_actions.sql
-- Description: Phase 7B Confidential Notes/Minutes & Action Items Schema
-- Adheres to PRD §8.2, MTG-005, MTG-006, ADR-014, and tenant RLS invariants

-- 1. Create meeting_notes table (Confidential minutes document)
CREATE TABLE IF NOT EXISTS meeting_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_by_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_meeting_notes_meeting UNIQUE (meeting_id),
  CONSTRAINT fk_meeting_notes_org_meeting FOREIGN KEY (meeting_id, organisation_id) REFERENCES meetings(id, organisation_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_meeting_notes_meeting ON meeting_notes(meeting_id);
CREATE INDEX IF NOT EXISTS ix_meeting_notes_org ON meeting_notes(organisation_id);

-- Enable and force RLS on meeting_notes
ALTER TABLE meeting_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_notes FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meeting_notes_tenant_isolation ON meeting_notes;
CREATE POLICY meeting_notes_tenant_isolation ON meeting_notes
  FOR ALL
  TO managex_app
  USING (organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid)
  WITH CHECK (organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid);

-- 2. Create meeting_action_items table
CREATE TABLE IF NOT EXISTS meeting_action_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  assignee_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  due_date DATE,
  priority VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'done', 'cancelled')),
  agenda_item_id UUID REFERENCES meeting_agenda_items(id) ON DELETE SET NULL,
  created_by_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_meeting_actions_org_meeting FOREIGN KEY (meeting_id, organisation_id) REFERENCES meetings(id, organisation_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_meeting_action_items_meeting ON meeting_action_items(meeting_id);
CREATE INDEX IF NOT EXISTS ix_meeting_action_items_org ON meeting_action_items(organisation_id);
CREATE INDEX IF NOT EXISTS ix_meeting_action_items_assignee ON meeting_action_items(assignee_id);
CREATE INDEX IF NOT EXISTS ix_meeting_action_items_status ON meeting_action_items(status);

-- Enable and force RLS on meeting_action_items
ALTER TABLE meeting_action_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_action_items FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meeting_action_items_tenant_isolation ON meeting_action_items;
CREATE POLICY meeting_action_items_tenant_isolation ON meeting_action_items
  FOR ALL
  TO managex_app
  USING (organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid)
  WITH CHECK (organisation_id = NULLIF(current_setting('app.current_organisation_id', true), '')::uuid);

-- 3. Grant DML permissions to restricted runtime application role
GRANT SELECT, INSERT, UPDATE, DELETE ON meeting_notes TO managex_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON meeting_action_items TO managex_app;
