-- SPDX-License-Identifier: AGPL-3.0-only
-- Templates an owner hid for the organisation. The id is the catalogue's template id (not a
-- foreign key: the catalogue lives in the app). Designs already made from a template stay.

CREATE TABLE hidden_templates (
  organisation_id uuid NOT NULL REFERENCES organisations (id) ON DELETE CASCADE,
  template_id text NOT NULL,
  hidden_by uuid REFERENCES accounts (id) ON DELETE SET NULL,
  hidden_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organisation_id, template_id)
);
