// SPDX-License-Identifier: AGPL-3.0-only
import { and, desc, eq, sql } from 'drizzle-orm';
import express, { Router } from 'express';
import {
  createProjectBody,
  type Project,
  projectIdSchema,
  type ProjectSummary,
  updateProjectBody,
} from '../contract.ts';
import type { Db } from '../db/client.ts';
import { type ProjectRow, projects, projectThumbnails } from '../db/schema.ts';
import { HttpError, parseOr400 } from '../http.ts';
import { isPng } from '../uploads.ts';

type SummaryRow = Omit<ProjectRow, 'document' | 'ownerId'> & { thumbnailUpdatedAt: Date | null };

const summaryColumns = {
  id: projects.id,
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

export function projectsRouter(db: Db, opts: { thumbnailMaxBytes: number }): Router {
  const router = Router();

  async function loadProject(id: string): Promise<Project> {
    const [row] = await db
      .select({ ...summaryColumns, document: projects.document })
      .from(projects)
      .leftJoin(projectThumbnails, eq(projectThumbnails.projectId, projects.id))
      .where(eq(projects.id, id));
    if (!row) throw notFound();
    return { ...toSummary(row), document: row.document };
  }

  async function loadSummary(id: string): Promise<ProjectSummary> {
    const [row] = await db
      .select(summaryColumns)
      .from(projects)
      .leftJoin(projectThumbnails, eq(projectThumbnails.projectId, projects.id))
      .where(eq(projects.id, id));
    if (!row) throw notFound();
    return toSummary(row);
  }

  router.get('/', async (_req, res) => {
    const rows = await db
      .select(summaryColumns)
      .from(projects)
      .leftJoin(projectThumbnails, eq(projectThumbnails.projectId, projects.id))
      .orderBy(desc(projects.updatedAt));
    res.json({ projects: rows.map(toSummary) });
  });

  router.post('/', async (req, res) => {
    const body = parseOr400(createProjectBody, req.body ?? {});
    const [row] = await db.insert(projects).values(body).returning({ id: projects.id });
    res.status(201).json(await loadProject(row!.id));
  });

  router.get('/:id', async (req, res) => {
    res.json(await loadProject(idParam(req.params.id)));
  });

  router.patch('/:id', async (req, res) => {
    const id = idParam(req.params.id);
    const { version, ...changes } = parseOr400(updateProjectBody, req.body);
    const updated = await db
      .update(projects)
      .set({ ...changes, version: sql`${projects.version} + 1`, updatedAt: sql`now()` })
      .where(and(eq(projects.id, id), eq(projects.version, version)))
      .returning({ id: projects.id });
    if (updated.length === 0) {
      const [current] = await db
        .select({ version: projects.version })
        .from(projects)
        .where(eq(projects.id, id));
      if (!current) throw notFound();
      throw new HttpError(409, {
        error: 'version_conflict',
        message: 'The project was changed in the meantime. Reload it and apply your change again.',
        currentVersion: current.version,
      });
    }
    res.json(await loadProject(id));
  });

  router.delete('/:id', async (req, res) => {
    const deleted = await db
      .delete(projects)
      .where(eq(projects.id, idParam(req.params.id)))
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
      const [exists] = await db
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.id, id));
      if (!exists) throw notFound();
      await db
        .insert(projectThumbnails)
        .values({ projectId: id, png })
        .onConflictDoUpdate({
          target: projectThumbnails.projectId,
          set: { png, updatedAt: sql`now()` },
        });
      res.json(await loadSummary(id));
    }
  );

  router.get('/:id/thumbnail', async (req, res) => {
    const [row] = await db
      .select({ png: projectThumbnails.png })
      .from(projectThumbnails)
      .where(eq(projectThumbnails.projectId, idParam(req.params.id)));
    if (!row) throw notFound();
    // The URL carries ?v=<updated time>, so a changed thumbnail gets a new URL.
    res
      .type('image/png')
      .set('Cache-Control', 'private, max-age=31536000, immutable')
      .send(row.png);
  });

  return router;
}
