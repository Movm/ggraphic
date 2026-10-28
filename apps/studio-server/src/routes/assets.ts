// SPDX-License-Identifier: AGPL-3.0-only
import { Router, type Response } from 'express';
import { z } from 'zod';
import { requireSession } from '../auth/middleware.ts';
import type { Config } from '../config.ts';
import { HttpError, parseOr400 } from '../http.ts';
import { createIconifyClient, isIconToken } from '../iconify.ts';
import { type AuthLimiters, tooMany } from './auth.ts';

const token = z
  .string()
  .regex(/^[a-z0-9-]+$/, 'letters, digits and hyphens only')
  .max(64);

const searchQuery = z.object({
  q: z.string().trim().min(1).max(64),
  limit: z.coerce.number().int().min(1).max(64).default(32),
  prefix: token.optional(),
});

const iconParams = z.object({ prefix: token, name: token });

/** `GET /api/assets/icons/search` and `GET /api/assets/icons/:prefix/:name.svg`, through Iconify. */
export function assetsRouter(
  config: Config,
  limiters: AuthLimiters,
  fetchImpl: typeof fetch = fetch
): Router {
  const router = Router();
  const iconify = config.features.iconify;
  const client = iconify ? createIconifyClient(iconify, fetchImpl) : null;

  const enabled = () => {
    if (!client) {
      throw new HttpError(503, {
        error: 'feature_disabled',
        message: 'This feature is not configured on this instance.',
      });
    }
    return client;
  };
  const limited = (limiter: AuthLimiters['iconifySearch'], res: Response) => {
    const account = requireSession(res).account.id;
    const wait = limiter.check(account);
    if (wait !== null) throw tooMany(wait, res);
    limiter.hit(account);
  };

  router.get('/icons/search', async (req, res) => {
    const icons = enabled();
    const { q, limit, prefix } = parseOr400(searchQuery, req.query);
    limited(limiters.iconifySearch, res);
    res
      .set('Cache-Control', 'private, max-age=60')
      .json(await icons.search(q, limit, prefix ?? null));
  });

  router.get('/icons/:prefix/:name.svg', async (req, res) => {
    const icons = enabled();
    const { prefix, name } = parseOr400(iconParams, req.params);
    if (!isIconToken(prefix) || !isIconToken(name)) {
      throw new HttpError(400, { error: 'invalid_request' });
    }
    limited(limiters.iconifySvg, res);
    const svg = await icons.svg(prefix, name);
    // An <img> source; nothing in it may run even when opened on its own.
    res
      .set('Cache-Control', 'private, max-age=3600')
      .set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox")
      .type('image/svg+xml')
      .send(svg);
  });

  return router;
}
