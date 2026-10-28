// SPDX-License-Identifier: AGPL-3.0-only
import { mkdir, writeFile } from 'node:fs/promises';
import { and, eq, inArray } from 'drizzle-orm';
import { Router } from 'express';
import multer from 'multer';
import { requireMembership, requireSession } from '../auth/middleware.ts';
import type { Upload } from '../contract.ts';
import type { Db } from '../db/client.ts';
import { memberships, uploads } from '../db/schema.ts';
import { HttpError } from '../http.ts';
import { orgParam } from './projects.ts';
import { detectImageType, IMAGE_TYPES, parseStoredName, randomFileName } from '../uploads.ts';

interface UploadOptions {
  uploadDir: string;
  uploadMaxBytes: number;
}

/** `POST /api/orgs/:orgId/uploads`: an image for one organisation's projects. */
export function organisationUploadsRouter(db: Db, opts: UploadOptions): Router {
  const router = Router({ mergeParams: true });
  // Memory storage: files are capped, and we must read the bytes before deciding to keep them.
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: opts.uploadMaxBytes, files: 1, fields: 0 },
  });

  // Membership is checked before multer reads the body.
  router.post('/', async (req, res, next) => {
    await requireMembership(db, requireSession(res).account.id, orgParam(req.params));
    next();
  });

  router.post('/', upload.single('file'), async (req, res) => {
    const file = req.file;
    if (!file) {
      throw new HttpError(400, {
        error: 'invalid_upload',
        message: 'Send one file in the "file" field.',
      });
    }
    const ext = detectImageType(file.buffer);
    if (!ext) {
      throw new HttpError(415, {
        error: 'unsupported_media_type',
        message: `Supported images: ${Object.keys(IMAGE_TYPES).join(', ')}.`,
      });
    }
    const name = randomFileName(ext);
    await mkdir(opts.uploadDir, { recursive: true });
    await writeFile(`${opts.uploadDir}/${name}`, file.buffer, { flag: 'wx' });
    await db.insert(uploads).values({
      fileName: name,
      organisationId: orgParam(req.params),
      contentType: IMAGE_TYPES[ext],
      size: file.size,
    });
    const body: Upload = {
      url: `/api/uploads/${name}`,
      contentType: IMAGE_TYPES[ext],
      size: file.size,
    };
    res.status(201).json(body);
  });

  return router;
}

/** `GET /api/uploads/:file`: only for members of the organisation the file belongs to. */
export function uploadsRouter(db: Db, opts: UploadOptions): Router {
  const router = Router();

  router.get('/:file', async (req, res, next) => {
    const ext = parseStoredName(req.params.file);
    if (!ext) throw new HttpError(404, { error: 'not_found' });
    const accountId = requireSession(res).account.id;
    const [row] = await db
      .select({ fileName: uploads.fileName })
      .from(uploads)
      .where(
        and(
          eq(uploads.fileName, req.params.file),
          inArray(
            uploads.organisationId,
            db
              .select({ id: memberships.organisationId })
              .from(memberships)
              .where(eq(memberships.accountId, accountId))
          )
        )
      );
    if (!row) throw new HttpError(404, { error: 'not_found' });
    res.set({
      'Content-Type': IMAGE_TYPES[ext],
      // private: a shared cache must not hand one organisation's file to another.
      'Cache-Control': 'private, max-age=31536000, immutable',
      'Cross-Origin-Resource-Policy': 'same-origin',
      // Uploads are inert data. For SVG this also blocks scripts when opened directly.
      'Content-Security-Policy':
        "sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'",
    });
    // <img> ignores Content-Disposition, so SVGs still render on the canvas but never as a page.
    if (ext === 'svg') res.attachment(req.params.file);
    res.sendFile(req.params.file, { root: opts.uploadDir, dotfiles: 'deny' }, (err) => {
      if (!err) return;
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        // Headers above were set for an image; reset for the JSON error.
        res.removeHeader('Content-Disposition');
        res.status(404).type('application/json').json({ error: 'not_found' });
        return;
      }
      next(err);
    });
  });

  return router;
}
