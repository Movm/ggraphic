---
'@ggraphic/core': minor
---

Hold the canvas element data model: `AdditionalText`, `ShapeInstance`, `UserImageInstance`,
`IconState`, `AssetInstance`, `ChartInstance`, `FrameInstance`, `CircleBadgeInstance`,
`PillBadgeInstance`, `IllustrationInstance` (with `KawaiiInstance` and `SvgInstance`) and the types
they are built from (`GradientFill`, `TextAccent`, `TextMarker`, `TextAlign`, `FontWeight`,
`CornerRadius`, `TailSide`, `IconSource`, `ShapeType` and the rest), plus `ASSET_TARGET_SIZE` and
`TEXT_ALIGNS`. Also `BackgroundColorOption`. All of it is types and two constants with no
dependency, so a server can build, read and change pages in plain Node. The shapes are stored in
documents: fields are added, never renamed.
