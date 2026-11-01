---
'@ggraphic/editor': minor
---

New entry `@ggraphic/editor/host`. It holds what a host's start-up code and test setup need, without loading the editor UI:

- the `register*` seams: element kinds, asset catalogue, formats and format groups, templates, brand packs, messages, toasts, storage keys, PPTX fonts and screen-corner reservations;
- the format lookups a host's template registry needs: `canvasFormats`, `getCanvasFormat` and `getCanvasFormatOrDefault`;
- `useCanvasEditorServices` and `BlockInsertContext`;
- the interfaces a host augments: `CanvasEditorHostServices`, `HostElementKinds`, `HostCanvasActions` and `CanvasAiHostTypes`.

It loads 17 modules, none of them a component, store or primitive. Each of `shell`, `kinds` and `elements` loads at least 31. A host that `vi.mock`s editor modules can import its start-up code from `host`, and its mocks still apply. Every name is also in its domain entry.

Also added:

- `CanvasAiHostTypes` in `@ggraphic/editor/ai`, so a host can augment it through a public path.
- `stripMarks` in `@ggraphic/editor/text`.
- `surfaceGlow` in `@ggraphic/editor/brand`.
- `registerMeasuredCornerReservation` and its types in `@ggraphic/editor/services`.

**Breaking (alpha):** `BlockInsertApi.bloecke` is now `blocks`. The field only lives in the React context a host provides, nothing persists it, so there is no alias: a host that provides or reads the context renames it (a type error points at each site).

`CanvasFormatGroupDef` takes an optional `order`. It places a host group among the built-in picker groups, whose positions are in `CANVAS_FORMAT_GROUP_ORDER` (`templates`, `host`): `post` is 100, `square` 200, `slides` 300. A group without `order` follows the positioned ones, as before.
