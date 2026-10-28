// SPDX-License-Identifier: AGPL-3.0-only
import { and, count, eq, gt, isNull, sql } from 'drizzle-orm';
import { type Request, type Response, Router } from 'express';
import { clientKey } from '../auth/clientKey.ts';
import type { SessionCookie } from '../auth/cookies.ts';
import { requireSession, sessionOf } from '../auth/middleware.ts';
import { hashPassword, verifyAgainstDummy, verifyPassword } from '../auth/passwords.ts';
import { FixedWindowLimiter } from '../auth/rateLimit.ts';
import {
  createSession,
  deleteExpiredSessions,
  deleteSession,
  type LoadedSession,
  loadSession,
} from '../auth/sessions.ts';
import { safeEqual, sha256 } from '../auth/tokens.ts';
import type { Config } from '../config.ts';
import {
  type InvitationInfo,
  loginBody,
  type SessionState,
  setupBody,
  signupBody,
} from '../contract.ts';
import type { Db } from '../db/client.ts';
import { accounts, DEFAULT_ORGANISATION_ID, invitations, organisations } from '../db/schema.ts';
import { HttpError, parseOr400 } from '../http.ts';
import { addMember, createOrganisation, organisationsOf, type Tx } from '../orgs.ts';

const WINDOW_MS = 15 * 60 * 1000;
// Arbitrary constant: serialises concurrent first-run setups.
const SETUP_LOCK_KEY = 7_401_553;

export interface AuthLimiters {
  /** Failed logins per email. */
  email: FixedWindowLimiter;
  /** Every attempt at login, setup, registration and invitation acceptance per client IP. */
  ip: FixedWindowLimiter;
}

export function createAuthLimiters(): AuthLimiters {
  return {
    email: new FixedWindowLimiter({ limit: 10, windowMs: WINDOW_MS }),
    ip: new FixedWindowLimiter({ limit: 30, windowMs: WINDOW_MS }),
  };
}

function tooMany(retryAfter: number, res: Response): HttpError {
  res.set('Retry-After', String(retryAfter));
  return new HttpError(429, {
    error: 'rate_limited',
    message: 'Too many attempts. Try again later.',
  });
}

const invalidInvitation = () =>
  new HttpError(404, {
    error: 'invitation_invalid',
    message: 'This invitation link is invalid, used or expired.',
  });

const alreadySetUp = () =>
  new HttpError(409, { error: 'already_set_up', message: 'This instance is set up.' });

const emailTaken = () =>
  new HttpError(409, {
    error: 'email_taken',
    message: 'An account with this email exists. Log in to continue.',
  });

function isUniqueViolation(err: unknown): boolean {
  const cause = (err as { cause?: { code?: unknown }; code?: unknown }) ?? {};
  return cause.code === '23505' || cause.cause?.code === '23505';
}

export function authRouter(
  db: Db,
  config: Config,
  cookie: SessionCookie,
  limiters: AuthLimiters
): Router {
  const router = Router();
  // Single use: cleared in the transaction that creates the first account.
  let setupToken = config.setupToken;
  const maxAge = (expiresAt: Date) => Math.floor((expiresAt.getTime() - Date.now()) / 1000);

  async function instanceIsEmpty(tx: Tx = db): Promise<boolean> {
    const [row] = await tx.select({ n: count() }).from(accounts);
    return (row?.n ?? 0) === 0;
  }

  const canCreateOrganisations = (session: LoadedSession) =>
    session.account.isInstanceAdmin || config.allowRegistration;

  async function state(session: LoadedSession | null): Promise<SessionState> {
    return {
      setupRequired: session ? false : await instanceIsEmpty(),
      registrationOpen: config.allowRegistration,
      account: session?.account ?? null,
      csrfToken: session?.csrfToken ?? null,
      organisations: session ? await organisationsOf(db, session.account.id) : [],
      canCreateOrganisations: session ? canCreateOrganisations(session) : false,
    };
  }

  /** The new session's state; the cookie is set on `res`, not yet seen by the request. */
  async function stateFor(res: Response, accountId: string): Promise<SessionState> {
    const { token, expiresAt } = await createSession(db, accountId);
    res.append('Set-Cookie', cookie.serialize(token, maxAge(expiresAt)));
    return state(await loadSession(db, token));
  }

  function limitIp(req: Request, res: Response): void {
    const key = clientKey(req.ip);
    const wait = limiters.ip.check(key);
    if (wait !== null) throw tooMany(wait, res);
    limiters.ip.hit(key);
  }

  router.get('/session', async (_req, res) => {
    res.set('Cache-Control', 'no-store').json(await state(sessionOf(res)));
  });

  router.post('/setup', async (req, res) => {
    limitIp(req, res);
    const { setupToken: sent, ...body } = parseOr400(setupBody, req.body);
    // Cheap checks first: nothing is hashed for a request that cannot succeed.
    if (!(await instanceIsEmpty())) throw alreadySetUp();
    if (!setupToken || !safeEqual(sent, setupToken)) {
      throw new HttpError(403, {
        error: 'setup_token_invalid',
        message: 'Enter the setup token from the server log (or SETUP_TOKEN).',
      });
    }
    const passwordHash = await hashPassword(body.password);
    const accountId = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${SETUP_LOCK_KEY})`);
      if (!(await instanceIsEmpty(tx)) || !setupToken) return null;
      const [account] = await tx
        .insert(accounts)
        .values({ ...body, passwordHash, isInstanceAdmin: true })
        .returning({ id: accounts.id });
      // Everything that existed before accounts belongs to the default organisation.
      await addMember(tx, DEFAULT_ORGANISATION_ID, account!.id, 'owner');
      setupToken = null;
      return account!.id;
    });
    if (!accountId) throw alreadySetUp();
    res.status(201).json(await stateFor(res, accountId));
  });

  router.post('/login', async (req, res) => {
    limitIp(req, res);
    const body = parseOr400(loginBody, req.body);
    const wait = limiters.email.check(body.email);
    if (wait !== null) throw tooMany(wait, res);
    const [account] = await db
      .select({ id: accounts.id, passwordHash: accounts.passwordHash })
      .from(accounts)
      .where(eq(sql`lower(${accounts.email})`, body.email));
    const ok = account
      ? await verifyPassword(account.passwordHash, body.password)
      : (await verifyAgainstDummy(body.password), false);
    if (!account || !ok) {
      limiters.email.hit(body.email);
      throw new HttpError(401, {
        error: 'invalid_credentials',
        message: 'Email or password is wrong.',
      });
    }
    limiters.email.reset(body.email);
    await deleteExpiredSessions(db);
    res.json(await stateFor(res, account.id));
  });

  router.post('/logout', async (_req, res) => {
    const session = requireSession(res);
    await deleteSession(db, session.tokenHash);
    res.append('Set-Cookie', cookie.clear()).status(204).end();
  });

  router.post('/register', async (req, res) => {
    limitIp(req, res);
    if (!config.allowRegistration) {
      throw new HttpError(403, {
        error: 'registration_closed',
        message: 'Registration is closed on this instance. Ask for an invitation.',
      });
    }
    const body = parseOr400(signupBody, req.body);
    const passwordHash = await hashPassword(body.password);
    let accountId: string;
    try {
      accountId = await db.transaction(async (tx) => {
        const [account] = await tx
          .insert(accounts)
          .values({ ...body, passwordHash })
          .returning({ id: accounts.id });
        await createOrganisation(tx, body.displayName, account!.id);
        return account!.id;
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw emailTaken();
      throw err;
    }
    res.status(201).json(await stateFor(res, accountId));
  });

  const openInvitation = (tokenHash: string) =>
    and(
      eq(invitations.tokenHash, tokenHash),
      isNull(invitations.acceptedAt),
      gt(invitations.expiresAt, sql`now()`)
    );

  router.get('/invitations/:token', async (req, res) => {
    const [row] = await db
      .select({
        organisationName: organisations.name,
        role: invitations.role,
        allowsSignup: invitations.allowsSignup,
      })
      .from(invitations)
      .innerJoin(organisations, eq(organisations.id, invitations.organisationId))
      .where(openInvitation(sha256(req.params.token)));
    if (!row) throw invalidInvitation();
    const body: InvitationInfo = {
      ...row,
      allowsSignup: row.allowsSignup || config.allowRegistration,
    };
    res.set('Cache-Control', 'no-store').json(body);
  });

  router.post('/invitations/:token/accept', async (req, res) => {
    limitIp(req, res);
    const tokenHash = sha256(req.params.token);
    const session = sessionOf(res);
    const signup = session ? null : parseOr400(signupBody, req.body);
    const passwordHash = signup ? await hashPassword(signup.password) : null;
    let accountId: string;
    try {
      accountId = await db.transaction(async (tx) => {
        // Consumes the invitation; a second accept of the same link finds nothing.
        const [invitation] = await tx
          .update(invitations)
          .set({ acceptedAt: sql`now()` })
          .where(openInvitation(tokenHash))
          .returning({
            id: invitations.id,
            organisationId: invitations.organisationId,
            role: invitations.role,
            allowsSignup: invitations.allowsSignup,
          });
        if (!invitation) throw invalidInvitation();
        let id: string;
        if (session) {
          id = session.account.id;
        } else {
          if (!invitation.allowsSignup && !config.allowRegistration) {
            throw new HttpError(403, {
              error: 'signup_not_allowed',
              message: 'This invitation is for an existing account. Log in first.',
            });
          }
          const [account] = await tx
            .insert(accounts)
            .values({ ...signup!, passwordHash: passwordHash! })
            .returning({ id: accounts.id });
          id = account!.id;
        }
        await tx
          .update(invitations)
          .set({ acceptedBy: id })
          .where(eq(invitations.id, invitation.id));
        await addMember(tx, invitation.organisationId, id, invitation.role);
        return id;
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw emailTaken();
      throw err;
    }
    if (session) {
      res.json(await state(session));
    } else {
      res.status(201).json(await stateFor(res, accountId));
    }
  });

  return router;
}
