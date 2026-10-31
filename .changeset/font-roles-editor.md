---
'@ggraphic/editor': minor
---

Pick the font of a free text by brand role. When the host provides `setAdditionalTextFontRole`
(`OptionalCanvasActions`), the context bar of a free text shows a role picker (Headline, Text,
Condensed, Accent), each role in its own font and only the brand's own fonts offered; the text
stays bound to its role, so a brand change takes it along. New texts from the editor's own
`addHeader`, `addSubheader` and `addText` are born bound (`font.headline`, `font.body`).
`FloatingModuleState.data` of a free text carries `fontFamily` and `bind`, `ToolbarStateReport`
gains `canChangeFontRole`, and `requestFontFace` starts loading a family's face ahead of its first
draw.
