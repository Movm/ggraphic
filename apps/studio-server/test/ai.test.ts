// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it, vi } from 'vitest';
import { createDraft, parseDraft } from '../src/ai.ts';
import type { AiConfig } from '../src/config.ts';
import { HttpError } from '../src/http.ts';

const ai: AiConfig = {
  baseUrl: 'https://llm.example/v1',
  apiKey: 'sk-secret',
  model: 'test-model',
  timeoutMs: 1000,
};

const completion = (content: string | null) =>
  new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

describe('parseDraft', () => {
  it('accepts a full draft', () => {
    expect(
      parseDraft(
        '{"headline":"Mehr Bäume","subline":"Für kühle Städte.","body":"Text","callToAction":"Mitmachen"}'
      )
    ).toEqual({
      headline: 'Mehr Bäume',
      subline: 'Für kühle Städte.',
      body: 'Text',
      callToAction: 'Mitmachen',
    });
  });

  it('drops empty and null optional fields', () => {
    expect(parseDraft('{"headline":"H","subline":"S","body":null,"callToAction":""}')).toEqual({
      headline: 'H',
      subline: 'S',
    });
  });

  it('strips code fences', () => {
    expect(parseDraft('```json\n{"headline":"H","subline":"S"}\n```')).toEqual({
      headline: 'H',
      subline: 'S',
    });
  });

  it.each([
    'not json',
    '{"subline":"S"}',
    '{"headline":"","subline":"S"}',
    '[]',
    '{"headline":1,"subline":"S"}',
  ])('rejects %s', (content) => {
    expect(parseDraft(content)).toBeNull();
  });
});

describe('createDraft', () => {
  it('calls chat completions in JSON mode and returns the draft', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(completion('{"headline":"H","subline":"S"}'));
    const draft = await createDraft(
      ai,
      { briefing: 'Sommerfest', format: 'Instagram post', width: 1080, height: 1350 },
      fetchMock
    );
    expect(draft).toEqual({ headline: 'H', subline: 'S' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://llm.example/v1/chat/completions');
    expect((init?.headers as Record<string, string>)['authorization']).toBe('Bearer sk-secret');
    const body = JSON.parse(init?.body as string) as Record<string, unknown>;
    expect(body['model']).toBe('test-model');
    expect(body['response_format']).toEqual({ type: 'json_object' });
    expect(JSON.stringify(body['messages'])).toContain('1080x1350');
  });

  async function expectHttpError(promise: Promise<unknown>, status: number, error: string) {
    const err = await promise.then(
      () => null,
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(status);
    expect((err as HttpError).body.error).toBe(error);
    // The key never leaks into what the client sees.
    expect(JSON.stringify((err as HttpError).body)).not.toContain('sk-secret');
  }

  it('maps an upstream HTTP error to 502', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{"error":"bad key sk-secret"}', { status: 401 }));
    await expectHttpError(createDraft(ai, { briefing: 'x' }, fetchMock), 502, 'ai_upstream_error');
  });

  it('maps an unusable answer to 502', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(completion('Here is your text: Hello'));
    await expectHttpError(createDraft(ai, { briefing: 'x' }, fetchMock), 502, 'ai_upstream_error');
  });

  it('maps a timeout to 502 ai_timeout', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new DOMException('timed out', 'TimeoutError'));
    await expectHttpError(createDraft(ai, { briefing: 'x' }, fetchMock), 502, 'ai_timeout');
  });

  it('maps a network failure to 502', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('fetch failed'));
    await expectHttpError(createDraft(ai, { briefing: 'x' }, fetchMock), 502, 'ai_upstream_error');
  });

  it('actually aborts a slow provider', async () => {
    const slow: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      });
    await expectHttpError(
      createDraft({ ...ai, timeoutMs: 20 }, { briefing: 'x' }, slow),
      502,
      'ai_timeout'
    );
  });
});
