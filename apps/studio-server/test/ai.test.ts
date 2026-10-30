// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it, vi } from 'vitest';
import { createCallObject, createDraft, parseDraft } from '../src/ai.ts';
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

  it('maps a provider rate limit to 429 ai_rate_limited with Retry-After', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{}', { status: 429, headers: { 'retry-after': '12' } }));
    const err = await createDraft(ai, { briefing: 'x' }, fetchMock).then(
      () => null,
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(429);
    expect((err as HttpError).body.error).toBe('ai_rate_limited');
    expect((err as HttpError).retryAfter).toBe(12);
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

describe('createCallObject', () => {
  const validate = (input: unknown) =>
    typeof input === 'object' && input !== null && 'n' in input && input.n === 1
      ? { ok: true as const, value: 1 }
      : { ok: false as const, error: 'n must be 1' };
  const call = { system: 'SYS', prompt: 'ASK', schema: { type: 'object' }, validate };
  const bodyOf = (fetchMock: ReturnType<typeof vi.fn<typeof fetch>>, n: number) =>
    JSON.parse(fetchMock.mock.calls[n]![1]?.body as string) as {
      messages: { role: string; content: string }[];
      response_format: unknown;
    };

  it('asks in JSON mode with the schema in the system prompt and returns the validated value', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(completion('{"n":1}'));
    expect(await createCallObject(ai, fetchMock)(call)).toEqual({ ok: true, data: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = bodyOf(fetchMock, 0);
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.messages[0]).toMatchObject({ role: 'system' });
    expect(body.messages[0]!.content).toContain('SYS');
    expect(body.messages[0]!.content).toContain('"type":"object"');
    expect(body.messages[1]).toEqual({ role: 'user', content: 'ASK' });
  });

  it('tolerates code fences', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(completion('```json\n{"n":1}\n```'));
    expect(await createCallObject(ai, fetchMock)(call)).toEqual({ ok: true, data: 1 });
  });

  it('repairs an invalid answer, quoting the validator error', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(completion('{"n":2}'))
      .mockResolvedValueOnce(completion('{"n":1}'));
    expect(await createCallObject(ai, fetchMock)(call)).toEqual({ ok: true, data: 1 });
    const messages = bodyOf(fetchMock, 1).messages;
    expect(messages.slice(2)).toEqual([
      { role: 'assistant', content: '{"n":2}' },
      {
        role: 'user',
        content:
          'Your answer was invalid: n must be 1. Answer again with the corrected JSON object only.',
      },
    ]);
  });

  it('repairs an answer that is not JSON', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(completion('Sure!'))
      .mockResolvedValueOnce(completion('{"n":1}'));
    expect((await createCallObject(ai, fetchMock)(call)).ok).toBe(true);
    expect(bodyOf(fetchMock, 1).messages[3]!.content).toContain('not valid JSON');
  });

  it('gives up after the last attempt', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(() => Promise.resolve(completion('{"n":2}')));
    expect(await createCallObject(ai, fetchMock)(call)).toEqual({
      ok: false,
      error: 'n must be 1',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await createCallObject(ai, fetchMock)({ ...call, attempts: 3 });
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('maps transport failures like a draft and never leaks the key', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{"error":"bad key sk-secret"}', { status: 401 }));
    const err = await createCallObject(
      ai,
      fetchMock
    )(call).then(
      () => null,
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(502);
    expect(JSON.stringify((err as HttpError).body)).not.toContain('sk-secret');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry after a timeout', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new DOMException('timed out', 'TimeoutError'));
    const err = await createCallObject(
      ai,
      fetchMock
    )(call).then(
      () => null,
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).body.error).toBe('ai_timeout');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
