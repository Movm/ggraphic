// SPDX-License-Identifier: AGPL-3.0-only
/**
 * `toDataURLAsync` soll dasselbe Bild liefern wie `toDataURL`, nur ohne den
 * PNG-Encode auf dem Hauptthread. Gefährlich daran ist nicht der Encode,
 * sondern die Ansicht davor: Exportbereich, ausgeblendete Auswahlrahmen und
 * deren Wiederherstellung laufen synchron, das Ergebnis aber erst später —
 * wer die Reihenfolge verdreht, backt den Transformer ins Bild oder lässt ihn
 * verschwunden zurück.
 *
 * jsdom rastert nicht; die Brücken (Größe, drawImage, toDataURL) und der
 * `toBlob`-Stub, die einen Export im dom-Lauf möglich machen, stehen in
 * `testing/napiStageBridge.ts`. Geprüft wird also die Verdrahtung (Ansicht,
 * Bereich, Wiederherstellung, Blob → FileReader), nicht der echte
 * asynchrone Encoder des Browsers.
 */
import { render } from '@testing-library/react';
import Konva from 'konva';
import { createRef } from 'react';
import { Rect } from 'react-konva';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { napi, installNapiStageBridge } from '../../testing/napiStageBridge.js';
import { captureStageImageAsync } from '../../utils/captureStage.js';
import { CanvasStage, type CanvasStageRef } from '../CanvasStage.js';

let restoreBridge: () => void;

beforeAll(() => {
  restoreBridge = installNapiStageBridge();
});

afterAll(() => {
  restoreBridge();
});

const W = 120;
const H = 90;

function mountStageWithSelection() {
  const stageRef = createRef<CanvasStageRef>();
  render(
    <CanvasStage ref={stageRef} width={W} height={H} responsive={false}>
      <Rect name="canvas-background" x={0} y={0} width={W} height={H} fill="#F6F4EF" />
      <Rect id="motiv" x={20} y={15} width={50} height={40} fill="#1D3557" />
      <Rect x={75} y={50} width={30} height={25} fill="#e6007e" />
    </CanvasStage>
  );
  const stage = stageRef.current!.getStage()!;
  const layer = stage.getLayers()[0]!;
  const selected = stage.findOne<Konva.Rect>('#motiv')!;
  const transformer = new Konva.Transformer({ nodes: [selected], anchorFill: '#ff0000' });
  const chrome = new Konva.Rect({
    name: 'selection-chrome',
    x: 18,
    y: 13,
    width: 54,
    height: 44,
    stroke: '#0000ff',
    strokeWidth: 2,
    dash: [4, 4],
  });
  layer.add(transformer, chrome);
  return { stageRef, stage, transformer, chrome };
}

async function pixelsOf(dataUrl: string) {
  const image = await napi.loadImage(dataUrl);
  const canvas = napi.createCanvas(image.width, image.height);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  return {
    width: image.width,
    height: image.height,
    data: context.getImageData(0, 0, image.width, image.height).data,
  };
}

describe('CanvasStage.toDataURLAsync', () => {
  it('liefert pixelgenau dasselbe Bild wie der synchrone Export', async () => {
    const { stageRef, stage } = mountStageWithSelection();

    const sync = stageRef.current!.toDataURL({ pixelRatio: 1 })!;
    const async = await stageRef.current!.toDataURLAsync({ pixelRatio: 1 });

    expect(async).toMatch(/^data:image\/png;base64,/);
    const a = await pixelsOf(sync);
    const b = await pixelsOf(async!);
    expect([b.width, b.height]).toEqual([W, H]);
    expect([a.width, a.height]).toEqual([b.width, b.height]);
    expect(Buffer.from(b.data).equals(Buffer.from(a.data))).toBe(true);

    // Gegenprobe, damit „identisch" nicht „beide leer" heißt: das Motiv ist
    // im Bild, und mit sichtbarem Auswahlrahmen sähe es anders aus.
    const motiv = (20 + 25 + (15 + 20) * W) * 4;
    expect([...b.data.slice(motiv, motiv + 4)]).toEqual([0x1d, 0x35, 0x57, 255]);
    const scale = stageRef.current!.getDisplayScale();
    const withChrome = await pixelsOf(
      stage.toDataURL({ x: 0, y: 0, width: W * scale, height: H * scale, pixelRatio: 1 / scale })
    );
    expect(Buffer.from(withChrome.data).equals(Buffer.from(b.data))).toBe(false);
  });

  it('blendet Transformer und Auswahlrahmen nur für das Rendern aus', async () => {
    const { stageRef, stage, transformer, chrome } = mountStageWithSelection();
    const seen: Array<{ transformer: boolean; chrome: boolean }> = [];
    const toCanvas = stage.toCanvas.bind(stage);
    const spy = vi.spyOn(stage, 'toCanvas').mockImplementation((config) => {
      seen.push({ transformer: transformer.visible(), chrome: chrome.visible() });
      return toCanvas(config);
    });

    const pending = stageRef.current!.toDataURLAsync({ pixelRatio: 1 });
    // Wiederhergestellt ist schon vor dem Encode, nicht erst danach.
    expect(transformer.visible()).toBe(true);
    expect(chrome.visible()).toBe(true);
    await expect(pending).resolves.toMatch(/^data:image\/png;base64,/);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([{ transformer: false, chrome: false }]);
    expect(transformer.visible()).toBe(true);
    expect(chrome.visible()).toBe(true);
  });
});

describe('captureStageImageAsync', () => {
  it('liefert null ohne Bühne', async () => {
    await expect(captureStageImageAsync(null)).resolves.toBeNull();
  });

  it('liefert null, wenn der asynchrone Export scheitert', async () => {
    const stageApi = {
      toDataURLAsync: () => Promise.reject(new Error('encode kaputt')),
    } as unknown as CanvasStageRef;
    await expect(captureStageImageAsync(stageApi)).resolves.toBeNull();
  });

  it('exportiert standardmäßig als PNG mit pixelRatio 2', async () => {
    const toDataURLAsync = vi.fn(() => Promise.resolve('blob:fixture-image'));
    const stageApi = { toDataURLAsync } as unknown as CanvasStageRef;
    await expect(captureStageImageAsync(stageApi)).resolves.toBe('blob:fixture-image');
    expect(toDataURLAsync).toHaveBeenCalledWith({ format: 'png', pixelRatio: 2 });
  });
});
