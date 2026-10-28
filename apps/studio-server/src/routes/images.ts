// SPDX-License-Identifier: AGPL-3.0-only
import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { requireSession } from '../auth/middleware.ts';
import type { Config } from '../config.ts';
import { HttpError } from '../http.ts';
import { removeBackground } from '../rembg.ts';
import { detectImageType, IMAGE_TYPES } from '../uploads.ts';
import { type AuthLimiters, tooMany } from './auth.ts';

/** A cut-out is a PNG of the input's size; allow generous growth, but not unbounded. */
const RESPONSE_FACTOR = 4;

/** `POST /api/images/remove-background`: one image in the "file" field, a transparent PNG back. */
export function imagesRouter(
  config: Config,
  limiters: AuthLimiters,
  fetchImpl: typeof fetch = fetch
): Router {
  const router = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.uploadMaxBytes, files: 1, fields: 0 },
  });

  // Feature switch and rate limit come before multer reads the body.
  router.post('/remove-background', (_req: Request, res: Response, next) => {
    if (!config.features.removeBackground) {
      throw new HttpError(503, {
        error: 'feature_disabled',
        message: 'This feature is not configured on this instance.',
      });
    }
    const account = requireSession(res).account.id;
    const wait = limiters.removeBackground.check(account);
    if (wait !== null) throw tooMany(wait, res);
    limiters.removeBackground.hit(account);
    next();
  });

  router.post('/remove-background', upload.single('file'), async (req, res) => {
    const rembg = config.features.removeBackground;
    const file = req.file;
    if (!rembg || !file) {
      throw new HttpError(400, {
        error: 'invalid_upload',
        message: 'Send one file in the "file" field.',
      });
    }
    const ext = detectImageType(file.buffer);
    // SVG is an image Studio accepts, but rembg works on pixels.
    if (!ext || ext === 'svg') {
      throw new HttpError(415, {
        error: 'unsupported_media_type',
        message: `Supported images: ${Object.keys(IMAGE_TYPES)
          .filter((type) => type !== 'svg')
          .join(', ')}.`,
      });
    }
    const png = await removeBackground(
      rembg,
      file.buffer,
      config.uploadMaxBytes * RESPONSE_FACTOR,
      fetchImpl
    );
    res.type('image/png').send(png);
  });

  return router;
}
