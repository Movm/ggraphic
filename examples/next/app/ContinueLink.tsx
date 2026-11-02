// SPDX-License-Identifier: MPL-2.0
// Only the browser knows whether a design is stored, so this link renders after hydration.
'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';

import { DESIGN_KEY } from './design';

const subscribeNever = () => () => {};

export function ContinueLink() {
  const stored = useSyncExternalStore(
    subscribeNever,
    () => localStorage.getItem(DESIGN_KEY) !== null,
    () => false
  );
  return stored ? <Link href="/edit">Continue your design</Link> : null;
}
