# @ggraphic/collab

> **Alpha, untested.** Early work in progress: the API and the document format can change without notice. See the [repository README](../../README.md#ggraphic).

The brand-neutral collaboration session of the ggraphic design editor. Licensed under [AGPL-3.0-only](./LICENSE). Versions published before the relicensing remain available under MPL-2.0.

`useCollaboration` owns one Yjs document per room: it connects a Hocuspocus provider, keeps an optional IndexedDB cache with an LRU registry, publishes the local awareness user and reports `isConnected`, `isSynced`, `isLocalLoaded`, `isReadOnly` and `authError`. Everything a host decides stays with the host: the server URL and token, the storage names (`localCache.dbPrefix`, `localCache.registryKey`), which rooms are cached at all, what the awareness user looks like, and which authentication failures are final (`classifyAuthFailure`).

It does not depend on the canvas editor, so text, board and chat surfaces can use it too.
