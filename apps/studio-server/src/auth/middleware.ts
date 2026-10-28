// SPDX-License-Identifier: AGPL-3.0-only
import { and, eq } from 'drizzle-orm';
import type { RequestHandler, Response } from 'express';
import type { Db } from '../db/client.ts';
import { memberships, type Role } from '../db/schema.ts';
import { HttpError } from '../http.ts';
import { parseCookies, type SessionCookie } from './cookies.ts';
import { type LoadedSession, loadSession } from './sessions.ts';
import { safeEqual } from './tokens.ts';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const CSRF_HEADER = 'x-csrf-token';

/** The session of this request, or null when anonymous. Set by `sessionMiddleware`. */
export function sessionOf(res: Response): LoadedSession | null {
  return (res.locals['session'] as LoadedSession | undefined) ?? null;
}

/** The session, or 401. */
export function requireSession(res: Response): LoadedSession {
  const session = sessionOf(res);
  if (!session) throw new HttpError(401, { error: 'unauthenticated' });
  return session;
}

/**
 * Refuses state-changing requests a browser marks as coming from another site.
 * Every current browser sends Sec-Fetch-Site; non-browser clients do not, and carry no
 * ambient cookies of a victim either.
 */
export const fetchMetadataGuard: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  const site = req.get('sec-fetch-site');
  if (site === 'cross-site' || site === 'same-site') {
    throw new HttpError(403, { error: 'csrf', message: 'Cross-site requests are not allowed.' });
  }
  next();
};

/** Loads the session from the cookie and renews the cookie when the session slid forward. */
export function sessionMiddleware(db: Db, cookie: SessionCookie): RequestHandler {
  return async (req, res, next) => {
    const token = parseCookies(req.headers.cookie)[cookie.name];
    if (token) {
      const session = await loadSession(db, token);
      if (session) {
        res.locals['session'] = session;
        if (session.renewed) {
          res.append(
            'Set-Cookie',
            cookie.serialize(token, Math.floor((session.expiresAt.getTime() - Date.now()) / 1000))
          );
        }
      }
    }
    next();
  };
}

/** Every state-changing request in a session must carry that session's CSRF token. */
export const csrfGuard: RequestHandler = (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  const session = sessionOf(res);
  if (!session) return next();
  const sent = req.get(CSRF_HEADER) ?? '';
  if (!safeEqual(sent, session.csrfToken)) {
    throw new HttpError(403, { error: 'csrf', message: 'Missing or invalid CSRF token.' });
  }
  next();
};

export const requireAuth: RequestHandler = (_req, res, next) => {
  requireSession(res);
  next();
};

const notFound = () => new HttpError(404, { error: 'not_found' });

/**
 * The account's role in the organisation. Not a member → 404, so ids of other
 * organisations cannot be probed; a member below `need` → 403.
 */
export async function requireMembership(
  db: Db,
  accountId: string,
  organisationId: string,
  need: Role = 'editor'
): Promise<Role> {
  const [row] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(
      and(eq(memberships.accountId, accountId), eq(memberships.organisationId, organisationId))
    );
  if (!row) throw notFound();
  if (need === 'owner' && row.role !== 'owner') {
    throw new HttpError(403, { error: 'forbidden', message: 'Only owners can do this.' });
  }
  return row.role;
}
