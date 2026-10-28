// SPDX-License-Identifier: AGPL-3.0-only
import { existsSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import express, { type Express } from 'express';
import { createDraft } from './ai.ts';
import { sessionCookie } from './auth/cookies.ts';
import {
  csrfGuard,
  fetchMetadataGuard,
  requireAuth,
  sessionMiddleware,
} from './auth/middleware.ts';
import type { Config } from './config.ts';
import { draftBody, type StudioConfig } from './contract.ts';
import type { Db } from './db/client.ts';
import { errorHandler, HttpError, parseOr400 } from './http.ts';
import { type AuthLimiters, authRouter, createAuthLimiters } from './routes/auth.ts';
import { brandAssetsRouter, organisationBrandRouter } from './routes/brand.ts';
import { organisationsRouter } from './routes/organisations.ts';
import { organisationProjectsRouter, projectsRouter } from './routes/projects.ts';
import { organisationUploadsRouter, uploadsRouter } from './routes/uploads.ts';
import { IMAGE_TYPES } from './uploads.ts';

export interface AppDeps {
  config: Config;
  db: Db;
  fetch?: typeof fetch;
  /** Login rate limits; tests pass their own to start from zero. */
  limiters?: AuthLimiters;
}

export function createApp({
  config,
  db,
  fetch: fetchImpl = fetch,
  limiters = createAuthLimiters(),
}: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  // Behind a reverse proxy the client IP (rate limits) comes from X-Forwarded-For.
  app.set('trust proxy', config.trustProxy);
  let warnedForwarded = false;
  if (config.trustProxy === false) {
    app.use((req, _res, next) => {
      if (!warnedForwarded && req.headers['x-forwarded-for'] !== undefined) {
        warnedForwarded = true;
        console.warn(
          'Requests carry X-Forwarded-For, but TRUST_PROXY is off: rate limits see the proxy, not the clients. Set TRUST_PROXY to the hop count or proxy addresses (docs/self-hosting.md).'
        );
      }
      next();
    });
  }
  const cookie = sessionCookie(config.cookieSecure);
  app.use((_req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    // Invitation links carry their token in the path; never send it to other sites.
    res.set('Referrer-Policy', 'same-origin');
    next();
  });

  app.get('/healthz', async (_req, res) => {
    try {
      await db.execute(sql`SELECT 1`);
      res.json({ status: 'ok' });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });

  const api = express.Router();
  api.use(express.json({ limit: config.documentMaxBytes }));
  api.use(fetchMetadataGuard);
  api.use(sessionMiddleware(db, cookie));
  api.use(csrfGuard);
  // Nothing from the API belongs in a shared cache; routes that may be cached say so.
  api.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  api.get('/config', (_req, res) => {
    const body: StudioConfig = {
      features: { ai: config.ai !== null },
      limits: {
        uploadBytes: config.uploadMaxBytes,
        thumbnailBytes: config.thumbnailMaxBytes,
        documentBytes: config.documentMaxBytes,
      },
      uploadTypes: Object.values(IMAGE_TYPES),
    };
    res.json(body);
  });

  api.use('/auth', authRouter(db, config, cookie, limiters));

  // Everything below needs a session.
  api.use(requireAuth);
  api.use('/orgs/:orgId/projects', organisationProjectsRouter(db));
  api.use('/orgs/:orgId/uploads', organisationUploadsRouter(db, config));
  api.use('/orgs/:orgId/brand-pack', organisationBrandRouter(db, config));
  api.use('/orgs', organisationsRouter(db, config));
  api.use('/brand-assets', brandAssetsRouter(db, config));
  api.use('/projects', projectsRouter(db, config));
  api.use('/uploads', uploadsRouter(db, config));

  api.post('/ai/draft', async (req, res) => {
    if (!config.ai) {
      throw new HttpError(503, {
        error: 'ai_disabled',
        message: 'AI is not configured on this instance.',
      });
    }
    const input = parseOr400(draftBody, req.body);
    res.json(await createDraft(config.ai, input, fetchImpl));
  });

  api.use(() => {
    throw new HttpError(404, { error: 'not_found' });
  });
  app.use('/api', api);

  if (existsSync(`${config.staticDir}/index.html`)) {
    app.use(express.static(config.staticDir, { index: false }));
    // SPA fallback: every other GET is a client-side route.
    app.get('/{*path}', (_req, res) => {
      res.set('Cache-Control', 'no-cache').sendFile('index.html', { root: config.staticDir });
    });
  } else {
    console.warn(`No web app found in ${config.staticDir}; serving the API only.`);
  }

  app.use(errorHandler);
  return app;
}
