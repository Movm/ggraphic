// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Implementation details of the codec and the deterministic lift that `@ggraphic/editor` needs
 * across the package boundary. Reached as `@ggraphic/core/internal/ydoc/internal`: the unstable
 * channel, exported on purpose and with no semver promise, like `@ggraphic/editor/internal/*`.
 * A host does not import it; the names are not part of the public surface of `@ggraphic/core/ydoc`.
 *
 * Everything here is frozen with the lift: the bytes a client writes while it lifts an old
 * document depend on these functions, so a change must not alter what they return.
 */
export { canonicalJsonValue, sameStateValue } from './codec.js';
export { cyrb53, isDerivedClientId } from './deterministic.js';
export { posJitter } from './pos.js';
export { runAfterWrite } from './reports.js';
