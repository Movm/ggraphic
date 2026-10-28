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
  let response: Response;
  try {
    response = await fetchImpl(`${rembg.url}/api/remove`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(rembg.timeoutMs),
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === 'TimeoutError';
    console.warn(`rembg request failed: ${timedOut ? 'timeout' : (error as Error).name}`);
    if (timedOut) {
      throw new HttpError(504, {
        error: 'rembg_timeout',
        message: 'The background removal service did not answer in time.',
      });
    }
    throw upstreamError();
  }
  if (!response.ok) {
    console.warn(`rembg answered HTTP ${response.status}`);
    throw upstreamError();
  }
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > maxResponseBytes) throw upstreamError();
  const body = Buffer.from(await response.arrayBuffer().catch(() => new ArrayBuffer(0)));
  if (body.length > maxResponseBytes || !isPng(body)) {
    console.warn('rembg answered no usable PNG');
    throw upstreamError();
  }
  return body;
}
