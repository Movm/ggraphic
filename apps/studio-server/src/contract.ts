// SPDX-License-Identifier: AGPL-3.0-only
// Request and response shapes of /api. Types are derived from these schemas only.
import { z } from 'zod';

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

export const configSchema = z.object({
  features: z.object({ ai: z.boolean() }),
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
const orgNameSchema = z.string().trim().min(1).max(100);

export const signupBody = z.object({
  email: emailSchema,
  displayName: displayNameSchema,
  password: passwordSchema,
});

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
  /** Whether this account may create organisations. */
  canCreateOrganisations: z.boolean(),
});

export const createOrganisationBody = z.object({ name: orgNameSchema });

export const memberSchema = z.object({
  accountId: z.uuid(),
  email: z.string(),
  displayName: z.string(),
  role: roleSchema,
});

export const updateMemberBody = z.object({ role: roleSchema });

export const createInvitationBody = z.object({ role: roleSchema.default('editor') });

export const invitationSchema = z.object({
  id: z.uuid(),
  role: roleSchema,
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  allowsSignup: z.boolean(),
  /** Only in the answer to the create call: the token is not stored. */
  url: z.string().optional(),
});

export const invitationInfoSchema = z.object({
  organisationName: z.string(),
  role: roleSchema,
  /** Whether a new account can be created with this link. */
  allowsSignup: z.boolean(),
});

export type Role = z.infer<typeof roleSchema>;
export type SessionState = z.infer<typeof sessionStateSchema>;
export type Organisation = z.infer<typeof organisationSchema>;
export type Member = z.infer<typeof memberSchema>;
export type Invitation = z.infer<typeof invitationSchema>;
export type InvitationInfo = z.infer<typeof invitationInfoSchema>;

export type CreateProjectBody = z.infer<typeof createProjectBody>;
export type UpdateProjectBody = z.infer<typeof updateProjectBody>;
export type ProjectSummary = z.infer<typeof projectSummarySchema>;
export type Project = z.infer<typeof projectSchema>;
export type DraftBody = z.infer<typeof draftBody>;
export type Draft = z.output<typeof draftSchema>;
export type StudioConfig = z.infer<typeof configSchema>;
export type Upload = z.infer<typeof uploadSchema>;
export type ApiError = z.infer<typeof errorSchema>;
