// SPDX-License-Identifier: AGPL-3.0-only
// Mirrors migrations/*.sql, which are the runtime DDL. Keep both in sync.
import { type InferSelectModel, sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer }>({
  dataType: () => 'bytea',
});

/** Owner of everything that existed before accounts (migration 0002). */
export const DEFAULT_ORGANISATION_ID = '00000000-0000-4000-8000-000000000001';

export const ROLES = ['owner', 'editor'] as const;
export type Role = (typeof ROLES)[number];

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  displayName: text('display_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  isInstanceAdmin: boolean('is_instance_admin').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable('sessions', {
  tokenHash: text('token_hash').primaryKey(),
  accountId: uuid('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  csrfToken: text('csrf_token').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
});

export const organisations = pgTable('organisations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const memberships = pgTable(
  'memberships',
  {
    organisationId: uuid('organisation_id')
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ROLES }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.organisationId, t.accountId] })]
);

export const invitations = pgTable('invitations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tokenHash: text('token_hash').notNull().unique(),
  organisationId: uuid('organisation_id')
    .notNull()
    .references(() => organisations.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ROLES }).notNull(),
  createdBy: uuid('created_by').references(() => accounts.id, { onDelete: 'set null' }),
  allowsSignup: boolean('allows_signup').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  acceptedBy: uuid('accepted_by').references(() => accounts.id, { onDelete: 'set null' }),
});

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: text('owner_id'),
  organisationId: uuid('organisation_id')
    .notNull()
    .references(() => organisations.id),
  name: text('name').notNull(),
  document: jsonb('document')
    .$type<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  schemaVersion: integer('schema_version').notNull().default(1),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const projectThumbnails = pgTable('project_thumbnails', {
  projectId: uuid('project_id')
    .primaryKey()
    .references(() => projects.id, { onDelete: 'cascade' }),
  png: bytea('png').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const uploads = pgTable('uploads', {
  fileName: text('file_name').primaryKey(),
  organisationId: uuid('organisation_id')
    .notNull()
    .references(() => organisations.id, { onDelete: 'cascade' }),
  contentType: text('content_type').notNull(),
  size: integer('size').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const brandAssets = pgTable('brand_assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  organisationId: uuid('organisation_id')
    .notNull()
    .references(() => organisations.id, { onDelete: 'cascade' }),
  kind: text('kind', { enum: ['logo', 'font'] }).notNull(),
  fileName: text('file_name').notNull().unique(),
  contentType: text('content_type').notNull(),
  size: integer('size').notNull(),
  fontFamily: text('font_family'),
  fontWeight: integer('font_weight'),
  fontStyle: text('font_style', { enum: ['normal', 'italic'] }),
  licence: text('licence'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const brandPacks = pgTable('brand_packs', {
  organisationId: uuid('organisation_id')
    .primaryKey()
    .references(() => organisations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  colors: jsonb('colors').$type<Record<string, string>>().notNull(),
  backgrounds: jsonb('backgrounds').$type<unknown[]>().notNull(),
  fonts: jsonb('fonts').$type<Record<string, unknown>>().notNull(),
  logoAssetId: uuid('logo_asset_id').references(() => brandAssets.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type ProjectRow = InferSelectModel<typeof projects>;
export type AccountRow = InferSelectModel<typeof accounts>;
export type BrandAssetRow = InferSelectModel<typeof brandAssets>;
export type BrandPackRow = InferSelectModel<typeof brandPacks>;
