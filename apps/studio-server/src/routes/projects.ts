// SPDX-License-Identifier: AGPL-3.0-only
import { and, desc, eq, inArray, isNotNull, lte, sql } from 'drizzle-orm';
import express, { type Response, Router } from 'express';
import { requireMembership, requireSession } from '../auth/middleware.ts';
import {
  createProjectBody,
  type Project,
  projectIdSchema,
  type ProjectSummary,
  type TrashItem,
  updateProjectBody,
} from '../contract.ts';
import type { Db } from '../db/client.ts';
import { memberships, type ProjectRow, projects, projectThumbnails } from '../db/schema.ts';
import { HttpError, parseOr400 } from '../http.ts';
import { live, TRASH_RETENTION_DAYS } from '../trash.ts';
import { isPng } from '../uploads.ts';

type SummaryRow = Omit<ProjectRow, 'document' | 'ownerId' | 'deletedAt'> & {
  thumbnailUpdatedAt: Date | null;
};

const summaryColumns = {
  id: projects.id,
  organisationId: projects.organisationId,
  name: projects.name,
  schemaVersion: projects.schemaVersion,
  version: projects.version,
  createdAt: projects.createdAt,
  updatedAt: projects.updatedAt,
  thumbnailUpdatedAt: projectThumbnails.updatedAt,
};

function toSummary(row: SummaryRow): ProjectSummary {
  return {
    id: row.id,
    organisationId: row.organisationId,
    name: row.name,
    schemaVersion: row.schemaVersion,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    thumbnailUrl: row.thumbnailUpdatedAt
      ? `/api/projects/${row.id}/thumbnail?v=${row.thumbnailUpdatedAt.getTime()}`
      : null,
  };
}

const notFound = () => new HttpError(404, { error: 'not_found' });

function idParam(raw: string | undefined): string {
  const result = projectIdSchema.safeParse(raw);
  if (!result.success) throw notFound();
  return result.data;
}

/** Organisation ids the account is a member of, as a subquery. */
function memberOrganisations(db: Db, accountId: string) {
  return db
    .select({ id: memberships.organisationId })
    .from(memberships)
    .where(eq(memberships.accountId, accountId));
}

/** `/api/orgs/:orgId/projects`: list and create within one organisation. */
export function organisationProjectsRouter(db: Db): Router {
  const router = Router({ mergeParams: true });

  router.get('/', async (req, res) => {
    const orgId = orgParam(req.params);
    await requireMembership(db, requireSession(res).account.id, orgId);
    const rows = await db
      .select(summaryColumns)
      .from(projects)
      .leftJoin(projectThumbnails, eq(projectThumbnails.projectId, projects.id))
      .where(and(eq(projects.organisationId, orgId), live()))
      .orderBy(desc(projects.updatedAt));
    res.json({ projects: rows.map(toSummary) });
  });

  router.post('/', async (req, res) => {
    const orgId = orgParam(req.params);
    await requireMembership(db, requireSession(res).account.id, orgId);
    const body = parseOr400(createProjectBody, req.body ?? {});
    const [row] = await db
      .insert(projects)
      .values({ ...body, organisationId: orgId })
      .returning({ id: projects.id });
    const [created] = await db
      .select({ ...summaryColumns, document: projects.document })
      .from(projects)
      .leftJoin(projectThumbnails, eq(projectThumbnails.projectId, projects.id))
      .where(and(eq(projects.id, row!.id), live()));
    res.status(201).json({ ...toSummary(created!), document: created!.document });
  });

  return router;
}

/** `/api/orgs/:orgId/trash`: what was deleted from the organisation and can still be restored. */
export function organisationTrashRouter(db: Db): Router {
  const router = Router({ mergeParams: true });

  router.get('/', async (req, res) => {
    const orgId = orgParam(req.params);
    await requireMembership(db, requireSession(res).account.id, orgId);
    const rows = await db
      .select({
        id: projects.id,
        organisationId: projects.organisationId,
        name: projects.name,
        deletedAt: projects.deletedAt,
        // From the database clock that stamped deleted_at, not from this process's.
        purgeAt: sql<Date>`${projects.deletedAt} + make_interval(days => ${TRASH_RETENTION_DAYS})`,
        daysLeft: sql<number>`greatest(0, ceil(extract(epoch from (${projects.deletedAt} + make_interval(days => ${TRASH_RETENTION_DAYS}) - now())) / 86400))::int`,
      })
      .from(projects)
      .where(and(eq(projects.organisationId, orgId), isNotNull(projects.deletedAt)))
      .orderBy(desc(projects.deletedAt));
    const items: TrashItem[] = rows.map((row) => ({
      id: row.id,
      organisationId: row.organisationId,
      name: row.name,
      deletedAt: row.deletedAt!.toISOString(),
      purgeAt: new Date(row.purgeAt).toISOString(),
      daysLeft: row.daysLeft,
    }));
    res.json({ projects: items });
  });

  return router;
}

export function orgParam(params: Record<string, unknown>): string {
  const raw = params['orgId'];
  return idParam(typeof raw === 'string' ? raw : undefined);
}

/** The format version a document names itself, 1 when it names none (or an invalid one). */
function documentVersion(document: unknown): number {
  const v =
    typeof document === 'object' && document !== null
      ? (document as Record<string, unknown>)['schemaVersion']
      : undefined;
  return typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : 1;
}

/** `/api/projects/:id`: every call is limited to projects of the caller's organisations. */
export function projectsRouter(db: Db, opts: { thumbnailMaxBytes: number }): Router {
  const router = Router();

  // Membership only. Every statement adds `live()` (or, for the trash, `isNotNull`).
  const owned = (res: Response, id: string) =>
    and(
      eq(projects.id, id),
      inArray(projects.organisationId, memberOrganisations(db, requireSession(res).account.id))
    );

  async function loadProject(res: Response, id: string): Promise<Project> {
    const [row] = await db
      .select({ ...summaryColumns, document: projects.document })
      .from(projects)
      .leftJoin(projectThumbnails, eq(projectThumbnails.projectId, projects.id))
      .where(and(owned(res, id), live()));
    if (!row) throw notFound();
    return { ...toSummary(row), document: row.document };
  }

  async function loadSummary(res: Response, id: string): Promise<ProjectSummary> {
    const [row] = await db
      .select(summaryColumns)
      .from(projects)
      .leftJoin(projectThumbnails, eq(projectThumbnails.projectId, projects.id))
      .where(and(owned(res, id), live()));
    if (!row) throw notFound();
    return toSummary(row);
  }

  router.get('/:id', async (req, res) => {
    const id = idParam(req.params.id);
    try {
      res.json(await loadProject(res, id));
    } catch (err) {
      if (!(err instanceof HttpError) || err.status !== 404) throw err;
      // trashedProbe: `owned` limits this to the caller's organisations, so a project of another
      // organisation stays a plain not_found. The client says "in the Trash" instead of "missing".
      const [inTrash] = await db
        .select({ trashedProbe: projects.id })
        .from(projects)
        .where(and(owned(res, id), isNotNull(projects.deletedAt)));
      if (inTrash) throw new HttpError(404, { error: 'trashed' });
      throw err;
    }
  });

  router.patch('/:id', async (req, res) => {
    const id = idParam(req.params.id);
    const { version, ...parsed } = parseOr400(updateProjectBody, req.body);
    // An old client must not downgrade a newer document: the stored format version only rises.
    // A document write is judged by the version it carries, also when the body names none.
    const incoming =
      parsed.document === undefined
        ? parsed.schemaVersion
        : (parsed.schemaVersion ?? documentVersion(parsed.document));
    const changes = incoming === undefined ? parsed : { ...parsed, schemaVersion: incoming };
    const notLower = incoming === undefined ? undefined : lte(projects.schemaVersion, incoming);
    const updated = await db
      .update(projects)
      .set({ ...changes, version: sql`${projects.version} + 1`, updatedAt: sql`now()` })
      .where(and(owned(res, id), live(), eq(projects.version, version), notLower))
      .returning({ id: projects.id });
    if (updated.length === 0) {
      const [current] = await db
        .select({ version: projects.version, schemaVersion: projects.schemaVersion })
        .from(projects)
        .where(and(owned(res, id), live()));
      if (!current) throw notFound();
      if (changes.schemaVersion !== undefined && current.schemaVersion > changes.schemaVersion) {
        throw new HttpError(409, {
          error: 'schema-version',
          message:
            'The project was saved with a newer version and cannot be overwritten by this one.',
        });
      }
      throw new HttpError(409, {
        error: 'version_conflict',
        message: 'The project was changed in the meantime. Reload it and apply your change again.',
        currentVersion: current.version,
      });
    }
    res.json(await loadProject(res, id));
  });

  router.delete('/:id', async (req, res) => {
    // Soft delete: the row stays for TRASH_RETENTION_DAYS (restore, or src/trashPurge.ts).
    const trashed = await db
      .update(projects)
      .set({ deletedAt: sql`now()` })
      .where(and(owned(res, idParam(req.params.id)), live()))
      .returning({ id: projects.id });
    if (trashed.length === 0) throw notFound();
    res.status(204).end();
  });

  router.post('/:id/restore', async (req, res) => {
    const id = idParam(req.params.id);
    // Only deleted_at changes: the project returns to its old place with its old version.
    // Idempotent: a project that is already live is answered with its summary; one that does
    // not exist, or is not the caller's, is a 404 from loadSummary.
    await db
      .update(projects)
      .set({ deletedAt: null })
      .where(and(owned(res, id), isNotNull(projects.deletedAt)));
    res.json(await loadSummary(res, id));
  });

  /** "Delete now": removes a project that is already in the trash, with its thumbnail. */
  router.delete('/:id/purge', async (req, res) => {
    const purged = await db
      .delete(projects)
      .where(and(owned(res, idParam(req.params.id)), isNotNull(projects.deletedAt)))
      .returning({ id: projects.id });
    if (purged.length === 0) throw notFound();
    res.status(204).end();
  });

  router.put(
    '/:id/thumbnail',
    express.raw({ type: 'image/png', limit: opts.thumbnailMaxBytes }),
    async (req, res) => {
      const id = idParam(req.params.id);
      const png: unknown = req.body;
      if (!Buffer.isBuffer(png) || !isPng(png)) {
        throw new HttpError(415, {
          error: 'unsupported_media_type',
          message: 'Send the thumbnail as a PNG with Content-Type: image/png.',
        });
      }
      const [exists] = await db
        .select({ id: projects.id })
        .from(projects)
        .where(and(owned(res, id), live()));
      if (!exists) throw notFound();
      await db
        .insert(projectThumbnails)
        .values({ projectId: id, png })
        .onConflictDoUpdate({
          target: projectThumbnails.projectId,
          set: { png, updatedAt: sql`now()` },
        });
      res.json(await loadSummary(res, id));
    }
  );

  router.get('/:id/thumbnail', async (req, res) => {
    const [row] = await db
      .select({ png: projectThumbnails.png })
      .from(projectThumbnails)
      .innerJoin(projects, eq(projects.id, projectThumbnails.projectId))
      .where(and(owned(res, idParam(req.params.id)), live()));
    if (!row) throw notFound();
    // The URL carries ?v=<updated time>, so a changed thumbnail gets a new URL.
    res
      .type('image/png')
      .set('Cache-Control', 'private, max-age=31536000, immutable')
      .send(row.png);
  });

  return router;
}
