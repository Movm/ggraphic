// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The start page's one action: a prompt becomes a project. With AI the model picks a
 * template and a colour world and writes its texts (`api.pick`), and only then is the
 * project created. Without AI the prompt itself becomes the headline.
 */
import { rebindPageState } from '@ggraphic/core';
import { activeBrand } from '@ggraphic/editor/brand/brandRegistry';

import { api, ApiError, type Draft, type Pick } from '../api/client';
import { applyBrandPack } from '../brandLoader';
import { fillById, fillTexts } from '../editor/aiDraft';
import { formatSize, newDocument, type StudioDocument } from '../editor/document';
import { templatesFor } from '../editor/templates/catalog';
import { HEADLINE_TEMPLATE_ID } from '../editor/templates/ids';

import { pickOffers } from './aiOffers';

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
    ? fillTexts(texts, draft)
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
async function loadOrganisationBrand(organisationId: string): Promise<void> {
  let pack = null;
  try {
    pack = (await api.getBrandPack(organisationId)).pack;
  } catch {
    // No brand reachable: the page is built on the Studio's own pack.
  }
  await applyBrandPack(pack);
}

/**
 * The document for what the AI picked: its template with the texts filled and the
 * colour world set. Null when the pick names a template the Studio does not offer on this format.
 */
export function pickedDocument(formatId: string, picked: Pick): StudioDocument | null {
  if (!templatesFor(formatId).some((e) => e.id === picked.templateId)) return null;
  const doc = newDocument(formatId, picked.templateId);
  const page = doc.pages[0]!;
  const texts = page.state['additionalTexts'] as AdditionalText[];
  let state: Record<string, unknown> = {
    ...page.state,
    additionalTexts: fillById(texts, new Map(Object.entries(picked.fills))),
  };
  if (picked.schemeId !== null) {
    // The stamp goes so the rebind below does not take the page for current.
    const { brandStamp: _stamp, ...rest } = state;
    state = { ...rest, brandScheme: picked.schemeId };
  }
  state = rebindPageState(state, { brand: activeBrand() }).state;
  return { ...doc, pages: [{ ...page, state }] };
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
    try {
      picked = pickedDocument(
        formatId,
        await api.pick({ brief: prompt.trim(), ...pickOffers(formatId), format: { width, height } })
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

/** A project from a template as it comes, in `formatId`; the user fills it in the editor. */
export async function createFromTemplate({
  organisationId,
  templateId,
  name,
  formatId,
}: {
  organisationId: string;
  templateId: string;
  name: string;
  formatId: string;
}): Promise<string> {
  await loadOrganisationBrand(organisationId);
  const project = await api.createProject(organisationId, {
    name,
    document: newDocument(formatId, templateId) as unknown as Record<string, unknown>,
  });
  return project.id;
}
