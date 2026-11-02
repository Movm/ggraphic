// SPDX-License-Identifier: AGPL-3.0-only
/** The canvas store as a host sees it: the provider, the selector hooks and the auto-save store. The store factory and its state type are internal. */
export {
  CanvasStoreProvider,
  useCanvasStore,
  useCanvasStoreSelector,
  useCanvasStoreShallow,
  useIsElementSelected,
} from '../stores/CanvasStoreProvider.js';
export {
  type AutoSaveActions,
  type AutoSaveState,
  type AutoSaveStatus,
  type AutoSaveStore,
  type AutoSaveStoreApi,
  AutoSaveStoreProvider,
  useAutoSaveStore,
  useAutoSaveStoreApi,
  useAutoSaveStoreShallow,
} from '../stores/useAutoSaveStore.js';
