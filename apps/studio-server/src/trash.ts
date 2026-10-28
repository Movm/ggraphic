// SPDX-License-Identifier: AGPL-3.0-only
import { isNull } from 'drizzle-orm';
import { projects } from './db/schema.ts';

/** How long a deleted project stays in the trash before it is purged. */
export const TRASH_RETENTION_DAYS = 30;
export const TRASH_RETENTION_MS = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;

/**
 * The condition every reader of `projects` carries: the project is not in the trash.
 * test/trashReaders.test.ts fails a statement that reads `projects` without it.
 */
export const live = () => isNull(projects.deletedAt);
