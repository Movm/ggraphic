// SPDX-License-Identifier: AGPL-3.0-only
/**
 * One page state with at least one element of every kind the recorder has to cover, for the
 * replay differential. It is a page state as `buildPptxModel` reads it (`pages[i].state`), for the
 * `fixture-poster` template: the template draws the colour plane, the ornament and three text
 * lines, everything else comes from the collections.
 *
 * Meant to be laid out on 1080×1350. A filtered photo ('filtered', only with `filtered: true`) is a
 * raster island by design: the replay does not draw one until `resolveScene` has made its pixels,
 * so the page that is compared pixel by pixel does not have it. The editor has no even-odd fill
 * to put in a page state; the differential adds one on its own stage.
 */
import { createCircleBadgeInstance } from '../../../utils/circleBadgeUtils.js';
import { createFrameInstance } from '../../../utils/framePresets.js';
import { createPillBadgeInstance } from '../../../utils/pillBadgeUtils.js';
import { createChartInstance } from '../../../utils/chartUtils.js';

import type { AdditionalText } from '../../../configs/types.js';
import type { ShapeInstance } from '../../../utils/shapes.js';
import type { UserImageInstance } from '../../../utils/userImageUtils.js';

/** A catalogue sticker: an instance src the fixture assets treat as pixel-hit-tested (see `FIXTURE_INSTANCE_SRC_PREFIX`). */
export const STICKER_SRC = 'https://example.org/share/sticker.png';

export interface AllElementsPageOptions {
  /** A small PNG data URL used for every photo. */
  photo: string;
  /** Adds a photo with brightness and blur, which Konva filters: a raster island. */
  filtered?: boolean;
}

const shape = (
  extra: Partial<ShapeInstance> & Pick<ShapeInstance, 'id' | 'type'>
): ShapeInstance => ({
  x: 0,
  y: 0,
  width: 120,
  height: 120,
  fill: '#f4c430',
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  ...extra,
});

export function allElementsPage({
  photo,
  filtered = false,
}: AllElementsPageOptions): Record<string, unknown> {
  const shapeInstances: ShapeInstance[] = [
    shape({
      id: 'rounded',
      type: 'rounded-rect',
      x: 40,
      y: 40,
      width: 360,
      height: 120,
      cornerRadius: 40,
    }),
    shape({ id: 'circle', type: 'circle', x: 440, y: 40, fill: '#e2574c' }),
    shape({ id: 'star', type: 'star', x: 600, y: 40, fill: '#7ec8e3' }),
    shape({ id: 'heart', type: 'heart', x: 760, y: 40, width: 140, fill: '#ff6f91', flipX: true }),
    // A hand-drawn shape has a (clear) stroke besides its fill, so opacity and a shadow make
    // Konva draw it into a buffer first: a `group` op.
    shape({
      id: 'buffered',
      type: 'hand-kreis',
      x: 880,
      y: 420,
      width: 160,
      height: 120,
      fill: '#ffb703',
      opacity: 0.6,
      shadowColor: '#000000',
      shadowBlur: 10,
      shadowOffsetX: 6,
      shadowOffsetY: 8,
      shadowOpacity: 0.8,
    }),
    shape({ id: 'glow', type: 'ellipse', x: 520, y: 380, width: 300, height: 160, glow: true }),
    shape({
      id: 'gradient',
      type: 'rect',
      x: 40,
      y: 700,
      width: 300,
      height: 160,
      fillGradient: {
        type: 'linear',
        angle: 45,
        stops: [
          { offset: 0, color: '#2d6a4f' },
          { offset: 1, color: '#d8f3dc' },
        ],
      },
    }),
    shape({
      id: 'shadow',
      type: 'rect',
      x: 390,
      y: 700,
      width: 260,
      height: 160,
      fill: '#ffffff',
      shadowColor: '#000000',
      shadowBlur: 24,
      shadowOffsetX: 14,
      shadowOffsetY: 18,
      shadowOpacity: 0.6,
    }),
    // The hole of a ring is a circle drawn against the direction of the outer one
    // (`arc(0, 2π, true)`): a recorder that reads that span as nothing paints a disc.
    shape({ id: 'ring', type: 'ring', x: 40, y: 220, width: 160, height: 160, ringWidth: 36 }),
    shape({
      id: 'ring-share',
      type: 'ring',
      x: 230,
      y: 220,
      width: 160,
      height: 160,
      ringWidth: 36,
      arc: 0.27,
      fill: '#e2574c',
    }),
    // A dashed stroke: the dash pattern has to reach the recorded path.
    shape({
      id: 'dashed',
      type: 'line-dashed',
      x: 440,
      y: 240,
      width: 360,
      height: 24,
      fill: '#ffffff',
      strokeWidth: 8,
      dash: [22, 14],
    }),
    shape({
      id: 'grain',
      type: 'rect',
      x: 700,
      y: 700,
      width: 300,
      height: 160,
      fill: '#4361ee',
      grain: 0.5,
    }),
  ];

  const additionalTexts: AdditionalText[] = [
    {
      id: 'rich',
      text: 'Das ++Marker++ und ==Akzent== Wort',
      type: 'body',
      x: 70,
      y: 900,
      width: 560,
      fontSize: 48,
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
      fill: '#ffffff',
      letterSpacing: 0.1,
      rotation: 12,
      marker: { fill: '#ffe066', color: '#111111' },
      accent: { fill: '#ff9f1c', fontStyle: 'italic' },
    },
    {
      id: 'outlined',
      text: 'Umriss',
      type: 'header',
      x: 40,
      y: 1230,
      width: 480,
      fontSize: 96,
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
      fill: '#ffffff',
      stroke: '#111111',
      strokeWidth: 6,
      // Fill and stroke under one opacity: a buffered text.
      opacity: 0.8,
    },
  ];

  const userImageInstances: UserImageInstance[] = [
    {
      id: 'cropped',
      src: photo,
      fileName: 'cropped.png',
      x: 560,
      y: 1010,
      width: 200,
      height: 150,
      rotation: 0,
      scale: 1,
      opacity: 1,
      fit: 'cover',
      cropZoom: 1.5,
      panX: 0.4,
      panY: -0.2,
    },
    {
      id: 'notched',
      src: photo,
      fileName: 'notched.png',
      x: 790,
      y: 1010,
      width: 240,
      height: 150,
      rotation: 0,
      scale: 1,
      opacity: 1,
      fit: 'cover',
      notch: 0.08,
    },
    // Konva caches the node and filters the cache: brightness and blur at once.
    ...(filtered
      ? [
          {
            id: 'filtered',
            src: photo,
            fileName: 'filtered.png',
            x: 300,
            y: 580,
            width: 200,
            height: 140,
            rotation: 0,
            scale: 1,
            opacity: 1,
            fit: 'cover' as const,
            brightness: 0.25,
            blur: 3,
          },
        ]
      : []),
  ];

  const frame = createFrameInstance('circle', 780, 900);
  const chart = createChartInstance('bar', 1080, 1350);

  return {
    backgroundColor: '#1b4332',
    line1: 'Klimaschutz',
    line2: 'Gemeinsam handeln',
    line3: 'Zukunft sichern',
    ornamentPos: { x: 860, y: 190 },
    shapeInstances,
    additionalTexts,
    pillBadgeInstances: [{ ...createPillBadgeInstance('slider'), id: 'pill', x: 40, y: 560 }],
    circleBadgeInstances: [
      {
        ...createCircleBadgeInstance('default'),
        id: 'circle-badge',
        x: 940,
        y: 620,
        radius: 70,
        opacity: 0.6,
      },
    ],
    frameInstances: [
      { ...frame, id: 'frame', x: 780, y: 900, width: 200, height: 200, imageSrc: photo },
    ],
    userImageInstances,
    chartInstances: [{ ...chart, id: 'chart', x: 40, y: 1020, width: 360, height: 190 }],
    selectedIcons: ['tabler:heart'],
    iconStates: { 'tabler:heart': { x: 480, y: 1110, scale: 1, rotation: 15, color: '#ffffff' } },
    illustrationInstances: [
      {
        id: 'illustration',
        source: 'kawaii',
        illustrationId: 'cat',
        mood: 'happy',
        color: '#ffc8dd',
        x: 940,
        y: 1260,
        scale: 1,
        rotation: 0,
        opacity: 1,
      },
    ],
    assetInstances: [
      {
        id: 'asset',
        assetId: 'asset:sticker',
        src: STICKER_SRC,
        x: 640,
        y: 1260,
        scale: 1,
        rotation: 10,
        opacity: 1,
      },
    ],
  };
}
