// SPDX-License-Identifier: AGPL-3.0-only
import type { ErrorRequestHandler } from 'express';
import multer from 'multer';
import type { z } from 'zod';
import type { ApiError } from './contract.ts';

export class HttpError extends Error {
  readonly status: number;
  readonly body: ApiError;

  constructor(status: number, body: ApiError) {
    super(body.message ?? body.error);
    this.status = status;
    this.body = body;
  }
}

export function parseOr400<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const message = result.error.issues
      .map((i) => `${i.path.join('.') || 'body'}: ${i.message}`)
      .join('; ');
    throw new HttpError(400, { error: 'invalid_request', message });
  }
  return result.data;
}

/**
 * What the log gets from an unexpected error: name and message, or for a database error
 * the driver's code and message. Never the error object itself: drizzle's query errors
 * carry the query parameters (session hashes, CSRF tokens, emails, password hashes) in
 * their message and fields.
 */
export function describeError(err: unknown): string {
  const codeOf = (e: unknown) => {
    const code = (e as { code?: unknown } | null)?.code;
    return typeof code === 'string' ? code : null;
  };
  const cause = (err as { cause?: unknown } | null)?.cause;
  const db =
    cause instanceof Error && codeOf(cause)
      ? cause
      : err instanceof Error && codeOf(err)
        ? err
        : null;
  if (db) return `database error ${codeOf(db)}: ${db.message}`;
  if (!(err instanceof Error)) return typeof err;
  // A query error without a driver code still carries its parameters in the message.
  if (err.message.includes('params:')) return `${err.name} (message withheld)`;
  return `${err.name}: ${err.message}`;
}

interface BodyParserError {
  type?: unknown;
}

// Express recognises an error handler by its four parameters, so `_next` must stay.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json(err.body);
    return;
  }
  if (err instanceof multer.MulterError) {
    const tooLarge = err.code === 'LIMIT_FILE_SIZE';
    res
      .status(tooLarge ? 413 : 400)
      .json({ error: tooLarge ? 'too_large' : 'invalid_upload', message: err.message });
    return;
  }
  const bp = (err ?? {}) as BodyParserError;
  if (bp.type === 'entity.too.large') {
    res.status(413).json({ error: 'too_large' });
    return;
  }
  if (bp.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'invalid_json' });
    return;
  }
  console.error('Unhandled error', describeError(err));
  res.status(500).json({ error: 'internal' });
};
