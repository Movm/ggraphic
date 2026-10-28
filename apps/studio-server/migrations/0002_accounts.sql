-- SPDX-License-Identifier: AGPL-3.0-only
-- Accounts, sessions, organisations, invitations and brand packs.
-- See docs/accounts-and-brand-packs.md. Every existing project moves to the default
-- organisation; the first account created by setup becomes its owner.

CREATE TABLE accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  display_name text NOT NULL,
  -- argon2id PHC string.
  password_hash text NOT NULL,
  is_instance_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX accounts_email_idx ON accounts (lower(email));

-- The cookie carries a random token; only its SHA-256 is stored.
CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  csrf_token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sessions_account_idx ON sessions (account_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

CREATE TABLE organisations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- The default organisation: owner of everything that existed before accounts.
INSERT INTO organisations (id, name)
VALUES ('00000000-0000-4000-8000-000000000001', 'My organisation');

CREATE TABLE memberships (
  organisation_id uuid NOT NULL REFERENCES organisations (id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'editor')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organisation_id, account_id)
);

CREATE INDEX memberships_account_idx ON memberships (account_id);

CREATE TABLE invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  organisation_id uuid NOT NULL REFERENCES organisations (id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'editor')),
  created_by uuid REFERENCES accounts (id) ON DELETE SET NULL,
  -- Whether accepting may create a new account (creator was instance admin).
  allows_signup boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  accepted_by uuid REFERENCES accounts (id) ON DELETE SET NULL
);

CREATE INDEX invitations_organisation_idx ON invitations (organisation_id);

-- Projects: expand, backfill, contract. No project is left without an organisation.
ALTER TABLE projects ADD COLUMN organisation_id uuid REFERENCES organisations (id);
UPDATE projects SET organisation_id = '00000000-0000-4000-8000-000000000001';
ALTER TABLE projects ALTER COLUMN organisation_id SET NOT NULL;
CREATE INDEX projects_organisation_updated_idx ON projects (organisation_id, updated_at DESC);

-- Upload files on disk and the organisation they belong to. Files that existed before
-- are registered to the default organisation at start (adoptLegacyUploads).
CREATE TABLE uploads (
  file_name text PRIMARY KEY,
  organisation_id uuid NOT NULL REFERENCES organisations (id) ON DELETE CASCADE,
  content_type text NOT NULL,
  size integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX uploads_organisation_idx ON uploads (organisation_id);

CREATE TABLE brand_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('logo', 'font')),
  file_name text NOT NULL UNIQUE,
  content_type text NOT NULL,
  size integer NOT NULL,
  font_family text,
  font_weight integer,
  font_style text CHECK (font_style IN ('normal', 'italic')),
  -- Declared by the uploader, stored with the file. Required for fonts.
  licence text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    kind <> 'font'
    OR (font_family IS NOT NULL AND font_weight IS NOT NULL AND font_style IS NOT NULL
        AND licence IS NOT NULL AND length(trim(licence)) > 0)
  )
);

CREATE INDEX brand_assets_organisation_idx ON brand_assets (organisation_id);

-- The owner's brand settings. The BrandPack is built from these on read.
CREATE TABLE brand_packs (
  organisation_id uuid PRIMARY KEY REFERENCES organisations (id) ON DELETE CASCADE,
  name text NOT NULL,
  colors jsonb NOT NULL,
  backgrounds jsonb NOT NULL,
  fonts jsonb NOT NULL,
  logo_asset_id uuid REFERENCES brand_assets (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
