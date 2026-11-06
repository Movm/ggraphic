// SPDX-License-Identifier: AGPL-3.0-only
// Which image elements an export may inline as they are: the ones editor code made from an SVG it
// generated itself. Each producer marks its element (`trustedSvgImages.ts`); the elements a
// document can write a `src` into (user image, asset) must not be marked.
import { createCanvas } from '@napi-rs/canvas';
import { render, waitFor } from '@testing-library/react';
import Konva from 'konva';
import { createRef, type ReactElement } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { isTrustedSvgImage } from '../../export/scene/trustedSvgImages.js';
import { FIXTURE_ASSET_ID, registerFixtureAssets } from '../../testing/fixtureTemplates';
import { createChartInstance } from '../../utils/chartUtils.js';
import { getCachedSVG, getSVG } from '../../utils/illustrations/svgCache.js';
import { AssetPrimitive } from '../AssetPrimitive.js';
import { CanvasIcons } from '../CanvasIcons.js';
import { CanvasStage } from '../CanvasStage.js';
import { ChartPrimitive } from '../ChartPrimitive.js';
import { IconPrimitive } from '../IconPrimitive.js';
import { IllustrationPrimitive } from '../IllustrationPrimitive.js';
import { UserImagePrimitive } from '../UserImagePrimitive.js';

import type { KawaiiInstance, SvgInstance } from '../../utils/illustrations/types.js';

const SVG_URL = 'data:image/svg+xml;base64,AA==';

const hoisted = vi.hoisted(() => ({ useImageElement: document.createElement('img') }));

vi.mock('../../utils/canvasIcons.js', () => ({
  generateIconDataUrl: vi.fn(() => Promise.resolve('data:image/svg+xml;base64,AA==')),
}));
vi.mock('../../utils/illustrations/registry.js', () => ({
  findIllustrationById: vi.fn(() =>
    Promise.resolve({
      id: 'ill',
      name: 'ill',
      filename: 'ill.svg',
      source: 'opendoodles',
      tags: [],
    })
  ),
  getIllustrationPath: vi.fn(() => 'https://assets.example/ill.svg'),
}));
vi.mock('../../utils/illustrations/svgCache.js', () => ({
  getCachedSVG: vi.fn(() => null),
  getSVG: vi.fn(() => Promise.resolve('data:image/svg+xml;base64,AA==')),
}));
// `useImage` makes its element itself; the test hands out one it can look at.
vi.mock('use-image', () => ({ default: () => [hoisted.useImageElement] }));

/** Every `new window.Image()` a component makes, in order. */
const made: HTMLImageElement[] = [];

beforeAll(() => {
  registerFixtureAssets();
  Konva.autoDrawEnabled = false;
  // The fake image is not drawable on Konva's node canvas; only the producers are under test.
  vi.spyOn(Konva.Image.prototype, 'drawScene').mockImplementation(function (this: Konva.Image) {
    return this;
  });
});

beforeEach(() => {
  made.length = 0;
  vi.spyOn(window, 'Image').mockImplementation(function () {
    const image = Object.assign(createCanvas(10, 10), { naturalWidth: 10, naturalHeight: 10 });
    Object.defineProperty(image, 'src', { set: () => {}, get: () => '' });
    made.push(image as unknown as HTMLImageElement);
    return image as unknown as HTMLImageElement;
  });
});

afterEach(() => {
  vi.mocked(getCachedSVG).mockReset().mockReturnValue(null);
  vi.mocked(getSVG).mockReset().mockResolvedValue(SVG_URL);
});

function mount(ui: ReactElement) {
  return render(
    <CanvasStage ref={createRef()} width={600} height={600} responsive={false}>
      {ui}
    </CanvasStage>
  );
}

const noop = () => {};

/** The images were made, and every one of them is marked. */
async function expectTrusted(count = 1) {
  await waitFor(() => expect(made.length).toBeGreaterThanOrEqual(count), { timeout: 4000 });
  expect(made.map((image) => isTrustedSvgImage(image))).toEqual(made.map(() => true));
}

const svgIllustration: SvgInstance = {
  id: 'il',
  illustrationId: 'ill',
  source: 'opendoodles',
  x: 50,
  y: 50,
  scale: 1,
  rotation: 0,
  color: '#336699',
  opacity: 1,
};

const illustration = (instance: SvgInstance | KawaiiInstance) => (
  <IllustrationPrimitive
    illustration={instance}
    isSelected={false}
    onSelect={noop}
    onDragEnd={noop}
    onTransformEnd={noop}
  />
);

describe('producers mark the images they make from SVG they generated', () => {
  it('ChartPrimitive: the chart', async () => {
    mount(
      <ChartPrimitive
        chart={createChartInstance('bar', 600, 600)}
        isSelected={false}
        onSelect={noop}
        onDragEnd={noop}
        onTransformEnd={noop}
      />
    );
    await expectTrusted();
  });

  it('IconPrimitive: the icon', async () => {
    mount(
      <IconPrimitive
        id="i"
        icon="x"
        x={10}
        y={10}
        scale={1}
        rotation={0}
        selected={false}
        onSelect={noop}
        onDragEnd={noop}
        onTransformEnd={noop}
      />
    );
    await expectTrusted();
  });

  it('IllustrationPrimitive: a Kawaii illustration', async () => {
    mount(
      illustration({
        id: 'k',
        illustrationId: 'cat',
        source: 'kawaii',
        x: 0,
        y: 0,
        scale: 1,
        rotation: 0,
        color: '#336699',
        opacity: 1,
        mood: 'happy',
      })
    );
    await expectTrusted();
  });

  it('IllustrationPrimitive: a catalogue illustration from the cache', async () => {
    vi.mocked(getCachedSVG).mockReturnValue(SVG_URL);
    mount(illustration(svgIllustration));
    await expectTrusted();
    expect(getSVG).not.toHaveBeenCalled();
  });

  it('IllustrationPrimitive: a catalogue illustration fetched and cached', async () => {
    mount(illustration(svgIllustration));
    await expectTrusted();
    expect(getSVG).toHaveBeenCalled();
  });

  it('IllustrationPrimitive: a catalogue illustration loaded by its path', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(getSVG).mockRejectedValue(new Error('offline'));
    mount(illustration(svgIllustration));
    await expectTrusted();
  });

  it('CanvasIcons: the icon its hook loads', async () => {
    mount(
      <CanvasIcons
        selectedIcons={['x']}
        iconPositions={{}}
        onPositionChange={noop}
        onSizeChange={noop}
        selectedElement={null}
        onSelect={noop}
        stageWidth={600}
        stageHeight={600}
      />
    );
    await waitFor(() => expect(isTrustedSvgImage(hoisted.useImageElement)).toBe(true));
  });
});

describe('elements a document writes the src of are not marked', () => {
  // The control for the tests above: a data url that looks like the editor's own, in a field a
  // document controls, is no more trusted than any other url.
  it('UserImagePrimitive', async () => {
    mount(
      <UserImagePrimitive
        userImage={{
          id: 'u',
          src: SVG_URL,
          fileName: '',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          scale: 1,
          rotation: 0,
          opacity: 1,
          fit: 'cover',
        }}
        brandScheme={null}
        isSelected={false}
        onSelect={noop}
        onDragEnd={noop}
        onTransformEnd={noop}
      />
    );
    await waitFor(() => expect(made.length).toBeGreaterThan(0));
    expect(made.map((image) => isTrustedSvgImage(image))).toEqual(made.map(() => false));
  });

  it('AssetPrimitive', async () => {
    mount(
      <AssetPrimitive
        asset={{
          id: 'a',
          assetId: FIXTURE_ASSET_ID,
          x: 10,
          y: 10,
          scale: 1,
          rotation: 0,
          opacity: 1,
        }}
        isSelected={false}
        onSelect={noop}
        onDragEnd={noop}
        onTransformEnd={noop}
      />
    );
    await waitFor(() => expect(made.length).toBeGreaterThan(0));
    expect(made.map((image) => isTrustedSvgImage(image))).toEqual(made.map(() => false));
  });
});
