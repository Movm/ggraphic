-- SPDX-License-Identifier: AGPL-3.0-only
-- Projects: one editor document each. The document is opaque JSON for the server.

CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Prepared for accounts (Better Auth uses text ids). NULL while there is no login.
  owner_id text,
  name text NOT NULL,
  document jsonb NOT NULL DEFAULT '{}'::jsonb,
  schema_version integer NOT NULL DEFAULT 1,
  -- Optimistic concurrency: every update must name the version it read.
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX projects_owner_updated_idx ON projects (owner_id, updated_at DESC);

-- Kept out of `projects` so listing and loading never drag the PNG along.
CREATE TABLE project_thumbnails (
  project_id uuid PRIMARY KEY REFERENCES projects (id) ON DELETE CASCADE,
  png bytea NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
