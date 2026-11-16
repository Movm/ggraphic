// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Ausschnitt-Modus: Konva feuert `dragmove` auch, wenn der Zeiger stillsteht, und setzt den
 * Knoten dann nicht neu. Der Pan darf daraus keinen Versatz 0 lesen — sonst springt das Foto
 * bei jeder Pause der Maus auf den Ausschnitt vom Beginn des Ziehens zurück.
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

describe('CanvasImage cover-fit pan', () => {
  it('keeps the pan when the pointer rests', () => {
    const stageRef = createRef<CanvasStageRef>();
    // Portrait photo in a square slot: room to pan vertically.
    const image = Object.assign(createCanvas(400, 800), {
      naturalWidth: 400,
      naturalHeight: 800,
    }) as unknown as HTMLImageElement;
    render(
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
          stageWidth={300}
          stageHeight={300}
          constrainToBounds={false}
          snapToCenter={false}
          onSelect={() => {}}
          onDragEnd={() => {}}
        />
      </CanvasStage>
    );
    const stage = stageRef.current!.getStage()!;
    act(() => {
      stage.draw();
    });
    const node = stage.findOne('#background-image') as Konva.Image;
    const fire = (target: EventTarget, type: string, y: number) =>
      target.dispatchEvent(
        new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 150, clientY: y })
      );
    const start = node.crop().y;
    act(() => {
      stage.setPointersPositions(new MouseEvent('mousedown', { clientX: 150, clientY: 150 }));
      node.startDrag();
      fire(window, 'mousemove', 140);
      fire(window, 'mousemove', 100);
    });
    const panned = node.crop().y;
    expect(panned).not.toBe(start);
    // The pointer rests: another move to the same point.
    act(() => {
      fire(window, 'mousemove', 100);
    });
    expect(node.crop().y).toBe(panned);
    act(() => {
      fire(window, 'mouseup', 100);
    });
  });
});
