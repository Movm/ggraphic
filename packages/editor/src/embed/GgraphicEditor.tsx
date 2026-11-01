// SPDX-License-Identifier: MPL-2.0
/**
 * The editor in one component. Importing it touches no browser global, so a server-rendered
 * page can import it; the editor itself loads and renders only in the browser.
 */
import { lazy, Suspense, useSyncExternalStore } from 'react';

import { type GgraphicEditorProps } from './types.js';

const EmbeddedEditor = lazy(() => import('./EmbeddedEditor.js'));

const subscribeNever = () => () => {};

export function GgraphicEditor(props: GgraphicEditorProps) {
  // False on the server and during hydration, true in the browser after it.
  const inBrowser = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false
  );
  if (!inBrowser) return null;
  return (
    <Suspense fallback={null}>
      <EmbeddedEditor {...props} />
    </Suspense>
  );
}
