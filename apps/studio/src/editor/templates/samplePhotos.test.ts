// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { SAMPLE_PHOTOS, type SamplePhoto } from '@ggraphic/templates-open/photos';
import { describe, expect, it } from 'vitest';

import { withSamplePhotos } from './samplePhotos';

const photo = (file: string, role: SamplePhoto['role']): SamplePhoto => ({
  file,
  role,
  src: `/s/${file}`,
  source: 's',
  licence: 'CC0-1.0',
  author: 'a',
});
const SAMPLES = [
  photo('p1.jpg', 'portrait'),
  photo('p2.jpg', 'portrait'),
  photo('c1.jpg', 'crowd'),
  photo('s1.jpg', 'scene'),
  photo('d1.jpg', 'detail'),
];
const img = (id: string, src: string, width = 100, height = 100) => ({
  id,
  src,
  width,
  height,
  scale: 1,
});

describe('withSamplePhotos', () => {
  it('returns the very same state when no slot is empty', () => {
    const state = { userImageInstances: [img('a', 'data:image/png;base64,x')], other: 1 };
    expect(withSamplePhotos(state, SAMPLES)).toBe(state);
  });

  it('keeps untouched instances as the same objects and never rewrites a non-empty src', () => {
    const kept = img('a', 'data:x');
    const state = { userImageInstances: [kept, img('b', '')] };
    const out = withSamplePhotos(state, SAMPLES);
    const list = out['userImageInstances'] as { id: string; src: string }[];
    expect(list[0]).toBe(kept);
    expect(list[1]?.src).not.toBe('');
    expect(state.userImageInstances[1]?.src).toBe('');
  });

  it('picks by slot shape and index, deterministically', () => {
    const state = {
      userImageInstances: [
        img('tall1', '', 100, 200),
        img('tall2', '', 100, 200),
        img('wide', '', 300, 100),
        img('square', '', 100, 100),
      ],
    };
    const srcs = (s: Record<string, unknown>) =>
      (s['userImageInstances'] as { src: string }[]).map((i) => i.src);
    const out = withSamplePhotos(state, SAMPLES);
    expect(srcs(out)).toEqual(['/s/p1.jpg', '/s/p2.jpg', '/s/c1.jpg', '/s/d1.jpg']);
    expect(srcs(withSamplePhotos(state, SAMPLES))).toEqual(srcs(out));
  });
});

describe('withSamplePhotos page coverage', () => {
  const page = { width: 1080, height: 1350 };
  const srcOf = (w: number, h: number) =>
    (
      withSamplePhotos({ userImageInstances: [img('a', '', w, h)] }, SAMPLES, '', page)[
        'userImageInstances'
      ] as { src: string }[]
    )[0]?.src;

  it('gives a tall slot that covers the page a scene, not a portrait', () => {
    expect(srcOf(1080, 1350)).toBe('/s/s1.jpg');
    expect(srcOf(1080, 1500)).toBe('/s/s1.jpg');
  });

  it('gives a framed tall slot (40 % of the width) a portrait', () => {
    expect(srcOf(432, 800)).toBe('/s/p1.jpg');
  });

  it('lets a wide slot that covers the page take a scene as well', () => {
    expect(srcOf(1080, 820)).toBe('/s/s1.jpg');
    expect(srcOf(500, 300)).toBe('/s/c1.jpg');
  });
});

describe('withSamplePhotos variety across templates', () => {
  const srcsFor = (seed: string, slots: [number, number][]) => {
    const state = { userImageInstances: slots.map(([w, h], i) => img(`s${i}`, '', w, h)) };
    const out = withSamplePhotos(state, SAMPLE_PHOTOS, seed);
    return (out['userImageInstances'] as { src: string }[]).map((i) => i.src);
  };
  const ids = Array.from({ length: 24 }, (_, i) => `template-${i}`);

  it('gives templates with a portrait slot different portraits', () => {
    const portraits = new Set(ids.map((id) => srcsFor(id, [[100, 200]])[0]));
    expect(portraits.size).toBeGreaterThanOrEqual(4);
    expect(srcsFor('template-0', [[100, 200]])).not.toEqual(srcsFor('template-1', [[100, 200]]));
  });

  it('gives two slots of one template two different photos', () => {
    for (const id of ids) {
      const [a, b] = srcsFor(id, [
        [100, 200],
        [100, 200],
      ]);
      expect(a).not.toBe(b);
    }
  });

  it('is deterministic for the same template id', () => {
    expect(
      srcsFor('template-7', [
        [100, 200],
        [300, 100],
      ])
    ).toEqual(
      srcsFor('template-7', [
        [100, 200],
        [300, 100],
      ])
    );
  });

  it('only picks photos of a fitting role', () => {
    const portraitSrcs = new Set(
      SAMPLE_PHOTOS.filter((p) => p.role === 'portrait').map((p) => p.src)
    );
    for (const id of ids) expect(portraitSrcs.has(srcsFor(id, [[100, 200]])[0] ?? '')).toBe(true);
  });
});

describe('where sample photos may be built (RF5)', () => {
  const root = join(import.meta.dirname, '../..');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) files.push(p);
    }
  };
  walk(root);

  it('is called only by the preview job and the render gate', () => {
    const users = files
      .filter((f) => readFileSync(f, 'utf8').includes('withSamplePhotos('))
      .map((f) => f.slice(root.length + 1))
      .filter((f) => f !== 'editor/templates/samplePhotos.ts')
      .sort();
    expect(users).toEqual(['editor/templates/previews.tsx', 'gate/main.tsx']);
  });

  it('is never imported by the document store, the exports or the editor page', () => {
    for (const f of files) {
      const rel = f.slice(root.length + 1);
      if (rel === 'editor/templates/previews.tsx' || rel === 'gate/main.tsx') continue;
      const text = readFileSync(f, 'utf8');
      if (rel === 'editor/templates/samplePhotos.ts') continue;
      expect(text, rel).not.toMatch(/samplePhotos|SAMPLE_PHOTOS/);
    }
  });
});
