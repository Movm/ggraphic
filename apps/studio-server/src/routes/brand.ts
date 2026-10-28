// SPDX-License-Identifier: AGPL-3.0-only
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import {
  aliasFontFamily,
  type BrandLayout,
  type BrandPack,
  clampBrandLayout,
} from '@ggraphic/core';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { type RequestHandler, type Response, Router } from 'express';
import multer from 'multer';
import { requireMembership, requireSession } from '../auth/middleware.ts';
import {
  detectFontType,
  detectLogoType,
  BRAND_ASSET_TYPES,
  parseAssetName,
  randomAssetName,
} from '../brand/assets.ts';
import { buildBrandPack, BUNDLED_FONT_FAMILIES } from '../brand/build.ts';
import { settingsFromInput } from '../brand/derive.ts';
import type { Config } from '../config.ts';
import {
  type BrandAsset,
  brandSettingsBody,
  type BrandSettings,
  brandWriteBody,
  fontUploadFields,
} from '../contract.ts';
import type { Db } from '../db/client.ts';
import { type BrandAssetRow, brandAssets, brandPacks, memberships } from '../db/schema.ts';
import { HttpError, parseOr400 } from '../http.ts';
import { orgParam } from './projects.ts';

const notFound = () => new HttpError(404, { error: 'not_found' });

function toAsset(row: BrandAssetRow): BrandAsset {
  return {
    id: row.id,
    kind: row.kind,
    url: `/api/brand-assets/${row.fileName}`,
    contentType: row.contentType,
    size: row.size,
    family: row.fontFamily,
    weight: row.fontWeight,
    style: row.fontStyle,
    licence: row.licence,
  };
}

export interface BrandPackResponse {
  /** null until an owner saves the brand: the editor then uses Studio's own pack. */
  settings: BrandSettings | null;
  assets: BrandAsset[];
  pack: BrandPack | null;
  bundledFonts: readonly string[];
}

export function assetDir(config: Pick<Config, 'dataDir'>): string {
  return `${config.dataDir}/brand-assets`;
}

/** `/api/orgs/:orgId/brand-pack`: members read, owners change. */
export function organisationBrandRouter(db: Db, config: Config): Router {
  const router = Router({ mergeParams: true });
  const dir = assetDir(config);
  const me = (res: Response) => requireSession(res).account.id;

  async function load(orgId: string): Promise<BrandPackResponse> {
    const [row] = await db.select().from(brandPacks).where(eq(brandPacks.organisationId, orgId));
    const assets = await db
      .select()
      .from(brandAssets)
      .where(eq(brandAssets.organisationId, orgId))
      .orderBy(asc(brandAssets.createdAt));
    const settings: BrandSettings | null = row
      ? brandSettingsBody.parse({
          name: row.name,
          colors: row.colors,
          backgrounds: row.backgrounds,
          fonts: row.fonts,
          logoAssetId: row.logoAssetId,
          logoAlt:
            row.logoAltAssetId && row.logoAltGround
              ? { assetId: row.logoAltAssetId, ground: row.logoAltGround }
              : null,
          // Stored under wider bounds: clamp on read, so an old row never fails the schema.
          layout: row.layout ? clampBrandLayout(row.layout as unknown as BrandLayout) : null,
        })
      : null;
    const fonts = assets
      .filter((a) => a.kind === 'font')
      .map((a) => ({
        fileName: a.fileName,
        family: a.fontFamily!,
        weight: a.fontWeight!,
        style: a.fontStyle!,
      }));
    const logo = assets.find((a) => a.kind === 'logo' && a.id === settings?.logoAssetId) ?? null;
    const altAsset = assets.find((a) => a.kind === 'logo' && a.id === settings?.logoAlt?.assetId);
    const logoAlt =
      altAsset && settings?.logoAlt
        ? { fileName: altAsset.fileName, ground: settings.logoAlt.ground }
        : null;
    return {
      settings,
      assets: assets.map(toAsset),
      pack: settings ? buildBrandPack(orgId, settings, fonts, logo, logoAlt) : null,
      bundledFonts: BUNDLED_FONT_FAMILIES,
    };
  }

  router.get('/', async (req, res) => {
    const orgId = orgParam(req.params);
    await requireMembership(db, me(res), orgId);
    res.json(await load(orgId));
  });

  router.put('/', async (req, res) => {
    const orgId = orgParam(req.params);
    await requireMembership(db, me(res), orgId, 'owner');
    const parsed = parseOr400(brandWriteBody, req.body);
    // Read and write in one transaction under a row lock, so a save that kept stored values
    // cannot write them back over a concurrent one.
    await db.transaction(async (tx) => {
      // A key the client did not send keeps its stored value; an explicit null clears it.
      const [stored] = await tx
        .select()
        .from(brandPacks)
        .where(eq(brandPacks.organisationId, orgId))
        .for('update');
      const assets = await tx
        .select()
        .from(brandAssets)
        .where(eq(brandAssets.organisationId, orgId));
      const families = new Set<string>([
        ...BUNDLED_FONT_FAMILIES,
        ...assets.filter((a) => a.kind === 'font').map((a) => a.fontFamily!),
      ]);
      const keep = <T>(sent: T | null | undefined, kept: T | null): T | null =>
        sent === undefined ? kept : sent;
      const storedFonts = (stored?.fonts ?? {}) as {
        serif?: string | null;
        condensed?: string | null;
      };
      // A kept family whose font was deleted since is dropped: an old client cannot see or fix it.
      const alive = (family: string | null) => {
        const aliased = family && aliasFontFamily(family);
        return aliased && families.has(aliased) ? aliased : null;
      };
      const serif =
        parsed.fonts.serif === undefined ? alive(storedFonts.serif ?? null) : parsed.fonts.serif;
      const condensed =
        parsed.fonts.condensed === undefined
          ? alive(storedFonts.condensed ?? null)
          : parsed.fonts.condensed;
      const storedAlt =
        stored?.logoAltAssetId && stored.logoAltGround
          ? { assetId: stored.logoAltAssetId, ground: stored.logoAltGround }
          : null;
      // Old clients may still send a replaced family ("PT Sans"); store its successor.
      const body = settingsFromInput({
        ...parsed,
        fonts: {
          headline: aliasFontFamily(parsed.fonts.headline),
          body: aliasFontFamily(parsed.fonts.body),
          serif: serif && aliasFontFamily(serif),
          condensed: condensed && aliasFontFamily(condensed),
        },
        logoAlt: keep(parsed.logoAlt, storedAlt),
        layout: keep(
          parsed.layout,
          stored?.layout ? clampBrandLayout(stored.layout as unknown as BrandLayout) : null
        ),
      });
      if (!body) {
        throw new HttpError(400, {
          error: 'invalid_request',
          message: 'colors: cannot derive a brand.',
        });
      }
      for (const [slot, family] of Object.entries(body.fonts)) {
        if (family !== null && !families.has(family)) {
          throw new HttpError(400, {
            error: 'invalid_request',
            message: `fonts.${slot}: upload a font of family "${family}" first, or pick ${BUNDLED_FONT_FAMILIES.join(', ')}.`,
          });
        }
      }
      if (body.logoAssetId && !assets.some((a) => a.id === body.logoAssetId && a.kind === 'logo')) {
        throw new HttpError(400, {
          error: 'invalid_request',
          message: 'logoAssetId: not a logo of this organisation.',
        });
      }
      if (
        body.logoAlt &&
        !assets.some((a) => a.id === body.logoAlt?.assetId && a.kind === 'logo')
      ) {
        throw new HttpError(400, {
          error: 'invalid_request',
          message: 'logoAlt.assetId: not a logo of this organisation.',
        });
      }
      const values = {
        name: body.name,
        colors: body.colors,
        backgrounds: body.backgrounds,
        fonts: body.fonts,
        logoAssetId: body.logoAssetId,
        layout: body.layout,
        logoAltAssetId: body.logoAlt?.assetId ?? null,
        logoAltGround: body.logoAlt?.ground ?? null,
      };
      await tx
        .insert(brandPacks)
        .values({ organisationId: orgId, ...values })
        .onConflictDoUpdate({
          target: brandPacks.organisationId,
          set: { ...values, updatedAt: sql`now()` },
        });
    });
    res.json(await load(orgId));
  });

  const ownerFirst: RequestHandler = async (req, res, next) => {
    await requireMembership(db, me(res), orgParam(req.params), 'owner');
    next();
  };

  const logoUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.uploadMaxBytes, files: 1, fields: 0 },
  });
  const fontUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.fontMaxBytes, files: 1, fields: 4, fieldSize: 200 },
  });

  async function store(
    orgId: string,
    buffer: Buffer,
    ext: keyof typeof BRAND_ASSET_TYPES,
    extra: Partial<typeof brandAssets.$inferInsert>
  ): Promise<BrandAsset> {
    const fileName = randomAssetName(ext);
    await mkdir(dir, { recursive: true });
    await writeFile(`${dir}/${fileName}`, buffer, { flag: 'wx' });
    const [row] = await db
      .insert(brandAssets)
      .values({
        organisationId: orgId,
        kind: ext === 'png' || ext === 'webp' ? 'logo' : 'font',
        fileName,
        contentType: BRAND_ASSET_TYPES[ext],
        size: buffer.length,
        ...extra,
      })
      .returning();
    return toAsset(row!);
  }

  const missingFile = () =>
    new HttpError(400, { error: 'invalid_upload', message: 'Send one file in the "file" field.' });

  router.post('/logo', ownerFirst, logoUpload.single('file'), async (req, res) => {
    if (!req.file) throw missingFile();
    const ext = detectLogoType(req.file.buffer);
    if (!ext) {
      throw new HttpError(415, {
        error: 'unsupported_media_type',
        message: 'Logos must be PNG or WebP. SVG is not accepted.',
      });
    }
    res.status(201).json(await store(orgParam(req.params), req.file.buffer, ext, {}));
  });

  router.post('/fonts', ownerFirst, fontUpload.single('file'), async (req, res) => {
    const fields = parseOr400(fontUploadFields, req.body ?? {});
    if (!req.file) throw missingFile();
    const ext = detectFontType(req.file.buffer);
    if (!ext) {
      throw new HttpError(415, {
        error: 'unsupported_media_type',
        message: 'Fonts must be WOFF2, TTF or OTF.',
      });
    }
    res.status(201).json(
      await store(orgParam(req.params), req.file.buffer, ext, {
        fontFamily: fields.family,
        fontWeight: fields.weight,
        fontStyle: fields.style,
        licence: fields.licence,
      })
    );
  });

  router.delete('/assets/:assetId', ownerFirst, async (req, res) => {
    const orgId = orgParam(req.params);
    const assetId = orgParam({ orgId: req.params['assetId'] });
    const [asset] = await db
      .delete(brandAssets)
      .where(and(eq(brandAssets.id, assetId), eq(brandAssets.organisationId, orgId)))
      .returning({ fileName: brandAssets.fileName, family: brandAssets.fontFamily });
    if (!asset) throw notFound();
    // Name comes from our own row and is re-checked: never a path from the request.
    if (parseAssetName(asset.fileName)) {
      await unlink(`${dir}/${asset.fileName}`).catch(() => undefined);
    }
    res.status(204).end();
  });

  return router;
}

/** `GET /api/brand-assets/:file`: logo and font files, for members of their organisation. */
export function brandAssetsRouter(db: Db, config: Config): Router {
  const router = Router();
  const dir = assetDir(config);

  router.get('/:file', async (req, res, next) => {
    const ext = parseAssetName(req.params.file);
    if (!ext) throw notFound();
    const accountId = requireSession(res).account.id;
    const [row] = await db
      .select({ fileName: brandAssets.fileName })
      .from(brandAssets)
      .where(
        and(
          eq(brandAssets.fileName, req.params.file),
          inArray(
            brandAssets.organisationId,
            db
              .select({ id: memberships.organisationId })
              .from(memberships)
              .where(eq(memberships.accountId, accountId))
          )
        )
      );
    if (!row) throw notFound();
    res.set({
      'Content-Type': BRAND_ASSET_TYPES[ext],
      'Cache-Control': 'private, max-age=31536000, immutable',
      'Content-Security-Policy': "sandbox; default-src 'none'",
      'Cross-Origin-Resource-Policy': 'same-origin',
    });
    res.sendFile(row.fileName, { root: dir, dotfiles: 'deny' }, (err) => {
      if (!err) return;
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        res.status(404).type('application/json').json({ error: 'not_found' });
        return;
      }
      next(err);
    });
  });

  return router;
}
