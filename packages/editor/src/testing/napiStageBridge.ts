// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Lets a mounted Konva stage render and export in the dom test lane.
 *
 * jsdom does not rasterise. `vitest.setup.ts` gives every canvas an `@napi-rs/canvas` 2D context,
 * which is enough for a stage to exist but not for an export: Konva assembles the stage by
 * `drawImage(<jsdom canvas>)`, grows a canvas by `el.width = …` and reads it with
 * `el.toDataURL()`, and none of that reaches the napi canvas behind the jsdom element. This module
 * adds three bridges (size, drawImage, toDataURL) and a `toBlob` stub that builds its Blob from the
 * same canvas's `toDataURL`, which jsdom lacks. What a test checks through it is the wiring, not
 * the real asynchronous encoder of a browser.
 *
 * Test-only: it is not part of the published build (`tsconfig.build.json`).
 */
export const napi = await import('@napi-rs/canvas');

type NapiContext = ReturnType<ReturnType<typeof napi.createCanvas>['getContext']>;

/** Installs the bridges and returns the function that puts the originals back. */
export function installNapiStageBridge(): () => void {
  const napiContexts = new WeakMap<HTMLCanvasElement, NapiContext>();
  const napiContextProto = Object.getPrototypeOf(napi.createCanvas(1, 1).getContext('2d')) as {
    drawImage: (...args: unknown[]) => void;
  };

  const proto = HTMLCanvasElement.prototype;
  const saved = {
    getContext: proto.getContext,
    toDataURL: proto.toDataURL,
    toBlob: proto.toBlob,
    width: Object.getOwnPropertyDescriptor(proto, 'width')!,
    height: Object.getOwnPropertyDescriptor(proto, 'height')!,
    drawImage: napiContextProto.drawImage,
  };

  function bridgeSize(dimension: 'width' | 'height') {
    const original = saved[dimension];
    Object.defineProperty(proto, dimension, {
      configurable: true,
      get: original.get,
      set(this: HTMLCanvasElement, value: number) {
        original.set!.call(this, value);
        // Konva gibt Export-Canvas mit Größe 0 frei; ein napi-Canvas mit 0 Pixeln
        // wirft, und gezeichnet wird darauf ohnehin nicht mehr.
        const context = napiContexts.get(this);
        if (context && value > 0) context.canvas[dimension] = value;
      },
    });
  }

  proto.getContext = function getContext(this: HTMLCanvasElement, id: string, ...rest: unknown[]) {
    const context = (saved.getContext as (...args: unknown[]) => unknown).call(this, id, ...rest);
    if (id === '2d' && context) {
      const napiContext = context as NapiContext;
      if (!napiContexts.has(this)) {
        napiContexts.set(this, napiContext);
        if (this.width > 0) napiContext.canvas.width = this.width;
        if (this.height > 0) napiContext.canvas.height = this.height;
      }
    }
    return context;
  } as HTMLCanvasElement['getContext'];
  bridgeSize('width');
  bridgeSize('height');
  napiContextProto.drawImage = function drawImage(this: unknown, image: unknown, ...args) {
    const source =
      image instanceof HTMLCanvasElement ? (napiContexts.get(image)?.canvas ?? image) : image;
    return saved.drawImage.call(this, source, ...args);
  };
  proto.toDataURL = function toDataURL(this: HTMLCanvasElement, type?: string) {
    const context = napiContexts.get(this) ?? (this.getContext('2d') as unknown as NapiContext);
    return context.canvas.toDataURL((type ?? 'image/png') as 'image/png');
  };
  proto.toBlob = function toBlob(
    this: HTMLCanvasElement,
    callback: BlobCallback,
    type?: string,
    quality?: number
  ) {
    const dataUrl = this.toDataURL(type, quality);
    const bytes = Uint8Array.from(atob(dataUrl.split(',')[1]), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: type ?? 'image/png' });
    setTimeout(() => callback(blob), 0);
  };

  return () => {
    proto.getContext = saved.getContext;
    proto.toDataURL = saved.toDataURL;
    proto.toBlob = saved.toBlob;
    Object.defineProperty(proto, 'width', saved.width);
    Object.defineProperty(proto, 'height', saved.height);
    napiContextProto.drawImage = saved.drawImage;
  };
}
