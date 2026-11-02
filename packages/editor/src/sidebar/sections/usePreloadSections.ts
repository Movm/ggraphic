// SPDX-License-Identifier: MPL-2.0
import { useEffect } from 'react';

import { whenIdle } from './whenIdle.js';

interface PreloadableConfig {
  tabs: readonly { id: string }[];
  sections: Readonly<Record<string, { component: unknown } | undefined>>;
}

const preloadOf = (component: unknown): (() => Promise<unknown>) | null => {
  const preload = (component as { preload?: unknown } | null)?.preload;
  return typeof preload === 'function' ? (preload as () => Promise<unknown>) : null;
};

/**
 * Warms, once the editor is idle, the section of every tab the config shows that can preload
 * (`lazyWithPreload`: Elements, Tools, or a host's own). Its first open then renders directly
 * instead of suspending behind the chunk and React's reveal throttle. A failed load is retried
 * on the open itself.
 */
export function usePreloadSections(config: PreloadableConfig | null | undefined): void {
  useEffect(() => {
    if (!config) return;
    const preloads = config.tabs.flatMap((tab) => {
      const preload = preloadOf(config.sections[tab.id]?.component);
      return preload ? [preload] : [];
    });
    if (preloads.length === 0) return;
    return whenIdle(() => {
      for (const preload of preloads) void preload().catch(() => {});
    });
  }, [config]);
}
