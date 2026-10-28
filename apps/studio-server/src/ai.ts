// SPDX-License-Identifier: AGPL-3.0-only
// Text drafts through any OpenAI-compatible chat completions endpoint (Mistral, LiteLLM, Ollama ...).
import type { CallObject, ObjectCall } from '@ggraphic/ai';
import { z } from 'zod';
import type { AiConfig } from './config.ts';
import { type Draft, type DraftBody, draftSchema } from './contract.ts';
import { HttpError } from './http.ts';

const SYSTEM_PROMPT = [
  'You write short texts for a graphic (social media post, poster, flyer).',
  'Answer only with a JSON object with these keys:',
  '"headline" (short, catchy, at most about 8 words),',
  '"subline" (one sentence that supports the headline),',
  '"body" (optional, at most three short sentences),',
  '"callToAction" (optional, a few words).',
  'Write in the language of the briefing. No hashtags, no emojis, no markdown.',
].join(' ');

const completionSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })).min(1),
});

function userPrompt(input: DraftBody): string {
  const lines = [`Briefing: ${input.briefing}`];
  if (input.format) lines.push(`Format: ${input.format}`);
  if (input.width && input.height) lines.push(`Size: ${input.width}x${input.height} px`);
  return lines.join('\n');
}

/** The JSON in a model answer, or undefined. Tolerates code fences that some models add anyway. */
function parseJsonAnswer(content: string): unknown {
  const unfenced = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    return JSON.parse(unfenced);
  } catch {
    return undefined;
  }
}

/** Extracts the draft from a model answer. */
export function parseDraft(content: string): Draft | null {
  const json = parseJsonAnswer(content);
  if (json === undefined) return null;
  const result = draftSchema.safeParse(json);
  return result.success ? result.data : null;
}

const upstreamError = (message: string) =>
  new HttpError(502, { error: 'ai_upstream_error', message });

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** One chat completion in JSON mode; the answer's text, or null when it has none. */
async function complete(
  ai: AiConfig,
  messages: readonly ChatMessage[],
  fetchImpl: typeof fetch
): Promise<string | null> {
  let response: Response;
  try {
    response = await fetchImpl(`${ai.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${ai.apiKey}` },
      body: JSON.stringify({
        model: ai.model,
        messages,
        response_format: { type: 'json_object' },
        temperature: 0.7,
      }),
      signal: AbortSignal.timeout(ai.timeoutMs),
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === 'TimeoutError';
    // Log the cause class only: request details carry the Authorization header.
    console.warn(`AI request failed: ${timedOut ? 'timeout' : (error as Error).name}`);
    throw new HttpError(502, {
      error: timedOut ? 'ai_timeout' : 'ai_upstream_error',
      message: timedOut
        ? 'The AI provider did not answer in time.'
        : 'The AI provider is not reachable.',
    });
  }

  if (!response.ok) {
    console.warn(`AI provider answered HTTP ${response.status}`);
    throw upstreamError(`The AI provider answered with HTTP ${response.status}.`);
  }

  const completion = completionSchema.safeParse(await response.json().catch(() => null));
  return completion.success ? (completion.data.choices[0]?.message.content ?? null) : null;
}

export async function createDraft(
  ai: AiConfig,
  input: DraftBody,
  fetchImpl: typeof fetch = fetch
): Promise<Draft> {
  const content = await complete(
    ai,
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt(input) },
    ],
    fetchImpl
  );
  const draft = content ? parseDraft(content) : null;
  if (!draft) throw upstreamError('The AI provider returned an unusable answer.');
  return draft;
}

const DEFAULT_ATTEMPTS = 2;

/**
 * The `CallObject` @ggraphic/ai asks for, over the same endpoint. A first answer that is
 * no JSON or fails the call's validator is quoted back for another try. A transport
 * failure throws like `createDraft`; only a model that never gets it right is `ok: false`.
 */
export function createCallObject(ai: AiConfig, fetchImpl: typeof fetch = fetch): CallObject {
  return async <T>(call: ObjectCall<T>) => {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `${call.system}\n\nJSON schema of the answer:\n${JSON.stringify(call.schema)}`,
      },
      { role: 'user', content: call.prompt },
    ];
    const attempts = Math.max(1, call.attempts ?? DEFAULT_ATTEMPTS);
    let error = 'The AI provider returned an unusable answer.';
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const content = await complete(ai, messages, fetchImpl);
      const json = content ? parseJsonAnswer(content) : undefined;
      if (json !== undefined) {
        const result = call.validate(json);
        if (result.ok) return { ok: true, data: result.value };
        error = result.error;
      } else {
        error = 'The answer is not valid JSON.';
      }
      messages.push(
        { role: 'assistant', content: content ?? '' },
        {
          role: 'user',
          content: `Your answer was invalid: ${error.replace(/\.+$/, '')}. Answer again with the corrected JSON object only.`,
        }
      );
    }
    return { ok: false, error };
  };
}
