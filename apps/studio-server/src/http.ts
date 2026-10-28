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
  console.error('Unhandled error', err);
  res.status(500).json({ error: 'internal' });
};
