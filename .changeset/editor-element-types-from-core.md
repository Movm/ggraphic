---
'@ggraphic/editor': patch
---

The element data types now come from `@ggraphic/core`. Every module that defined one (`utils/shapes`,
`utils/userImageUtils`, `configs/types`, `configs/factory/baseTypes`, `utils/canvasAssets`,
`utils/chartTypes`, `utils/frameUtils`, `utils/gradientFill`, `utils/illustrations/types`,
`utils/pillBadgeUtils`, `primitives/CircleBadge`, `utils/textUtils`, `utils/textAlign`,
`utils/cornerRadius`, `utils/shapeDevices`, `utils/externalIcons`, `sidebar/tabTypes`) still exports
the same names, so no import path changes.
