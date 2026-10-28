// SPDX-License-Identifier: AGPL-3.0-only
import { mkdir, writeFile } from 'node:fs/promises';
import { Router } from 'express';
import multer from 'multer';
import type { Upload } from '../contract.ts';
import { HttpError } from '../http.ts';
import { detectImageType, IMAGE_TYPES, parseStoredName, randomFileName } from '../uploads.ts';

export function uploadsRouter(opts: { uploadDir: string; uploadMaxBytes: number }): Router {
  const router = Router();
  // Memory storage: files are capped, and we must read the bytes before deciding to keep them.
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: opts.uploadMaxBytes, files: 1, fields: 0 },
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
    const body: Upload = {
      url: `/api/uploads/${name}`,
      contentType: IMAGE_TYPES[ext],
      size: file.size,
    };
    res.status(201).json(body);
  });

  router.get('/:file', (req, res, next) => {
    const ext = parseStoredName(req.params.file);
    if (!ext) throw new HttpError(404, { error: 'not_found' });
    res.set({
      'Content-Type': IMAGE_TYPES[ext],
      'Cache-Control': 'public, max-age=31536000, immutable',
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
