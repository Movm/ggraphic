---
'@ggraphic/editor': minor
---

New `@ggraphic/editor/page/*` modules: the free page model a host used to write itself. `createPageConfig` builds the page config (colour ground, Text/Elements/Uploads/Tools tabs, the free elements) from a seed and the host's template lookup; `createPageActions` holds the page's actions; `pageStateFrom`, `seedFromTemplate`, `storedPageSeed`, `placeTemplate`, `fittedFontSize`, `withHuggedPlates`, `slotBudgetFor` and the typography and logo-size helpers come with it. The tab texts are new catalogue entries (`pageTabs`) in German and English. The code moved from the Studio, which now uses it from the package.
