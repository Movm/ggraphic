---
'@ggraphic/editor': minor
---

The canvas fills the available area on desktop and follows it when the window grows or shrinks (#112). **This is a visible size change for all hosts.**

- **Before:** a desktop stage was effectively capped at 400 px wide: 400 × 500 for 4:5 and 400 × 225 for 16:9, at any window size. After the window had been made smaller, the stage never grew back.
- **Now:** the stage takes the part of the canvas area that nothing covers. That is the area below the context bar slot and the page toolbar, and above the bottom bar, with the same 24 px gap above and below. Every page of a multi-page document gets that full size and is reached by scrolling.
- **Mobile:** the mobile layout, including an open sheet, keeps its own fit and is unchanged.
- **`CanvasStage`:** a new prop `fitToParent` (default `true`). Inside the editor it is off, because there the stage's parent sizes itself to the stage.
- **Shell measurement:** the shell measures the area with `useMeasuredStageFit` (`hooks/stageFit`).
