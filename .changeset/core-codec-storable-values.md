---
'@ggraphic/core': minor
---

`writeStateKeys` and `buildStateMap` reject, before writing anything, every value Yjs would refuse or not decode back as the same JSON, at every depth they hand to Yjs: functions, symbols, BigInts, `Date`s (Yjs stores them and decodes `{}`), `Map`s, `Set`s, typed arrays and `ArrayBuffer`s, class instances and boxed primitives, objects without a prototype where they are set directly, symbol or non-enumerable keys, a `__proto__` key inside an encoded value, and cycles. Before, a function inside an element threw `Unexpected content type` after the element's other properties had been written. `null`, `undefined` (also in arrays), `NaN` and `±Infinity` are still accepted. New `assertWritableState(partial, options, stateY?)` runs the same check without writing, for a caller that writes more than one codec call (deletes keys, writes several pages) and must not start when a part would be rejected.
