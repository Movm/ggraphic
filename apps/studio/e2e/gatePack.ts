// SPDX-License-Identifier: AGPL-3.0-only
/** What the render gate's specs share: the templates of the open pack, their formats, and the gate page. */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { type Page } from '@playwright/test';

import type { GateResult } from '../src/gate/result';

export const STUDIO_DIR = path.resolve(import.meta.dirname, '..');
const PACK_DIR = path.resolve(STUDIO_DIR, '../../packages/templates-open/src/templates');

/** The Studio format each template aspect is drawn on. */
export const FORMAT_OF_ASPECT: Readonly<Record<string, string>> = {
  '1:1': 'profile-square',
  '4:5': 'post-portrait',
  '16:9': 'slide-16-9',
};

export interface PackTemplate {
  id: string;
  kind: string;
  formats: string[];
  /** Only the part of a slot the specs read. */
  slots?: Record<string, { role?: string }>;
}

export const templates: PackTemplate[] = readdirSync(PACK_DIR)
  .filter((file) => file.endsWith('.json'))
  .map((file) => JSON.parse(readFileSync(path.join(PACK_DIR, file), 'utf8')) as PackTemplate)
  .filter((t) => t.kind === 'template')
  .sort((a, b) => a.id.localeCompare(b.id));

/** Loads `gate.html` with `params` and waits until it reports. */
export async function load(
  page: Page,
  params: Record<string, string>,
  timeout = 45_000
): Promise<void> {
  await page.goto(`/gate.html?${new URLSearchParams(params)}`);
  await page.waitForFunction(() => window.__gate?.ready === true, undefined, { timeout });
}

/** Loads `gate.html` with `params` and returns what it reports once it is ready. */
export async function open(
  page: Page,
  params: Record<string, string>,
  timeout = 45_000
): Promise<GateResult> {
  await load(page, params, timeout);
  return page.evaluate(() => window.__gate!);
}
