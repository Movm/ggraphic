// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The one module that talks to the Studio server. Every response is parsed
 * with zod: the shapes mirror `apps/studio-server/src/contract.ts`, the
 * server's source of truth. The server serves this app, so every call is
 * same-origin (`/api/...`).
 */
import { z } from 'zod';

const projectSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  schemaVersion: z.number().int(),
  version: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
  thumbnailUrl: z.string().nullable(),
});

const projectSchema = projectSummarySchema.extend({
  document: z.record(z.string(), z.unknown()),
});

const projectListSchema = z.object({ projects: z.array(projectSummarySchema) });

const configSchema = z.object({
  features: z.object({ ai: z.boolean() }),
  limits: z.object({
    uploadBytes: z.number().int(),
    thumbnailBytes: z.number().int(),
    documentBytes: z.number().int(),
  }),
  uploadTypes: z.array(z.string()),
});

const uploadSchema = z.object({
  url: z.string(),
  contentType: z.string(),
  size: z.number().int(),
});

const draftSchema = z.object({
  headline: z.string(),
  subline: z.string(),
  body: z.string().optional(),
  callToAction: z.string().optional(),
});

const errorSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
  currentVersion: z.number().int().optional(),
});

export type ProjectSummary = z.infer<typeof projectSummarySchema>;
export type Project = z.infer<typeof projectSchema>;
export type StudioConfig = z.infer<typeof configSchema>;
export type Upload = z.infer<typeof uploadSchema>;
export type Draft = z.infer<typeof draftSchema>;

/** A failed call: HTTP status plus the server's `{ error, message?, currentVersion? }`. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly currentVersion: number | null = null
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isVersionConflict(): boolean {
    return this.status === 409;
  }
}

async function request<T>(
  path: string,
  schema: z.ZodType<T> | null,
  init: RequestInit = {}
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, init);
  } catch {
    throw new ApiError(0, 'network_error', 'The server is not reachable.');
  }
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const parsed = errorSchema.safeParse(body);
    throw new ApiError(
      response.status,
      parsed.success ? parsed.data.error : 'http_error',
      (parsed.success ? parsed.data.message : undefined) ??
        `The request failed (HTTP ${response.status}).`,
      parsed.success ? (parsed.data.currentVersion ?? null) : null
    );
  }
  if (schema === null) return undefined as T;
  const result = schema.safeParse(await response.json());
  if (!result.success) {
    throw new ApiError(
      response.status,
      'invalid_response',
      'The server sent an unexpected answer.'
    );
  }
  return result.data;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const api = {
  getConfig: () => request('/config', configSchema),

  listProjects: async () => (await request('/projects', projectListSchema)).projects,

  getProject: (id: string) => request(`/projects/${encodeURIComponent(id)}`, projectSchema),

  createProject: (body: { name: string; document: Record<string, unknown> }) =>
    request('/projects', projectSchema, json('POST', body)),

  updateProject: (
    id: string,
    body: { version: number; name?: string; document?: Record<string, unknown> }
  ) => request(`/projects/${encodeURIComponent(id)}`, projectSchema, json('PATCH', body)),

  deleteProject: (id: string) =>
    request(`/projects/${encodeURIComponent(id)}`, null, { method: 'DELETE' }),

  putThumbnail: (id: string, png: Blob) =>
    request(`/projects/${encodeURIComponent(id)}/thumbnail`, projectSummarySchema, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: png,
    }),

  upload: (file: Blob, filename: string) => {
    const form = new FormData();
    form.append('file', file, filename);
    return request('/uploads', uploadSchema, { method: 'POST', body: form });
  },

  draft: (body: { briefing: string; width: number; height: number }) =>
    request('/ai/draft', draftSchema, json('POST', body)),
};
