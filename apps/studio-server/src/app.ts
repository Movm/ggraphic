// SPDX-License-Identifier: AGPL-3.0-only
import { existsSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import express, { type Express } from 'express';
import { createDraft } from './ai.ts';
import type { Config } from './config.ts';
import { draftBody, type StudioConfig } from './contract.ts';
import type { Db } from './db/client.ts';
import { errorHandler, HttpError, parseOr400 } from './http.ts';
import { projectsRouter } from './routes/projects.ts';
import { uploadsRouter } from './routes/uploads.ts';
import { IMAGE_TYPES } from './uploads.ts';

export interface AppDeps {
  config: Config;
  db: Db;
  fetch?: typeof fetch;
}

export function createApp({ config, db, fetch: fetchImpl = fetch }: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
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

  api.use('/projects', projectsRouter(db, config));
  api.use('/uploads', uploadsRouter(config));

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
