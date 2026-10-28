-- Trash: deleting a project sets deleted_at; it is purged for good after 30 days
-- (src/trashPurge.ts). Existing rows stay live. Additive only: nothing is dropped.
ALTER TABLE projects ADD COLUMN deleted_at timestamptz;

-- projects has no unique key besides its primary key, so there is no uniqueness to
-- restrict to live rows. Thumbnails cascade with the row and need no column of their own.
CREATE INDEX projects_org_live_updated_idx
  ON projects (organisation_id, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX projects_trashed_idx ON projects (deleted_at) WHERE deleted_at IS NOT NULL;
