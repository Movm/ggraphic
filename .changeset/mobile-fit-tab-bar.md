---
'@ggraphic/editor': patch
---

On mobile, a page that the height limits now fits above the tab bar (#139). The mobile fit used to take the box height minus a fixed 120 px, too little for the header, page toolbar and tab bar, so a portrait page at 500 × 701 ran 38 px under the tab bar. The shell now measures the free canvas area on mobile too (`useMeasuredStageFit`), as it does on desktop. Pages the width limits, as on most phones, keep their size.

- **`useMeasuredStageFit(container, enabled, hold?)`:** new optional `hold`. While it is true, the last fit stays and nothing is measured. The shell sets it while a mobile sheet is open: the sheet takes space from the main column, and `useMobileSheetFit` scales the pages into what is left.
