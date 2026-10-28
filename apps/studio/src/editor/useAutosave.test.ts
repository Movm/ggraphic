// SPDX-License-Identifier: AGPL-3.0-only
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api, ApiError } from '../api/client';

import { newDocument, type StudioDocument } from './document';
import { useAutosave } from './useAutosave';

vi.mock('../api/client', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    api: { updateProject: vi.fn(), putThumbnail: vi.fn(), getProject: vi.fn() },
  };
});

const mocked = vi.mocked(api, true);

const doc = (mark: string): StudioDocument => {
  const d = newDocument('post-portrait');
  return { ...d, pages: [{ ...d.pages[0]!, state: { ...d.pages[0]!.state, mark } }] };
};

/** Polls (1 s) plus the settle delay (1.5 s). */
const settle = async () => {
  for (let i = 0; i < 4; i++) await act(() => vi.advanceTimersByTimeAsync(1000));
};

function setup(opened: string, baseline?: string) {
  let current = doc(opened);
  const exportApi = { current: { getPages: () => current.pages } } as never;
  const hook = renderHook(() =>
    useAutosave({
      projectId: 'p1',
      base: current,
      ...(baseline ? { baseline: doc(baseline) } : {}),
      initialVersion: 1,
      exportApi,
      thumbnailMaxBytes: 1e6,
      hasThumbnail: true,
    })
  );
  return { hook, set: (mark: string) => (current = doc(mark)) };
}

const markOf = (call: unknown) =>
  (call as { document: { pages: { state: { mark: string } }[] } }).document.pages[0]!.state.mark;

beforeEach(() => {
  vi.useFakeTimers();
  let version = 1;
  mocked.updateProject.mockImplementation(() => Promise.resolve({ version: ++version } as never));
});
afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe.each([
  ['without a rebind baseline', undefined],
  ['with a rebind baseline', 'stored'],
])('undo back to the opened state, %s', (_name, baseline) => {
  it('is stored every time, and never reads as saved while it is not', async () => {
    const { hook, set } = setup('opened', baseline);
    await settle();
    const stored = () => mocked.updateProject.mock.calls.map((c) => markOf(c[1]));

    // Edit, undo, edit, undo: the last state must reach the server.
    set('edit');
    await settle();
    set('opened');
    await settle();
    set('edit');
    await settle();
    set('opened');
    await settle();

    expect(stored().at(-1)).toBe('opened');
    expect(hook.result.current.status).toBe('saved');
    expect(hook.result.current.hasUnsaved()).toBe(false);
  });

  it('counts the undone state as unsaved until it is stored', async () => {
    const { hook, set } = setup('opened', baseline);
    await settle();
    set('edit');
    await settle();
    mocked.updateProject.mockRejectedValue(new ApiError(500, 'internal', 'x'));
    set('opened');
    await settle();
    expect(hook.result.current.hasUnsaved()).toBe(true);
  });
});

describe('the opening rebind', () => {
  it('is stored once, silently', async () => {
    const { hook } = setup('rebound', 'stored');
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(hook.result.current.status).toBe('saved');
    expect(hook.result.current.hasUnsaved()).toBe(false);
    await settle();
    expect(mocked.updateProject).toHaveBeenCalledTimes(1);
    expect(markOf(mocked.updateProject.mock.calls[0]![1])).toBe('rebound');
  });

  it('retries a failed silent save and shows the normal status', async () => {
    mocked.updateProject.mockRejectedValueOnce(new ApiError(500, 'internal', 'x'));
    const { hook } = setup('rebound', 'stored');
    await act(() => vi.advanceTimersByTimeAsync(1100));
    expect(hook.result.current.status).toBe('error');
    await settle();
    expect(mocked.updateProject.mock.calls.length).toBeGreaterThan(1);
    expect(hook.result.current.status).toBe('saved');
  });
});
