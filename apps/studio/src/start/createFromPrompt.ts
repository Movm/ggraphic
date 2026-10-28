// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The start page's one action: a prompt becomes a project. The project is
 * created at once (so nothing is lost if the draft fails), the AI writes the
 * texts meanwhile, and the "Headline + text" page is saved with them. Without
 * AI the prompt itself becomes the headline.
 */
import { api, ApiError, type Draft } from '../api/client';
import { fillTexts } from '../editor/aiDraft';
import { formatSize, newDocument, type StudioDocument } from '../editor/document';
import { HEADLINE_TEMPLATE_ID, type StudioTemplateId } from '../editor/templates/ids';

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
  if (!ai) {
    const project = await api.createProject(organisationId, {
      name,
      document: filledDocument(formatId, prompt, null) as unknown as Record<string, unknown>,
    });
    return { projectId: project.id, draftError: null };
  }

  const { width, height } = formatSize(formatId);
  const draft = api.draft({ briefing: prompt.trim(), width, height }).then(
    (value) => ({ value, error: null }),
    (err: unknown) => ({ value: null, error: draftErrorText(err) })
  );
  // The template first: if the draft fails, the user still gets a project to work on.
  const project = await api.createProject(organisationId, {
    name,
    document: newDocument(formatId, HEADLINE_TEMPLATE_ID) as unknown as Record<string, unknown>,
  });
  const result = await draft;
  if (!result.value) return { projectId: project.id, draftError: result.error };
  try {
    await api.updateProject(project.id, {
      version: project.version,
      document: filledDocument(formatId, prompt, result.value) as unknown as Record<
        string,
        unknown
      >,
    });
    return { projectId: project.id, draftError: null };
  } catch (err) {
    return {
      projectId: project.id,
      draftError: `The draft could not be saved. ${draftErrorText(err)}`,
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
  const project = await api.createProject(organisationId, {
    name,
    document: newDocument(formatId, templateId) as unknown as Record<string, unknown>,
  });
  return project.id;
}
