---
'@ggraphic/editor': minor
---

New entry `@ggraphic/editor/host`. It holds what a host's start-up code and test setup need, without loading the editor UI:

- the `register*` seams: element kinds, asset catalogue, formats and format groups, templates, brand packs, messages, toasts, storage keys, PPTX fonts and screen-corner reservations;
- `useCanvasEditorServices` and `BlockInsertContext`;
- the interfaces a host augments: `CanvasEditorHostServices`, `HostElementKinds`, `HostCanvasActions` and `CanvasAiHostTypes`.

It loads 17 modules, none of them a component, store or primitive. Each of `shell`, `kinds` and `elements` loads at least 31. A host that `vi.mock`s editor modules can import its start-up code from `host`, and its mocks still apply. Every name is also in its domain entry.

Also added:

- `CanvasAiHostTypes` in `@ggraphic/editor/ai`, so a host can augment it through a public path.
- `stripMarks` in `@ggraphic/editor/text`.
- `surfaceGlow` in `@ggraphic/editor/brand`.
- `registerMeasuredCornerReservation` and its types in `@ggraphic/editor/services`.
