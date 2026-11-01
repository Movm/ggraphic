// SPDX-License-Identifier: MPL-2.0
/**
 * Corner radii of a rounded box: one number for all four corners, or one per corner in CSS
 * order (top-left, top-right, bottom-right, bottom-left), as Konva's `cornerRadius` takes them.
 */
export type Corners = [number, number, number, number];
export type CornerRadius = number | Corners;
