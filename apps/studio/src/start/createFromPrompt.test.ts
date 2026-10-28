// SPDX-License-Identifier: AGPL-3.0-only
import { brandFingerprint, resolveScheme } from '@ggraphic/core';
import { activeBrand } from '@ggraphic/editor/brand/brandRegistry';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api, ApiError } from '../api/client';

import { AiPromptError, createFromPrompt, pickedDocument } from './createFromPrompt';

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
const saved = () => mocked.createProject.mock.calls[0]![1];

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
  it('creates the project with the template and colour world the AI picked', async () => {
    mocked.pick.mockResolvedValue({
      templateId: 'studio-quote',
      schemeId: 'primary',
      fills: { headline: 'Mut zahlt sich aus', subline: 'Ada' },
    });
    const result = await run();
    expect(result).toEqual({ projectId: 'p1' });
    expect(mocked.createProject).toHaveBeenCalledTimes(1);
    expect(mocked.updateProject).not.toHaveBeenCalled();
    expect(mocked.draft).not.toHaveBeenCalled();

    const page = pageOf(saved());
    expect(page.configId).toBe('studio-blank');
    expect((page.state['templateRef'] as { id: string }).id).toBe('studio-quote');
    // The page is rebound into the picked world and stamped with the brand it was made under.
    expect(page.state['brandScheme']).toBe('primary');
    expect(page.state['backgroundColor']).toBe(
      resolveScheme(activeBrand(), 'primary')!.roles.ground
    );
    expect(page.state['brandStamp']).toBe(brandFingerprint(activeBrand()));
    expect(textsOf(page)).toMatchObject({ headline: 'Mut zahlt sich aus', subline: 'Ada' });
    const body = mocked.pick.mock.calls[0]![0];
    expect(body.brief).toBe('Eine Zitatkarte');
    expect(body.templates.map((t) => t.id)).not.toContain('studio-blank');
  });

  it('falls back to the first world the template offers when the picked one is not offered', async () => {
    mocked.pick.mockResolvedValue({
      templateId: 'studio-quote',
      schemeId: 'dark',
      fills: { headline: 'Mut zahlt sich aus' },
    });
    await run();
    const page = pageOf(saved());
    expect(page.state['brandScheme']).toBe('light');
    expect(page.state['backgroundColor']).toBe(resolveScheme(activeBrand(), 'light')!.roles.ground);
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

  it.each([
    ['a timeout', new ApiError(502, 'ai_timeout', 'upstream timed out'), 'timeout'],
    ['a disabled AI', new ApiError(503, 'ai_disabled', 'off'), 'disabled'],
    ['a provider rate limit', new ApiError(429, 'ai_rate_limited', 'busy'), 'busy'],
    ['our own rate limit', new ApiError(429, 'rate_limited', 'Too many attempts.'), 'busy'],
    ['an upstream error', new ApiError(502, 'ai_upstream_error', 'upstream 500'), 'failed'],
    ['a network error', new TypeError('Failed to fetch'), 'failed'],
  ])('creates no project and no draft after %s', async (_name, error, kind) => {
    mocked.pick.mockRejectedValue(error);
    const failure = await run().then(
      () => null,
      (e: unknown) => e
    );
    expect(failure).toBeInstanceOf(AiPromptError);
    expect((failure as AiPromptError).kind).toBe(kind);
    expect(mocked.createProject).not.toHaveBeenCalled();
    expect(mocked.updateProject).not.toHaveBeenCalled();
    expect(mocked.draft).not.toHaveBeenCalled();
  });

  it('never shows the raw server text', async () => {
    mocked.pick.mockRejectedValue(new ApiError(502, 'ai_upstream_error', 'upstream exploded'));
    const failure = await run().then(
      () => null,
      (e: unknown) => e as AiPromptError
    );
    expect(failure!.message).not.toMatch(/upstream/i);
    expect(failure!.message.length).toBeGreaterThan(10);
  });

  it('treats a pick for a template the Studio lacks as a failed AI, not a draft', async () => {
    mocked.pick.mockResolvedValue({ templateId: 'nope', schemeId: null, fills: {} });
    const failure = await run().then(
      () => null,
      (e: unknown) => e
    );
    expect(failure).toBeInstanceOf(AiPromptError);
    expect(mocked.createProject).not.toHaveBeenCalled();
    expect(mocked.draft).not.toHaveBeenCalled();
  });
});

describe('pickedDocument', () => {
  it('gives no document for an unknown template id', () => {
    expect(
      pickedDocument('post-portrait', { templateId: 'nope', schemeId: null, fills: {} })
    ).toBeNull();
  });
});
