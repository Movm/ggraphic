---
'@ggraphic/editor': minor
---

Export `formatLabel` and `formatDescription` from `@ggraphic/editor/host` and `@ggraphic/editor/templates`: a format's name and size line in the language of the message catalogue (`registerMessages('en' | 'de')`). The built-in formats' `label` and `description` fields stay in their original language (German); show these functions instead. The host entry loads no React, so a server component can list formats in English after `registerMessages('en')`.
