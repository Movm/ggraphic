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

  it('waits as long as the fonts take when no timeout is given', async () => {
    vi.useFakeTimers();
    const slow = () => new Promise<void>((resolve) => setTimeout(resolve, 10_000));
    vi.stubGlobal('document', { fonts: Object.assign([{ load: slow }], { ready: slow() }) });
    const done = vi.fn();
    void ensureFontsReady().then(done);
    await vi.advanceTimersByTimeAsync(9_000);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(done).toHaveBeenCalledOnce();
  });

  // A WKWebView (Expo DOM component) leaves a face whose file it cannot fetch pending for good.
  it('gives up after timeoutMs on a face that never settles', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('document', {
      fonts: Object.assign([{ load: never }], { ready: never() }),
    });
    const done = vi.fn();
    void ensureFontsReady({ timeoutMs: 3_000 }).then(done);
    await vi.advanceTimersByTimeAsync(2_999);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toHaveBeenCalledOnce();
  });
});
