// SPDX-License-Identifier: AGPL-3.0-only
import { brandFingerprint, resolveScheme } from '@ggraphic/core';
import { activeBrand } from '@ggraphic/editor/brand/brandRegistry';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api, ApiError } from '../api/client';

import { createFromPrompt } from './createFromPrompt';

vi.mock('../api/client', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    api: {
      getBrandPack: vi.fn(),
      createProject: vi.fn(),
      updateProject: vi.fn(),
      draft: vi.fn(),
      pick: vi.fn(),
    },
  };
});

const mocked = vi.mocked(api, true);
type Page = { configId: string; state: Record<string, unknown> };
const pageOf = (call: unknown): Page =>
  (call as { document: { pages: Page[] } }).document.pages[0]!;
const textsOf = (page: Page) =>
  Object.fromEntries(
    (page.state['additionalTexts'] as { id: string; text: string }[]).map((t) => [t.id, t.text])
  );
const saved = () => mocked.updateProject.mock.calls[0]![1];

beforeEach(() => {
  mocked.getBrandPack.mockRejectedValue(new Error('no brand'));
  mocked.createProject.mockImplementation((_org, body) =>
    Promise.resolve({ id: 'p1', version: 1, ...body } as never)
  );
  mocked.updateProject.mockResolvedValue({} as never);
});
afterEach(() => vi.resetAllMocks());

const run = () =>
  createFromPrompt({
    organisationId: 'o1',
    prompt: 'Eine Zitatkarte',
    formatId: 'post-portrait',
    ai: true,
  });

describe('createFromPrompt with AI', () => {
  it('creates the headline project first, then saves the template and colour world the AI picked', async () => {
    mocked.pick.mockResolvedValue({
      templateId: 'studio-quote',
      schemeId: 'dark',
      fills: { headline: 'Mut zahlt sich aus', subline: 'Ada' },
    });
    const result = await run();
    expect(result).toEqual({ projectId: 'p1', draftError: null });
    expect(pageOf(mocked.createProject.mock.calls[0]![1]).configId).toBe('studio-headline');
    expect(mocked.draft).not.toHaveBeenCalled();

    const page = pageOf(saved());
    expect(page.configId).toBe('studio-quote');
    // The page is rebound into the picked world and stamped with the brand it was made under.
    expect(page.state['brandScheme']).toBe('dark');
    expect(page.state['backgroundColor']).toBe(resolveScheme(activeBrand(), 'dark')!.roles.ground);
    expect(page.state['brandStamp']).toBe(brandFingerprint(activeBrand()));
    expect(textsOf(page)).toMatchObject({ headline: 'Mut zahlt sich aus', subline: 'Ada' });
    const body = mocked.pick.mock.calls[0]![0];
    expect(body.brief).toBe('Eine Zitatkarte');
    expect(body.templates.map((t) => t.id)).not.toContain('studio-blank');
  });

  it("keeps the template's own colour world when the AI picked none", async () => {
    mocked.pick.mockResolvedValue({
      templateId: 'studio-number',
      schemeId: null,
      fills: { number: '42%' },
    });
    await run();
    const page = pageOf(saved());
    expect(page.state['brandScheme']).toBe('secondary');
    expect(textsOf(page)['number']).toBe('42%');
  });

  it('falls back to the draft when the pick fails', async () => {
    mocked.pick.mockRejectedValue(new ApiError(502, 'ai_upstream_error', 'bad'));
    mocked.draft.mockResolvedValue({ headline: 'Aus dem Entwurf', subline: 'S' });
    const result = await run();
    expect(result.draftError).toBeNull();
    const page = pageOf(saved());
    expect(page.configId).toBe('studio-headline');
    expect(textsOf(page)['headline']).toBe('Aus dem Entwurf');
  });

  it('reports the draft error only when both fail', async () => {
    mocked.pick.mockRejectedValue(new ApiError(502, 'ai_upstream_error', 'bad'));
    mocked.draft.mockRejectedValue(new ApiError(502, 'ai_timeout', 'slow'));
    const result = await run();
    expect(result).toEqual({ projectId: 'p1', draftError: 'The AI took too long to answer.' });
    expect(mocked.updateProject).not.toHaveBeenCalled();
  });

  it.each([
    ['a timeout', new ApiError(502, 'ai_timeout', 'slow'), 'The AI took too long to answer.'],
    [
      'a disabled AI',
      new ApiError(503, 'ai_disabled', 'off'),
      'AI is not available on this server.',
    ],
    ['a rate limit', new ApiError(429, 'too_many_requests', 'Slow down.'), 'Slow down.'],
  ])('does not ask for a draft after %s', async (_name, error, text) => {
    mocked.pick.mockRejectedValue(error);
    const result = await run();
    expect(result).toEqual({ projectId: 'p1', draftError: text });
    expect(mocked.draft).not.toHaveBeenCalled();
    expect(mocked.updateProject).not.toHaveBeenCalled();
  });

  it('says "design" when saving fails', async () => {
    mocked.pick.mockResolvedValue({
      templateId: 'studio-number',
      schemeId: null,
      fills: { number: '1' },
    });
    mocked.updateProject.mockRejectedValue(new ApiError(500, 'x', 'Boom'));
    const result = await run();
    expect(result.draftError).toBe('The design could not be saved. Boom');
  });
});
