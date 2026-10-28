// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The start page's one action: a prompt becomes a project. The project is
 * created at once (so nothing is lost if the draft fails), the AI writes the
 * texts meanwhile, and the "Headline + text" page is saved with them. Without
 * AI the prompt itself becomes the headline.
 *
 * With AI the model first picks a template and a colour world and writes its texts
 * (`api.pick`); if that fails, the older single draft on the headline template is tried.
 */
import { rebindPageState } from '@ggraphic/core';
import { activeBrand } from '@ggraphic/editor/brand/brandRegistry';

import { api, ApiError, type Draft, type Pick } from '../api/client';
import { applyBrandPack } from '../brandLoader';
import { fillById, fillTexts } from '../editor/aiDraft';
import { formatSize, newDocument, type StudioDocument } from '../editor/document';
import {
  HEADLINE_TEMPLATE_ID,
  isStudioTemplateId,
  type StudioTemplateId,
} from '../editor/templates/ids';

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
 * colour world set. Null when the pick names a template the Studio does not have.
 */
export function pickedDocument(formatId: string, picked: Pick): StudioDocument | null {
  if (!isStudioTemplateId(picked.templateId)) return null;
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
  /** Set when the AI was asked and could not deliver: the editor opens with the template. */
  draftError: string | null;
}

function draftErrorText(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'ai_timeout') return 'The AI took too long to answer.';
    if (err.code === 'ai_disabled') return 'AI is not available on this server.';
    return err.message;
  }
  return 'The AI draft failed.';
}

/** The AI is down, switched off or rate-limited: a second request would fail the same way. */
function isAiWall(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    (err.code === 'ai_timeout' || err.code === 'ai_disabled' || err.status === 429)
  );
}

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
  if (!ai) {
    const project = await api.createProject(organisationId, {
      name,
      document: filledDocument(formatId, prompt, null) as unknown as Record<string, unknown>,
    });
    return { projectId: project.id, draftError: null };
  }

  const { width, height } = formatSize(formatId);
  const pick = api.pick({ brief: prompt.trim(), ...pickOffers(), format: { width, height } }).then(
    (value) => ({ document: pickedDocument(formatId, value), stop: null }),
    // A draft would meet the same wall: report it instead of asking again.
    (err: unknown) => ({ document: null, stop: isAiWall(err) ? err : null })
  );
  // The template first: if the AI fails, the user still gets a project to work on.
  const project = await api.createProject(organisationId, {
    name,
    document: newDocument(formatId, HEADLINE_TEMPLATE_ID) as unknown as Record<string, unknown>,
  });
  const picked = await pick;
  if (picked.stop) return { projectId: project.id, draftError: draftErrorText(picked.stop) };
  let document = picked.document;
  if (!document) {
    try {
      const draft = await api.draft({ briefing: prompt.trim(), width, height });
      document = filledDocument(formatId, prompt, draft);
    } catch (err) {
      return { projectId: project.id, draftError: draftErrorText(err) };
    }
  }
  try {
    await api.updateProject(project.id, {
      version: project.version,
      document: document as unknown as Record<string, unknown>,
    });
    return { projectId: project.id, draftError: null };
  } catch (err) {
    return {
      projectId: project.id,
      draftError: `The design could not be saved. ${draftErrorText(err)}`,
    };
  }
}

/** A project from a template as it comes, in `formatId`; the user fills it in the editor. */
export async function createFromTemplate({
  organisationId,
  templateId,
  name,
  formatId,
}: {
  organisationId: string;
  templateId: StudioTemplateId;
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
