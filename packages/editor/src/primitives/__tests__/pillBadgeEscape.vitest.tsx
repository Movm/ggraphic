// SPDX-License-Identifier: MPL-2.0
/**
 * Escape ends a pill-badge edit the way it ends a text edit: the typed text is kept (#163).
 * Before, Escape reset the field and the edit was lost, while the rich-text editor committed.
 */
import { act, cleanup, render } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CanvasStage, type CanvasStageRef } from '../CanvasStage.js';
import { PillBadge } from '../PillBadge.js';

afterEach(() => {
  cleanup();
  document.body.querySelectorAll('textarea').forEach((el) => el.remove());
});

function editBadge(onTextChange: (text: string) => void) {
  const stageRef = createRef<CanvasStageRef>();
  render(
    <CanvasStage ref={stageRef} width={600} height={600} responsive={false}>
      <PillBadge
        id="p"
        text="Mehr Raum"
        x={50}
        y={70}
        backgroundColor="#0f0"
        textColor="#000"
        fontSize={24}
        fontFamily="Arial"
        fontStyle="normal"
        rotation={0}
        scale={1}
        paddingX={10}
        paddingY={6}
        cornerRadius={8}
        selected={false}
        onSelect={() => {}}
        onTextChange={onTextChange}
        onDragEnd={() => {}}
        onTransformEnd={() => {}}
        onSnapChange={() => {}}
        onSnapLinesChange={() => {}}
        getSnapTargets={() => []}
        stageWidth={600}
        stageHeight={600}
      />
    </CanvasStage>
  );
  act(() => {
    stageRef.current!.getStage()!.findOne('Group')!.fire('dblclick');
  });
  const textarea = document.body.querySelector('textarea')!;
  textarea.value = 'Viel Raum';
  return textarea;
}

describe('pill badge editing (#163)', () => {
  it.each(['Escape', 'Enter'])('%s keeps the typed text', (key) => {
    const onTextChange = vi.fn();
    const textarea = editBadge(onTextChange);
    act(() => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    });
    expect(onTextChange).toHaveBeenCalledWith('Viel Raum');
    expect(document.body.querySelector('textarea')).toBeNull();
  });
});
