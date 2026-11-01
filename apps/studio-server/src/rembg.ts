// SPDX-License-Identifier: AGPL-3.0-only
// Background removal through a rembg HTTP server (`rembg s`): POST /api/remove, PNG back.
import type { RembgConfig } from './config.ts';
import { HttpError } from './http.ts';
import { isPng } from './uploads.ts';

const upstreamError = () =>
  new HttpError(502, {
    error: 'rembg_upstream_error',
    message: 'The background removal service failed.',
  });

/**
 * The cut-out PNG for one image. `rembg.url` is operator config; only the image
 * bytes come from the user. Failures are logged by cause class, never with bodies.
 */
export async function removeBackground(
  rembg: RembgConfig,
  image: Buffer,
  maxResponseBytes: number,
  fetchImpl: typeof fetch = fetch
): Promise<Buffer> {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(image)]), 'image');
  form.append('model', rembg.model);
  const timeout = (error: unknown) =>
    error instanceof DOMException && error.name === 'TimeoutError';
  const failed = (error: unknown) => {
    // Log the cause class only: URLs and bodies stay out of the log.
    console.warn(`rembg request failed: ${timeout(error) ? 'timeout' : (error as Error).name}`);
    if (timeout(error)) {
      return new HttpError(504, {
        error: 'rembg_timeout',
        message: 'The background removal service did not answer in time.',
      });
    }
    return upstreamError();
  };

  let response: Response;
  try {
    response = await fetchImpl(`${rembg.url}/api/remove`, {
      method: 'POST',
      body: form,
      // A redirect would send the image somewhere the operator did not configure.
      redirect: 'error',
      signal: AbortSignal.timeout(rembg.timeoutMs),
    });
  } catch (error) {
    throw failed(error);
  }
  if (!response.ok) {
    console.warn(`rembg answered HTTP ${response.status}`);
    await response.body?.cancel().catch(() => undefined);
    throw upstreamError();
  }

  // Read the body in chunks and give up at the limit, whatever Content-Length says.
  const reader = response.body?.getReader();
  if (!reader || Number(response.headers.get('content-length') ?? 0) > maxResponseBytes) {
    await reader?.cancel().catch(() => undefined);
    throw upstreamError();
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxResponseBytes) {
        await reader.cancel().catch(() => undefined);
        console.warn('rembg answered more than the allowed size');
        throw upstreamError();
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw failed(error);
  }
  const body = Buffer.concat(chunks);
  if (!isPng(body)) {
    console.warn('rembg answered no usable PNG');
    throw upstreamError();
  }
  return body;
}
