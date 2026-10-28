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

export type CreateProjectBody = z.infer<typeof createProjectBody>;
export type UpdateProjectBody = z.infer<typeof updateProjectBody>;
export type ProjectSummary = z.infer<typeof projectSummarySchema>;
export type Project = z.infer<typeof projectSchema>;
export type DraftBody = z.infer<typeof draftBody>;
export type Draft = z.output<typeof draftSchema>;
export type StudioConfig = z.infer<typeof configSchema>;
export type Upload = z.infer<typeof uploadSchema>;
export type ApiError = z.infer<typeof errorSchema>;
