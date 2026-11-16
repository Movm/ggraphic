// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Im Ausschnitt-Modus setzt das Ziehen den Ausschnitt direkt am Knoten. Ein Render mit
 * unveränderten Props (Hilfslinien, Auswahl) darf ihn nicht mit dem alten überschreiben —
 * sonst springt das Foto beim Loslassen für einen Frame zurück.
 */
import { createCanvas } from '@napi-rs/canvas';
import { act, render } from '@testing-library/react';
import Konva from 'konva';
import { createRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CanvasImage } from '../CanvasImage.js';
import { CanvasStage, type CanvasStageRef } from '../CanvasStage.js';

beforeEach(() => {
  vi.spyOn(Konva.Image.prototype, 'cache').mockReturnThis();
});

describe('CanvasImage cover-fit crop', () => {
  it('keeps a crop set on the node through a re-render with the same props', () => {
    const stageRef = createRef<CanvasStageRef>();
    const image = Object.assign(createCanvas(600, 400), {
      naturalWidth: 600,
      naturalHeight: 400,
    }) as unknown as HTMLImageElement;
    const ui = (opacity: number) => (
      <CanvasStage ref={stageRef} width={300} height={300} responsive={false}>
        <CanvasImage
          id="background-image"
          image={image}
          x={0}
          y={0}
          width={300}
          height={300}
          coverFit
          cropping
          selected
          opacity={opacity}
          stageWidth={300}
          stageHeight={300}
          constrainToBounds={false}
          snapToCenter={false}
          onSelect={() => {}}
        />
      </CanvasStage>
    );
    const view = render(ui(1));
    const node = stageRef.current!.getStage()!.findOne('#background-image') as Konva.Image;
    const committed = node.crop();
    const panned = { ...committed, x: committed.x + 50 };
    act(() => {
      node.crop(panned);
    });
    // Another prop changes, the crop's inputs do not: the panned crop must stay.
    view.rerender(ui(0.99));
    expect(node.crop()).toEqual(panned);
  });
});
