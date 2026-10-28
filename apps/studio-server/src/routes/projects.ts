// SPDX-License-Identifier: AGPL-3.0-only
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import express, { type Response, Router } from 'express';
import { requireMembership, requireSession } from '../auth/middleware.ts';
import {
  createProjectBody,
  type Project,
  projectIdSchema,
  type ProjectSummary,
  updateProjectBody,
} from '../contract.ts';
import type { Db } from '../db/client.ts';
import { memberships, type ProjectRow, projects, projectThumbnails } from '../db/schema.ts';
import { HttpError, parseOr400 } from '../http.ts';
import { isPng } from '../uploads.ts';

type SummaryRow = Omit<ProjectRow, 'document' | 'ownerId'> & { thumbnailUpdatedAt: Date | null };

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
      .where(eq(projects.organisationId, orgId))
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
      .where(eq(projects.id, row!.id));
    res.status(201).json({ ...toSummary(created!), document: created!.document });
  });

  return router;
}

export function orgParam(params: Record<string, unknown>): string {
  const raw = params['orgId'];
  return idParam(typeof raw === 'string' ? raw : undefined);
}

/** `/api/projects/:id`: every call is limited to projects of the caller's organisations. */
export function projectsRouter(db: Db, opts: { thumbnailMaxBytes: number }): Router {
  const router = Router();

  const visible = (res: Response, id: string) =>
    and(
      eq(projects.id, id),
      inArray(projects.organisationId, memberOrganisations(db, requireSession(res).account.id))
    );

  async function loadProject(res: Response, id: string): Promise<Project> {
    const [row] = await db
      .select({ ...summaryColumns, document: projects.document })
      .from(projects)
      .leftJoin(projectThumbnails, eq(projectThumbnails.projectId, projects.id))
      .where(visible(res, id));
    if (!row) throw notFound();
    return { ...toSummary(row), document: row.document };
  }

  async function loadSummary(res: Response, id: string): Promise<ProjectSummary> {
    const [row] = await db
      .select(summaryColumns)
      .from(projects)
      .leftJoin(projectThumbnails, eq(projectThumbnails.projectId, projects.id))
      .where(visible(res, id));
    if (!row) throw notFound();
    return toSummary(row);
  }

  router.get('/:id', async (req, res) => {
    res.json(await loadProject(res, idParam(req.params.id)));
  });

  router.patch('/:id', async (req, res) => {
    const id = idParam(req.params.id);
    const { version, ...changes } = parseOr400(updateProjectBody, req.body);
    const updated = await db
      .update(projects)
      .set({ ...changes, version: sql`${projects.version} + 1`, updatedAt: sql`now()` })
      .where(and(visible(res, id), eq(projects.version, version)))
      .returning({ id: projects.id });
    if (updated.length === 0) {
      const [current] = await db
        .select({ version: projects.version })
        .from(projects)
        .where(visible(res, id));
      if (!current) throw notFound();
      throw new HttpError(409, {
        error: 'version_conflict',
        message: 'The project was changed in the meantime. Reload it and apply your change again.',
        currentVersion: current.version,
      });
    }
    res.json(await loadProject(res, id));
  });

  router.delete('/:id', async (req, res) => {
    const deleted = await db
      .delete(projects)
      .where(visible(res, idParam(req.params.id)))
      .returning({ id: projects.id });
    if (deleted.length === 0) throw notFound();
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
      const [exists] = await db.select({ id: projects.id }).from(projects).where(visible(res, id));
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
      .where(visible(res, idParam(req.params.id)));
    if (!row) throw notFound();
    // The URL carries ?v=<updated time>, so a changed thumbnail gets a new URL.
    res
      .type('image/png')
      .set('Cache-Control', 'private, max-age=31536000, immutable')
      .send(row.png);
  });

  return router;
}
