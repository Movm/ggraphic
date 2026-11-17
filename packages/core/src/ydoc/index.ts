// SPDX-License-Identifier: AGPL-3.0-only
/**
 * `@ggraphic/core/ydoc`: how a canvas document lives in a Y.Doc. The page-state codec of
 * document version 4, its key classes, the lift, the Y.Doc key names and the fractional order
 * keys. Needs `yjs` (an optional peer of the core); the core's root entry does not load it.
 *
 * The codec tells structures apart with `instanceof`, so it must see the same `yjs` module
 * instance as the caller's documents.
 */
export {
  CORE_ELEMENT_COLLECTION_KEYS,
  ELEMENT_POS_KEY,
  ELEMENT_STORAGE_VERSION,
  ORDERED_ID_KEYS,
  RECORD_KEYS,
  RESERVED_PREFIX,
  STATE_KIND_KEY,
  stateKeyClasses,
  type StateKeyClass,
  type StateKeyClasses,
} from './stateKeyClasses.js';
export {
  assertWritableState,
  buildStateMap,
  canonicalJsonValue,
  representableProblem,
  type PlainFallback,
  mayWriteStructured,
  readState,
  readStateKey,
  sameStateValue,
  writeStateKeys,
  type StateWriteOptions,
} from './codec.js';
export { liftDocumentState, liftStateMap, type LiftOptions } from './lift.js';
export {
  LIFT_ID_ALGORITHM,
  cyrb53,
  deterministicClientId,
  isDerivedClientId,
  liftSalt,
  transactDeterministically,
} from './deterministic.js';
export { runAfterWrite } from './reports.js';
export { YDOC_KEYS, type YDocKey } from './ydocKeys.js';
export { posBetween, posJitter } from './pos.js';
