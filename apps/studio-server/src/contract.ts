// SPDX-License-Identifier: AGPL-3.0-only
// Request and response shapes of /api. Types are derived from these schemas only.
import { z } from 'zod';
import { brandColorsSchema, fontFamily, hexColor } from './brand/brandPackSchema.ts';

/** The editor document. Opaque to the server: any JSON object. */
const documentSchema = z.record(z.string(), z.unknown());
const nameSchema = z.string().trim().min(1).max(200);
const schemaVersionSchema = z.int().min(1);

export const projectIdSchema = z.uuid();

export const createProjectBody = z.object({
  name: nameSchema.default('Untitled'),
  document: documentSchema.default({}),
  schemaVersion: schemaVersionSchema.default(1),
});

export const updateProjectBody = z
  .object({
    /** The version the client last read. A mismatch is answered with 409. */
    version: z.int().min(1),
    name: nameSchema.optional(),
    document: documentSchema.optional(),
    schemaVersion: schemaVersionSchema.optional(),
  })
  .refine((b) => b.name !== undefined || b.document !== undefined, {
    message: 'name or document is required',
  });

export const projectSummarySchema = z.object({
  id: z.uuid(),
  organisationId: z.uuid(),
  name: z.string(),
  schemaVersion: z.int(),
  version: z.int(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  /** Relative URL, cache-busted by the thumbnail's update time; null without a thumbnail. */
  thumbnailUrl: z.string().nullable(),
});

/** A project in the trash. Without a document or thumbnail: it can only be restored or purged. */
export const trashItemSchema = z.object({
  id: z.uuid(),
  organisationId: z.uuid(),
  name: z.string(),
  deletedAt: z.iso.datetime(),
  /** When the purge may remove it for good. */
  purgeAt: z.iso.datetime(),
  /** Whole days until then, rounded up; 0 once it is due. */
  daysLeft: z.int(),
});

export const projectSchema = projectSummarySchema.extend({ document: documentSchema });

export const draftBody = z.object({
  briefing: z.string().trim().min(1).max(4000),
  /** Free text, e.g. "Instagram post" or "A4 poster". */
  format: z.string().trim().min(1).max(100).optional(),
  width: z.int().min(1).max(20_000).optional(),
  height: z.int().min(1).max(20_000).optional(),
});

/** What the model must return. Empty optional fields are dropped. */
export const draftSchema = z.object({
  headline: z.string().trim().min(1).max(300),
  subline: z.string().trim().max(500),
  body: z
    .string()
    .trim()
    .max(2000)
    .nullish()
    .transform((v) => v || undefined),
  callToAction: z
    .string()
    .trim()
    .max(200)
    .nullish()
    .transform((v) => v || undefined),
});

const offerId = z.string().regex(/^[a-z0-9-]{1,64}$/);
const offerText = z.string().trim().min(1).max(200);

/** The templates and colour worlds the model may choose from, and the brief to choose for. */
export const pickBody = z.object({
  brief: z.string().trim().min(1).max(4000),
  templates: z
    .array(
      z.object({
        id: offerId,
        label: offerText,
        description: offerText,
        slots: z
          .array(z.object({ id: offerId, label: offerText, maxChars: z.int().min(1).max(2000) }))
          .min(1)
          .max(8),
      })
    )
    .min(1)
    .max(12),
  schemes: z.array(z.object({ id: offerId, label: offerText })).max(8),
  format: z
    .object({ width: z.int().min(1).max(20_000), height: z.int().min(1).max(20_000) })
    .nullish(),
});

export const pickSchema = z.object({
  templateId: z.string(),
  schemeId: z.string().nullable(),
  fills: z.record(z.string(), z.string()),
});

export const configSchema = z.object({
  features: z.object({ ai: z.boolean(), removeBackground: z.boolean() }),
  limits: z.object({
    uploadBytes: z.int(),
    thumbnailBytes: z.int(),
    documentBytes: z.int(),
  }),
  uploadTypes: z.array(z.string()),
});

export const uploadSchema = z.object({
  url: z.string(),
  contentType: z.string(),
  size: z.int(),
});

export const errorSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
  currentVersion: z.int().optional(),
});

// --- Accounts and organisations -------------------------------------------------------

export const roleSchema = z.enum(['owner', 'editor']);
const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));
const displayNameSchema = z.string().trim().min(1).max(100);
// Length bounds mirror src/auth/passwords.ts.
const passwordSchema = z.string().min(10).max(256);

export const signupBody = z.object({
  email: emailSchema,
  displayName: displayNameSchema,
  password: passwordSchema,
});

/** First-run setup: a signup plus the token the server printed at start. */
export const setupBody = signupBody.extend({ setupToken: z.string().max(200).default('') });

// Login checks no length rule: a wrong password is just wrong.
export const loginBody = z.object({
  email: emailSchema,
  password: z.string().min(1).max(256),
});

export const organisationSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  role: roleSchema,
});

export const accountSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  displayName: z.string(),
  isInstanceAdmin: z.boolean(),
});

export const sessionStateSchema = z.object({
  /** True while the instance has no account: the next visitor sets it up. */
  setupRequired: z.boolean(),
  registrationOpen: z.boolean(),
  account: accountSchema.nullable(),
  /** Send as X-CSRF-Token on every non-GET request. */
  csrfToken: z.string().nullable(),
  organisations: z.array(organisationSchema),
  /** Always false: one organisation per person. Deprecated, kept for older web clients. */
  canCreateOrganisations: z.boolean(),
});

// --- Brand packs ------------------------------------------------------------------------

export const brandSettingsBody = z.object({
  name: z.string().trim().min(1).max(100),
  colors: brandColorsSchema,
  backgrounds: z
    .array(z.object({ label: z.string().trim().min(1).max(40), color: hexColor, ink: hexColor }))
    .min(1)
    .max(12),
  fonts: z.object({ headline: fontFamily, body: fontFamily }),
  logoAssetId: z.uuid().nullable().default(null),
});

export const fontUploadFields = z.object({
  family: fontFamily,
  weight: z.coerce.number().int().min(100).max(900).multipleOf(100).default(400),
  style: z.enum(['normal', 'italic']).default('normal'),
  /** Required: what the uploader declares, e.g. OFL-1.1, Apache-2.0 or "own licence". */
  licence: z.string().trim().min(1).max(100),
});

export const brandAssetSchema = z.object({
  id: z.uuid(),
  kind: z.enum(['logo', 'font']),
  url: z.string(),
  contentType: z.string(),
  size: z.int(),
  family: z.string().nullable(),
  weight: z.int().nullable(),
  style: z.enum(['normal', 'italic']).nullable(),
  licence: z.string().nullable(),
});

export type BrandSettings = z.output<typeof brandSettingsBody>;
export type BrandAsset = z.infer<typeof brandAssetSchema>;

export type Role = z.infer<typeof roleSchema>;
export type SessionState = z.infer<typeof sessionStateSchema>;
export type Organisation = z.infer<typeof organisationSchema>;

export type CreateProjectBody = z.infer<typeof createProjectBody>;
export type UpdateProjectBody = z.infer<typeof updateProjectBody>;
export type ProjectSummary = z.infer<typeof projectSummarySchema>;
export type Project = z.infer<typeof projectSchema>;
export type TrashItem = z.infer<typeof trashItemSchema>;
export type DraftBody = z.infer<typeof draftBody>;
export type PickBody = z.infer<typeof pickBody>;
export type Pick = z.infer<typeof pickSchema>;
export type Draft = z.output<typeof draftSchema>;
export type StudioConfig = z.infer<typeof configSchema>;
export type Upload = z.infer<typeof uploadSchema>;
export type ApiError = z.infer<typeof errorSchema>;
