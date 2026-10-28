// SPDX-License-Identifier: AGPL-3.0-only
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const optionalString = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .default(null);

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  // Both paths resolve relative to apps/studio-server, from src/ (dev, tests) and dist/ (build) alike.
  DATA_DIR: z.string().default(fileURLToPath(new URL('../data', import.meta.url))),
  STATIC_DIR: z.string().default(fileURLToPath(new URL('../../studio/dist', import.meta.url))),
  UPLOAD_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(10 * 1024 * 1024),
  THUMBNAIL_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(2 * 1024 * 1024),
  DOCUMENT_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(5 * 1024 * 1024),
  OPENAI_BASE_URL: optionalString,
  OPENAI_API_KEY: optionalString,
  OPENAI_MODEL: optionalString,
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
});

export interface AiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}

export interface Config {
  databaseUrl: string;
  host: string;
  port: number;
  uploadDir: string;
  staticDir: string;
  uploadMaxBytes: number;
  thumbnailMaxBytes: number;
  documentMaxBytes: number;
  /** null when AI is not configured; the feature is then switched off. */
  ai: AiConfig | null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // Empty values count as unset, so `FOO=` in .env or compose falls back to the default.
  const set = Object.fromEntries(
    Object.entries(env).filter(([, v]) => v !== undefined && v !== '')
  );
  const parsed = envSchema.safeParse(set);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid configuration: ${fields}`);
  }
  const e = parsed.data;
  const ai =
    e.OPENAI_BASE_URL && e.OPENAI_API_KEY && e.OPENAI_MODEL
      ? {
          baseUrl: e.OPENAI_BASE_URL.replace(/\/+$/, ''),
          apiKey: e.OPENAI_API_KEY,
          model: e.OPENAI_MODEL,
          timeoutMs: e.AI_TIMEOUT_MS,
        }
      : null;
  return {
    databaseUrl: e.DATABASE_URL,
    host: e.HOST,
    port: e.PORT,
    uploadDir: `${e.DATA_DIR.replace(/\/+$/, '')}/uploads`,
    staticDir: e.STATIC_DIR,
    uploadMaxBytes: e.UPLOAD_MAX_BYTES,
    thumbnailMaxBytes: e.THUMBNAIL_MAX_BYTES,
    documentMaxBytes: e.DOCUMENT_MAX_BYTES,
    ai,
  };
}
