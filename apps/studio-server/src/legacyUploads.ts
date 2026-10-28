// SPDX-License-Identifier: AGPL-3.0-only
import { readdir, stat } from 'node:fs/promises';
import type { Db } from './db/client.ts';
import { DEFAULT_ORGANISATION_ID, uploads } from './db/schema.ts';
import { IMAGE_TYPES, parseStoredName } from './uploads.ts';

/**
 * Registers upload files from before accounts (no row in `uploads`) to the default
 * organisation, so existing designs keep their images. Idempotent; runs at every start.
 * Only names the server itself generates are considered.
 */
export async function adoptLegacyUploads(db: Db, uploadDir: string): Promise<number> {
  let names: string[];
  try {
    names = await readdir(uploadDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return 0;
    throw err;
  }
  const rows = [];
  for (const name of names) {
    const ext = parseStoredName(name);
    if (!ext) continue;
    const info = await stat(`${uploadDir}/${name}`);
    if (!info.isFile()) continue;
    rows.push({
      fileName: name,
      organisationId: DEFAULT_ORGANISATION_ID,
      contentType: IMAGE_TYPES[ext],
      size: info.size,
    });
  }
  if (rows.length === 0) return 0;
  const inserted = await db
    .insert(uploads)
    .values(rows)
    .onConflictDoNothing()
    .returning({ fileName: uploads.fileName });
  return inserted.length;
}
