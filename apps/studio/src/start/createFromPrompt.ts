// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The start page's one action: a prompt becomes a project. With AI the model picks a
 * template and a colour world and writes its texts (`api.pick`), and only then is the
 * project created. Without AI the prompt itself becomes the headline.
 */
import { offeredSchemes, type BrandPack, type SchemeId } from '@ggraphic/core';
import { activeBrand } from '@ggraphic/editor/brand/brandRegistry';

import { api, ApiError, type Draft, type Pick } from '../api/client';
import { applyBrandPack } from '../brandLoader';
import { fillById, fillTexts } from '../editor/aiDraft';
import { formatSize, newDocument, type StudioDocument } from '../editor/document';
import { templatesFor } from '../editor/templates/catalog';
import {
  BLANK_TEMPLATE_ID,
  FREE_PAGE_CONFIG_ID,
  HEADLINE_TEMPLATE_ID,
} from '../editor/templates/ids';
import { templatePageState } from '../editor/templates/instantiate';

import { pickOffers } from './aiOffers';
import { fetchHiddenIds } from './hiddenTemplates';

import { type AdditionalText } from '@ggraphic/editor/configs/types';

const NAME_WORDS = 6;
const NAME_MAX = 60;
const HEADLINE_MAX = 120;

/** The project name: the first words of the prompt. */
export function nameFromPrompt(prompt: string): string {
  const words = prompt.trim().split(/\s+/).filter(Boolean);
  const name = words.slice(0, NAME_WORDS).join(' ');
  if (!name) return 'Untitled';
  const cut = name.slice(0, NAME_MAX).trimEnd();
  return words.length > NAME_WORDS || name.length > NAME_MAX ? `${cut}…` : cut;
}

/** The document with `draft` (or, without one, the prompt as headline) on its page. */
export function filledDocument(
  formatId: string,
  prompt: string,
  draft: Draft | null
): StudioDocument {
  const doc = newDocument(formatId, HEADLINE_TEMPLATE_ID);
  const page = doc.pages[0]!;
  const texts = page.state['additionalTexts'] as AdditionalText[];
  const headline = prompt.trim().slice(0, HEADLINE_MAX);
  const filled = draft
    ? fillTexts(texts, draft, formatSize(formatId).height)
    : texts.map((t) => (t.id === 'headline' ? { ...t, text: headline } : t));
  return {
    ...doc,
    pages: [{ ...page, state: { ...page.state, additionalTexts: filled ?? texts } }],
  };
}

/**
 * The seeds read the registered brand (colours, fonts, logo), so the
 * organisation's pack is put in place before a page is built, as the editor does.
 */
export async function loadOrganisationBrand(organisationId: string): Promise<void> {
  await applyBrandPack(await fetchOrganisationBrand(organisationId));
}

/**
 * The organisation's brand pack, or null when none is reachable. Registers nothing: callers that
 * only read the brand (the start page's tiles) must not change the editor's active brand.
 */
export async function fetchOrganisationBrand(organisationId: string): Promise<BrandPack | null> {
  try {
    return (await api.getBrandPack(organisationId)).pack;
  } catch {
    // No brand reachable: the page is built on the Studio's own pack.
    return null;
  }
}

/**
 * The document for what the AI picked: its template with the texts filled and the
 * colour world set. Null when the pick names a template the Studio does not offer on this format.
 */
export function pickedDocument(formatId: string, picked: Pick): StudioDocument | null {
  const entry = templatesFor(formatId).find((e) => e.id === picked.templateId);
  if (!entry) return null;
  // A world the template does not offer falls back to the template's own first one.
  const worlds: string[] = offeredSchemes(entry.template, activeBrand());
  const world =
    picked.schemeId !== null && worlds.includes(picked.schemeId) ? picked.schemeId : null;
  // Placed straight into its world, so the logo is fitted for that world's ground.
  const placed = templatePageState(entry, formatId, { schemeId: world as SchemeId | null });
  if (!placed) return null;
  const texts = placed['additionalTexts'] as AdditionalText[];
  const state = {
    ...placed,
    additionalTexts: fillById(
      texts,
      new Map(Object.entries(picked.fills)),
      formatSize(formatId).height
    ),
  };
  return { formatId, pages: [{ configId: FREE_PAGE_CONFIG_ID, state }] };
}

export interface PromptResult {
  projectId: string;
}

export type AiFailureKind = 'timeout' | 'disabled' | 'busy' | 'failed';

const AI_FAILURE_TEXT: Record<AiFailureKind, string> = {
  timeout: 'The AI took too long to answer. Please try again.',
  disabled: 'AI is not available on this server.',
  busy: 'The AI is busy right now. Please try again in a moment.',
  failed: 'The AI could not write a design this time. Please try again.',
};

/**
 * The AI could not deliver. Nothing was created; `message` is fit to show as it is,
 * whatever the server said (that text is for logs, not for people).
 */
export class AiPromptError extends Error {
  constructor(readonly kind: AiFailureKind) {
    super(AI_FAILURE_TEXT[kind]);
    this.name = 'AiPromptError';
  }
}

function failureKind(err: unknown): AiFailureKind {
  if (err instanceof ApiError) {
    if (err.code === 'ai_timeout') return 'timeout';
    if (err.code === 'ai_disabled') return 'disabled';
    if (err.status === 429) return 'busy';
  }
  return 'failed';
}

/**
 * With AI there is no fallback: if the model cannot pick and write, no project is made
 * (an empty placeholder in the list helps nobody) and the caller keeps the prompt.
 */
export async function createFromPrompt({
  organisationId,
  prompt,
  formatId,
  ai,
}: {
  organisationId: string;
  prompt: string;
  formatId: string;
  ai: boolean;
}): Promise<PromptResult> {
  const name = nameFromPrompt(prompt);
  await loadOrganisationBrand(organisationId);
  let document: StudioDocument;
  if (!ai) {
    document = filledDocument(formatId, prompt, null);
  } else {
    const { width, height } = formatSize(formatId);
    let picked: StudioDocument | null;
    const hidden = await fetchHiddenIds(organisationId);
    try {
      picked = pickedDocument(
        formatId,
        await api.pick({
          brief: prompt.trim(),
          ...pickOffers(formatId, activeBrand(), hidden),
          format: { width, height },
        })
      );
    } catch (err) {
      throw new AiPromptError(failureKind(err));
    }
    if (!picked) throw new AiPromptError('failed');
    document = picked;
  }
  const project = await api.createProject(organisationId, {
    name,
    document: document as unknown as Record<string, unknown>,
  });
  return { projectId: project.id };
}

/** The template cannot be placed on this format in the organisation's brand. */
export class TemplateUnavailableError extends Error {
  constructor() {
    super('This template cannot be placed on this format with your brand.');
    this.name = 'TemplateUnavailableError';
  }
}

/** A project from a template as it comes, in `formatId`; the user fills it in the editor. */
export async function createFromTemplate({
  organisationId,
  templateId,
  name,
  formatId,
  schemeId = null,
}: {
  organisationId: string;
  templateId: string;
  name: string;
  formatId: string;
  /** The colour world to start in; null: the template's first. */
  schemeId?: SchemeId | null;
}): Promise<string> {
  await loadOrganisationBrand(organisationId);
  // The tiles may have been drawn before the brand was known: say so, never start a blank project.
  if (
    templateId !== BLANK_TEMPLATE_ID &&
    !templatesFor(formatId).some((e) => e.id === templateId)
  ) {
    throw new TemplateUnavailableError();
  }
  const project = await api.createProject(organisationId, {
    name,
    document: newDocument(formatId, templateId, schemeId) as unknown as Record<string, unknown>,
  });
  return project.id;
}
