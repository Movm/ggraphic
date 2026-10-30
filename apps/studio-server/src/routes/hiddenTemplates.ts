// SPDX-License-Identifier: AGPL-3.0-only
import { and, asc, eq } from 'drizzle-orm';
import { Router } from 'express';
import { requireMembership, requireSession } from '../auth/middleware.ts';
import { type HiddenTemplates, hideTemplateBody, templateIdParam } from '../contract.ts';
import type { Db } from '../db/client.ts';
import { hiddenTemplates } from '../db/schema.ts';
import { parseOr400 } from '../http.ts';
import { orgParam } from './projects.ts';

/** `/api/orgs/:orgId/hidden-templates`: members read, owners hide and show. */
export function organisationHiddenTemplatesRouter(db: Db): Router {
  const router = Router({ mergeParams: true });

  router.get('/', async (req, res) => {
    const orgId = orgParam(req.params);
    await requireMembership(db, requireSession(res).account.id, orgId);
    const rows = await db
      .select({ templateId: hiddenTemplates.templateId })
      .from(hiddenTemplates)
      .where(eq(hiddenTemplates.organisationId, orgId))
      .orderBy(asc(hiddenTemplates.templateId));
    const body: HiddenTemplates = { templateIds: rows.map((r) => r.templateId) };
    res.json(body);
  });

  router.put('/:templateId', async (req, res) => {
    const orgId = orgParam(req.params);
    const accountId = requireSession(res).account.id;
    await requireMembership(db, accountId, orgId, 'owner');
    const templateId = parseOr400(templateIdParam, req.params['templateId']);
    const { hidden } = parseOr400(hideTemplateBody, req.body);
    if (hidden) {
      await db
        .insert(hiddenTemplates)
        .values({ organisationId: orgId, templateId, hiddenBy: accountId })
        .onConflictDoNothing();
    } else {
      await db
        .delete(hiddenTemplates)
        .where(
          and(eq(hiddenTemplates.organisationId, orgId), eq(hiddenTemplates.templateId, templateId))
        );
    }
    res.status(204).end();
  });

  return router;
}
