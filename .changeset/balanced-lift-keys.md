---
'@ggraphic/core': minor
'@ggraphic/schema': patch
---

Order keys no longer grow linearly (#208). The lift and `buildStateMap` give the n ids of a list a deterministic spread set (`posRange(null, null, n)`) instead of the chain `posBetween(previous, null)`: 5,000 elements now get keys of three characters where the chain gave up to 1,000 and a 2.6 MB update. A write that places several new ids into one gap, and a re-space, use a spread set too, each key with the random suffix as before. One new key is still `posBetween(before, after)`. The key format (alphabet, plain string comparison, no trailing `0`) is unchanged, and documents lifted earlier keep their chained keys.

This changes the bytes the lift writes, so `LIFT_ID_ALGORITHM` is now `ggraphic-lift-id/2`. A build on `ggraphic-lift-id/1` still converges with this one, but their lifts of the same state no longer merge: they meet at key level, as two lifts of different states always did. Deploy all lifting clients of one document together.

`DOCUMENT_VERSIONING.md` specifies the spread set, corrects the old size note and records that an element restored by undo after a delete gets a fresh key between the same neighbours (#214, accepted).
