// SPDX-License-Identifier: AGPL-3.0-only
import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../src/http.ts';

function fakeRes() {
  const res = { statusCode: 0, body: null as unknown };
  return Object.assign(res, {
    status(code: number) {
      res.statusCode = code;
      return this;
    },
    json(body: unknown) {
      res.body = body;
      return this;
    },
  }) as unknown as Response & { statusCode: number; body: unknown };
}

describe('errorHandler', () => {
  it('logs a database error by code and driver message, never its query parameters', () => {
    // The shape of drizzle's DrizzleQueryError: query and params in the message, pg error as cause.
    const pgError = Object.assign(
      new Error('duplicate key value violates unique constraint "accounts_email_idx"'),
      { code: '23505', detail: 'Key (lower(email))=(someone@example.org) already exists.' }
    );
    const err = Object.assign(
      new Error(
        'Failed query: insert into "sessions" values ($1, $2, $3)\nparams: hash,acc,csrf-secret-value'
      ),
      {
        name: 'DrizzleQueryError',
        query: 'insert …',
        params: ['hash', 'csrf-secret-value'],
        cause: pgError,
      }
    );
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = fakeRes();
      errorHandler(err, {} as Request, res, () => {});
      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({ error: 'internal' });
      const printed = JSON.stringify(log.mock.calls.map((c) => c.map(String)));
      expect(printed).toContain('23505');
      expect(printed).not.toContain('csrf-secret-value');
      expect(printed).not.toContain('someone@example.org');
      expect(printed).not.toContain('params');
    } finally {
      log.mockRestore();
    }
  });

  it('logs other errors by name and message only', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      errorHandler(new TypeError('boom'), {} as Request, fakeRes(), () => {});
      expect(log.mock.calls[0]!.map(String).join(' ')).toContain('TypeError: boom');
      expect(log.mock.calls[0]!.some((a) => a instanceof Error)).toBe(false);
    } finally {
      log.mockRestore();
    }
  });
});
