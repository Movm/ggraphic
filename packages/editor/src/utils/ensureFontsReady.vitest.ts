// SPDX-License-Identifier: MPL-2.0
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ensureFontsReady } from './ensureFontsReady.js';

const never = () => new Promise<never>(() => undefined);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('ensureFontsReady', () => {
  it('waits for the faces that load', async () => {
    const load = vi.fn(() => Promise.resolve());
    vi.stubGlobal('document', { fonts: Object.assign([{ load }], { ready: Promise.resolve() }) });
    await ensureFontsReady();
    expect(load).toHaveBeenCalledOnce();
  });

  // A WKWebView (Expo DOM component) leaves a face whose file it cannot fetch pending for good.
  it('gives up on a face that never settles, so an export does not hang', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('document', {
      fonts: Object.assign([{ load: never }], { ready: never() }),
    });
    const done = vi.fn();
    void ensureFontsReady().then(done);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(done).toHaveBeenCalledOnce();
  });
});
