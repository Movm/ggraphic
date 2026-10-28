// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The one module that talks to the Studio server. Every response is parsed
 * with zod: the shapes mirror `apps/studio-server/src/contract.ts`, the
 * server's source of truth. The server serves this app, so every call is
 * same-origin (`/api/...`). Every non-GET call carries the session's CSRF token.
 */
import { type BrandPack } from '@ggraphic/core';
import { z } from 'zod';

const projectSummarySchema = z.object({
  id: z.string(),
  organisationId: z.string(),
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
  features: z.object({ ai: z.boolean(), removeBackground: z.boolean() }),
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

const pickSchema = z.object({
  templateId: z.string(),
  schemeId: z.string().nullable(),
  fills: z.record(z.string(), z.string()),
});

const errorSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
  currentVersion: z.number().int().optional(),
});

const roleSchema = z.enum(['owner', 'editor']);

const organisationSchema = z.object({ id: z.string(), name: z.string(), role: roleSchema });

const sessionSchema = z.object({
  setupRequired: z.boolean(),
  registrationOpen: z.boolean(),
  account: z
    .object({
      id: z.string(),
      email: z.string(),
      displayName: z.string(),
      isInstanceAdmin: z.boolean(),
    })
    .nullable(),
  csrfToken: z.string().nullable(),
  organisations: z.array(organisationSchema),
  canCreateOrganisations: z.boolean(),
});

const memberSchema = z.object({
  accountId: z.string(),
  email: z.string(),
  displayName: z.string(),
  role: roleSchema,
});

const invitationSchema = z.object({
  id: z.string(),
  role: roleSchema,
  createdAt: z.string(),
  expiresAt: z.string(),
  allowsSignup: z.boolean(),
  url: z.string().optional(),
});

const invitationInfoSchema = z.object({
  organisationName: z.string(),
  role: roleSchema,
  allowsSignup: z.boolean(),
});

const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const swatchSchema = z.object({ id: z.string(), label: z.string(), color: hex });

/** Mirrors the core's BrandPack; `satisfies` below keeps the two in step. */
const brandPackSchema = z.object({
  id: z.string(),
  name: z.string(),
  colors: z.object({
    primary: hex,
    secondary: hex,
    accent: hex,
    accentOnLight: hex,
    attention: hex,
    textOnDark: hex,
    textOnLight: hex,
    surface: hex,
  }),
  backgrounds: z.array(swatchSchema.extend({ ink: hex, glow: z.array(hex).optional() })),
  defaultBackground: hex,
  palette: z.array(swatchSchema),
  textPalette: z.array(swatchSchema),
  markers: z.object({ swatches: z.array(swatchSchema), ink: hex }),
  chart: z.array(hex),
  effects: z.object({ tints: z.array(hex), shadows: z.array(hex), outlines: z.array(hex) }),
  fonts: z.object({
    headline: z.string(),
    body: z.string(),
    quoteShort: z.string(),
    quoteEmphasis: z.string(),
    boldFamilies: z.record(z.string(), z.string()).optional(),
  }),
  fontFaces: z.array(
    z.object({
      family: z.string(),
      src: z.string().startsWith('/api/brand-assets/'),
      weight: z.number().int().optional(),
      style: z.enum(['normal', 'italic']).optional(),
    })
  ),
  lineHeightFactor: z.number(),
  logo: z
    .object({ src: z.string().startsWith('/api/brand-assets/'), label: z.string() })
    .nullable(),
  quoteMark: z.object({ src: z.string() }).nullable(),
}) satisfies z.ZodType<BrandPack>;

const brandSettingsSchema = z.object({
  name: z.string(),
  colors: brandPackSchema.shape.colors,
  backgrounds: z.array(z.object({ label: z.string(), color: hex, ink: hex })),
  fonts: z.object({ headline: z.string(), body: z.string() }),
  logoAssetId: z.string().nullable(),
});

const brandAssetSchema = z.object({
  id: z.string(),
  kind: z.enum(['logo', 'font']),
  url: z.string(),
  contentType: z.string(),
  size: z.number().int(),
  family: z.string().nullable(),
  weight: z.number().int().nullable(),
  style: z.enum(['normal', 'italic']).nullable(),
  licence: z.string().nullable(),
});

const brandPackResponseSchema = z.object({
  settings: brandSettingsSchema.nullable(),
  assets: z.array(brandAssetSchema),
  pack: brandPackSchema.nullable(),
  bundledFonts: z.array(z.string()),
});

export type ProjectSummary = z.infer<typeof projectSummarySchema>;
export type Role = z.infer<typeof roleSchema>;
export type Organisation = z.infer<typeof organisationSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type Member = z.infer<typeof memberSchema>;
export type Invitation = z.infer<typeof invitationSchema>;
export type InvitationInfo = z.infer<typeof invitationInfoSchema>;
export type BrandSettings = z.infer<typeof brandSettingsSchema>;
export type BrandAsset = z.infer<typeof brandAssetSchema>;
export type BrandPackResponse = z.infer<typeof brandPackResponseSchema>;
export type Project = z.infer<typeof projectSchema>;
export type StudioConfig = z.infer<typeof configSchema>;
export type Upload = z.infer<typeof uploadSchema>;
export type Draft = z.infer<typeof draftSchema>;
export type Pick = z.infer<typeof pickSchema>;

/** What the AI may choose from: `apps/studio-server/src/contract.ts` `pickBody`. */
export interface PickBody {
  brief: string;
  templates: {
    id: string;
    label: string;
    description: string;
    slots: { id: string; label: string; maxChars: number }[];
  }[];
  schemes: { id: string; label: string }[];
  format?: { width: number; height: number } | null;
}

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
    return this.status === 409 && !this.isSchemaRefusal;
  }

  /** The server holds a newer document format than this build writes. */
  get isSchemaRefusal(): boolean {
    return this.status === 409 && this.code === 'schema-version';
  }
}

// The session's CSRF token, kept in memory only (never in storage a script could read later).
let csrfToken: string | null = null;
const unauthenticatedListeners = new Set<() => void>();

/** Called when any call answers 401: the session ended, the app shows the login. */
export function onUnauthenticated(listener: () => void): () => void {
  unauthenticatedListeners.add(listener);
  return () => unauthenticatedListeners.delete(listener);
}

/** One call; a failed answer becomes an `ApiError` from the server's error body. */
async function send(path: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  if (method !== 'GET' && csrfToken) headers.set('X-CSRF-Token', csrfToken);
  let response: Response;
  try {
    response = await fetch(`/api${path}`, { ...init, headers, credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, 'network_error', 'The server is not reachable.');
  }
  if (response.status === 401 && !path.startsWith('/auth/')) {
    unauthenticatedListeners.forEach((listener) => listener());
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
  return response;
}

async function request<T>(
  path: string,
  schema: z.ZodType<T> | null,
  init: RequestInit = {}
): Promise<T> {
  const response = await send(path, init);
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

const org = (orgId: string) => `/orgs/${encodeURIComponent(orgId)}`;

/** Takes the session's CSRF token for the calls that follow. */
async function withSession(promise: Promise<Session>): Promise<Session> {
  const session = await promise;
  csrfToken = session.csrfToken;
  return session;
}

interface Signup {
  email: string;
  displayName: string;
  password: string;
}

export const api = {
  getConfig: () => request('/config', configSchema),

  // ── Session ──────────────────────────────────────────────────────────────
  getSession: () => withSession(request('/auth/session', sessionSchema)),
  setup: (body: Signup & { setupToken: string }) =>
    withSession(request('/auth/setup', sessionSchema, json('POST', body))),
  login: (body: { email: string; password: string }) =>
    withSession(request('/auth/login', sessionSchema, json('POST', body))),
  register: (body: Signup) =>
    withSession(request('/auth/register', sessionSchema, json('POST', body))),
  logout: async () => {
    await request('/auth/logout', null, { method: 'POST' });
    csrfToken = null;
  },
  getInvitation: (token: string) =>
    request(`/auth/invitations/${encodeURIComponent(token)}`, invitationInfoSchema),
  acceptInvitation: (token: string, signup: Signup | null) =>
    withSession(
      request(
        `/auth/invitations/${encodeURIComponent(token)}/accept`,
        sessionSchema,
        json('POST', signup ?? {})
      )
    ),

  // ── Organisations ────────────────────────────────────────────────────────
  createOrganisation: (name: string) =>
    request('/orgs', organisationSchema, json('POST', { name })),
  listMembers: async (orgId: string) =>
    (await request(`${org(orgId)}/members`, z.object({ members: z.array(memberSchema) }))).members,
  updateMember: (orgId: string, accountId: string, role: Role) =>
    request(
      `${org(orgId)}/members/${encodeURIComponent(accountId)}`,
      null,
      json('PATCH', { role })
    ),
  removeMember: (orgId: string, accountId: string) =>
    request(`${org(orgId)}/members/${encodeURIComponent(accountId)}`, null, {
      method: 'DELETE',
    }),
  listInvitations: async (orgId: string) =>
    (
      await request(
        `${org(orgId)}/invitations`,
        z.object({ invitations: z.array(invitationSchema) })
      )
    ).invitations,
  createInvitation: (orgId: string, role: Role) =>
    request(`${org(orgId)}/invitations`, invitationSchema, json('POST', { role })),
  revokeInvitation: (orgId: string, id: string) =>
    request(`${org(orgId)}/invitations/${encodeURIComponent(id)}`, null, { method: 'DELETE' }),

  // ── Brand pack ───────────────────────────────────────────────────────────
  getBrandPack: (orgId: string) => request(`${org(orgId)}/brand-pack`, brandPackResponseSchema),
  saveBrandPack: (orgId: string, settings: BrandSettings) =>
    request(`${org(orgId)}/brand-pack`, brandPackResponseSchema, json('PUT', settings)),
  uploadLogo: (orgId: string, file: Blob, filename: string) => {
    const form = new FormData();
    form.append('file', file, filename);
    return request(`${org(orgId)}/brand-pack/logo`, brandAssetSchema, {
      method: 'POST',
      body: form,
    });
  },
  uploadFont: (
    orgId: string,
    file: Blob,
    filename: string,
    fields: { family: string; weight: number; style: 'normal' | 'italic'; licence: string }
  ) => {
    const form = new FormData();
    // Text fields first: the server reads them before the file.
    form.append('family', fields.family);
    form.append('weight', String(fields.weight));
    form.append('style', fields.style);
    form.append('licence', fields.licence);
    form.append('file', file, filename);
    return request(`${org(orgId)}/brand-pack/fonts`, brandAssetSchema, {
      method: 'POST',
      body: form,
    });
  },
  deleteBrandAsset: (orgId: string, assetId: string) =>
    request(`${org(orgId)}/brand-pack/assets/${encodeURIComponent(assetId)}`, null, {
      method: 'DELETE',
    }),

  // ── Projects ─────────────────────────────────────────────────────────────
  listProjects: async (orgId: string) =>
    (await request(`${org(orgId)}/projects`, projectListSchema)).projects,

  getProject: (id: string) => request(`/projects/${encodeURIComponent(id)}`, projectSchema),

  createProject: (orgId: string, body: { name: string; document: Record<string, unknown> }) =>
    request(`${org(orgId)}/projects`, projectSchema, json('POST', body)),

  updateProject: (
    id: string,
    body: {
      version: number;
      name?: string;
      document?: Record<string, unknown>;
      schemaVersion?: number;
    }
  ) => request(`/projects/${encodeURIComponent(id)}`, projectSchema, json('PATCH', body)),

  deleteProject: (id: string) =>
    request(`/projects/${encodeURIComponent(id)}`, null, { method: 'DELETE' }),

  putThumbnail: (id: string, png: Blob) =>
    request(`/projects/${encodeURIComponent(id)}/thumbnail`, projectSummarySchema, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: png,
    }),

  upload: (orgId: string, file: Blob, filename: string) => {
    const form = new FormData();
    form.append('file', file, filename);
    return request(`${org(orgId)}/uploads`, uploadSchema, { method: 'POST', body: form });
  },

  draft: (body: { briefing: string; width: number; height: number }) =>
    request('/ai/draft', draftSchema, json('POST', body)),
  /** A transparent PNG of the image; the server forwards it to the instance's rembg service. */
  removeBackground: async (image: Blob, filename: string) => {
    const form = new FormData();
    form.append('file', image, filename);
    const response = await send('/images/remove-background', { method: 'POST', body: form });
    return new Blob([await response.arrayBuffer()], { type: 'image/png' });
  },
  pick: (body: PickBody) => request('/ai/pick', pickSchema, json('POST', body)),
};
