// SPDX-License-Identifier: AGPL-3.0-only
import { useRef } from 'react';

/**
 * `value`, or the previous one when every own field is the same. For an object prop that a
 * component derives anew on each render (a crop, a draw spec): react-konva compares props by
 * reference and writes a "new" object onto the node even when nothing changed — mid-gesture that
 * overwrites what the gesture set directly on the node, and the node jumps back for a frame.
 */
export function useShallowStable<T extends object | null>(value: T): T {
  const ref = useRef(value);
  if (!shallowEqual(ref.current, value)) ref.current = value;
  return ref.current;
}

function shallowEqual(a: object | null, b: object | null): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  const ka = Object.keys(a) as (keyof typeof a)[];
  return (
    ka.length === Object.keys(b).length && ka.every((k) => Object.is(a[k], (b as typeof a)[k]))
  );
}
