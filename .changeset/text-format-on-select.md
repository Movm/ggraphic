---
'@ggraphic/schema': minor
'@ggraphic/editor': minor
---

One click on a text now shows the whole text toolbar: the format buttons (bold, italic, underline,
accent, marker, bullet and numbered list) no longer wait for the edit session. On a text that is
selected and not edited they act on the whole text: a button is pressed when the whole text carries
the format and the next click takes it off; bold and italic only where the font has the cuts. In the
edit session (double click) the same buttons act on the selection, as before.

`@ggraphic/schema` adds `setWholeTextMark`, `setWholeTextList`, `wholeTextFormat` and
`wholeTextCanOrderedList`, pure functions on the stored markdown-lite text. In the editor, the
buttons are split from tiptap into `TextFormatButtons`; the host handler `handleTextFormatChange`
(`ContextControls` handlers, `GenericCanvasRef`) writes the formatted text of a free text through
`updateAdditionalText`, so the page refits and re-hugs it like a typed edit, and of an editable
template text under its state key. `FloatingModuleState.data` of an editable text carries `text`,
`hasAccent` and `hasMarker`.
