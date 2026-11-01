// SPDX-License-Identifier: MPL-2.0
/**
 * Two text devices: a struck-through text (`strikethrough`) and a text that counts the page
 * (`counter: 'page'`).
 */
import { render } from '@testing-library/react';
import Konva from 'konva';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';

import { renderKindItem, type RenderCtx } from '@ggraphic/editor/components/kindRenderers';
import { CanvasStage, type CanvasStageRef } from '@ggraphic/editor/primitives/CanvasStage';
import { CanvasText } from '@ggraphic/editor/primitives/CanvasText';

import type { AdditionalText } from '@ggraphic/editor/configs/types';

function stageOf(node: React.ReactNode): Konva.Stage {
  Konva.autoDrawEnabled = false;
  const stageRef = createRef<CanvasStageRef>();
  render(
    <CanvasStage ref={stageRef} width={600} height={600}>
      {node}
    </CanvasStage>
  );
  return stageRef.current!.getStage()!;
}
const texts = (stage: Konva.Stage) => stage.find('Text') as Konva.Text[];

describe('strikethrough', () => {
  const props = { id: 't', x: 10, y: 10, width: 500, fontSize: 24, fill: '#000000' };

  it('draws a plain text with a line through it', () => {
    const [node] = texts(stageOf(<CanvasText {...props} text="Mythos" strikethrough />));
    expect(node!.textDecoration()).toBe('line-through');
  });

  it('draws no decoration without it', () => {
    const [node] = texts(stageOf(<CanvasText {...props} text="Mythos" />));
    expect(node!.textDecoration()).toBe('');
  });

  it('strikes every run of a rich text and keeps an underline', () => {
    const nodes = texts(
      stageOf(<CanvasText {...props} text="Ein ==Mythos== und <u>mehr</u>" strikethrough />)
    );
    expect(nodes.length).toBeGreaterThan(1);
    const mehr = nodes.find((n) => n.text().includes('mehr'))!;
    expect(mehr.textDecoration()).toBe('underline line-through');
    for (const n of nodes.filter((n) => !n.text().includes('mehr'))) {
      expect(n.textDecoration()).toBe('line-through');
    }
  });
});

describe('page counter', () => {
  const item = (over: Partial<AdditionalText> = {}) => ({
    type: 'additional-text' as const,
    id: 'ghost',
    zIndex: 0,
    data: {
      id: 'ghost',
      text: '5',
      type: 'body',
      x: 0,
      y: 0,
      width: 400,
      fontSize: 200,
      fontFamily: 'Arial',
      fill: '#000000',
      counter: 'page',
      ...over,
    } as AdditionalText,
  });
  const ctx = (pageNumber?: number) =>
    ({
      state: {},
      handlers: { actions: {} },
      getSnapTargets: () => [],
      registerGeometry: () => {},
      handleSnapChange: () => {},
      setSnapLines: () => {},
      stageWidth: 600,
      stageHeight: 600,
      croppingElement: null,
      setCroppingElement: () => {},
      cropAspect: 'free',
      ...(pageNumber === undefined ? {} : { pageNumber }),
    }) as unknown as RenderCtx;
  const shown = (node: React.ReactNode) => texts(stageOf(node))[0]!.text();

  it('shows the number of its page', () => {
    expect(shown(renderKindItem(item() as never, ctx(3)))).toBe('3');
    expect(shown(renderKindItem(item() as never, ctx(10)))).toBe('10');
  });

  it('shows its stored text where no page is known', () => {
    expect(shown(renderKindItem(item() as never, ctx()))).toBe('5');
  });

  it('shows the stored text of an ordinary text whatever the page', () => {
    expect(shown(renderKindItem(item({ counter: undefined }) as never, ctx(3)))).toBe('5');
  });
});
