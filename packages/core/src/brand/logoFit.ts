// SPDX-License-Identifier: MPL-2.0
interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The new logo contained in the old box, in its own proportions. It keeps the
 * corner of the old box nearest to the page corner the box centre is closest to.
 */
export function fitLogoBox(
  box: Box,
  size: { width: number; height: number },
  page: { width: number; height: number }
): Box {
  const scale = Math.min(box.width / size.width, box.height / size.height);
  const width = Math.round(size.width * scale);
  const height = Math.round(size.height * scale);
  const left = box.x + box.width / 2 < page.width / 2;
  const top = box.y + box.height / 2 < page.height / 2;
  return {
    x: left ? box.x : box.x + box.width - width,
    y: top ? box.y : box.y + box.height - height,
    width,
    height,
  };
}
