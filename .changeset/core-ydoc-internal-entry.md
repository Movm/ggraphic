---
'@ggraphic/core': patch
'@ggraphic/editor': patch
---

`@ggraphic/core/ydoc` no longer exports `cyrb53`, `isDerivedClientId`, `posJitter`, `runAfterWrite`, `canonicalJsonValue`, `sameStateValue` and `representableProblem`: they are implementation details of the codec and the deterministic lift, not API. This removes public exports in an alpha (none of them was used by the Grünerator). The first six, which `@ggraphic/editor` needs across the package boundary, moved to the unstable channel `@ggraphic/core/internal/*` (`@ggraphic/core/internal/ydoc/internal`, no semver promise, like `@ggraphic/editor/internal/*`); `representableProblem` is private to the core. `liftSalt` stays public: a host that lifts documents itself needs it. The values the functions return are unchanged, so the bytes of the deterministic lift are identical.
