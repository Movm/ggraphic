-- SPDX-License-Identifier: AGPL-3.0-only
-- Brand layout, a second logo for the other ground class. `serif` and `condensed` live in
-- the existing `fonts` jsonb. Additive: packs saved before read as before.

ALTER TABLE brand_packs ADD COLUMN layout jsonb;
ALTER TABLE brand_packs ADD COLUMN logo_alt_asset_id uuid REFERENCES brand_assets (id) ON DELETE SET NULL;
ALTER TABLE brand_packs ADD COLUMN logo_alt_ground text CHECK (logo_alt_ground IN ('dark', 'light'));
