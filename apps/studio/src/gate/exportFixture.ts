// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The synthetic page of stage 3 (`gate.html?fixture=export`): a template page with the pictures
 * the sweep over the templates never has, made in the page so no file is shipped for them:
 *
 *   fx-png      a PNG data URL, which passes through the export unchanged
 *   fx-webp     a WebP data URL, which is re-encoded by the browser (`reencodeImage`)
 *   fx-svg      an uploaded SVG with a `<style>`, which cannot be inlined: an `svg-unsupported` island
 *   fx-shadow   a sample photo fetched by URL, with a drop shadow: an SVG filter, a `shadow` island in a PDF
 */
type Obj = Record<string, unknown>;

/** Where the four pictures sit on a page of at least 1080 × 1350 px: a row near the bottom. */
const FRAME = { width: 230, height: 170, y: 1100, gap: 40, left: 20 };

/** A recognisable picture: a colour ramp with a cross, so a wrong crop or channel order shows. */
function drawing(from: string, to: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 72;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no 2D canvas context');
  const ramp = context.createLinearGradient(0, 0, 96, 72);
  ramp.addColorStop(0, from);
  ramp.addColorStop(1, to);
  context.fillStyle = ramp;
  context.fillRect(0, 0, 96, 72);
  context.strokeStyle = '#ffffff';
  context.lineWidth = 6;
  context.beginPath();
  context.moveTo(0, 0);
  context.lineTo(96, 72);
  context.moveTo(96, 0);
  context.lineTo(0, 72);
  context.stroke();
  return canvas;
}

function webp(): string {
  const url = drawing('#06d6a0', '#118ab2').toDataURL('image/webp', 0.9);
  // A browser that cannot encode WebP answers PNG: the case would silently test the wrong thing.
  if (!url.startsWith('data:image/webp')) throw new Error('this browser cannot encode WebP');
  return url;
}

const SVG_WITH_STYLE =
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150" viewBox="0 0 200 150">' +
  '<style>.sun{fill:#e63946}.sea{fill:#457b9d}</style>' +
  '<rect class="sea" x="0" y="75" width="200" height="75"/>' +
  '<circle class="sun" cx="100" cy="70" r="45"/></svg>';

/** `state` with the four pictures added; `photoUrl` is the picture that gets the shadow. */
export function addExportFixture(state: Obj, photoUrl: string): Obj {
  const sources: { id: string; src: string; extra?: Obj }[] = [
    { id: 'fx-png', src: drawing('#ff7b00', '#7209b7').toDataURL('image/png') },
    { id: 'fx-webp', src: webp() },
    { id: 'fx-svg', src: `data:image/svg+xml,${encodeURIComponent(SVG_WITH_STYLE)}` },
    {
      id: 'fx-shadow',
      src: photoUrl,
      extra: {
        shadowColor: '#000000',
        shadowBlur: 24,
        shadowOffsetX: 14,
        shadowOffsetY: 18,
        shadowOpacity: 0.6,
      },
    },
  ];
  const existing = Array.isArray(state['userImageInstances']) ? state['userImageInstances'] : [];
  return {
    ...state,
    userImageInstances: [
      ...existing,
      ...sources.map(({ id, src, extra }, index) => ({
        id,
        src,
        fileName: `${id}.png`,
        x: FRAME.left + index * (FRAME.width + FRAME.gap),
        y: FRAME.y,
        width: FRAME.width,
        height: FRAME.height,
        rotation: 0,
        scale: 1,
        opacity: 1,
        fit: 'cover',
        ...extra,
      })),
    ],
  };
}
