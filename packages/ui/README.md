# @ggraphic/ui

Design tokens and accessible React components for ggraphic's landing, auth and app surfaces. MPL-2.0. Derived from the design mockups; the review and every decision are in [`docs/design/ui-kit-review.md`](../../docs/design/ui-kit-review.md).

## Install

Inside the monorepo: `"@ggraphic/ui": "workspace:*"`. Peers: `react`, `react-dom` (19). Components use `radix-ui` (Checkbox, Select, Tabs, Slot).

## Use

```ts
// once, at the app entry
import '@ggraphic/ui/fonts.css'; // optional: self-hosted Bricolage Grotesque (OFL)
import '@ggraphic/ui/tokens.css';
import '@ggraphic/ui/editor-bridge.css'; // optional: maps the kit onto the editor's --editor-* tokens
import '@ggraphic/ui/styles.css';

import { Button, TextField, AuthLayout } from '@ggraphic/ui';
```

Add `className="ui-root"` to the app root for the base font, colour and `box-sizing`. The styles are plain CSS (`.ui-*` classes), with no Tailwind requirement; they coexist with Tailwind utilities.

`pnpm --filter @ggraphic/ui demo` serves a gallery of every component (`demo/Gallery.tsx`); the tests mount it and run axe over it.

## Override the brand

All tokens live at `:where(:root)` (specificity 0): a plain `:root { ... }` in your own CSS wins regardless of import order. The roles (`--ui-color-*`) are derived from seven brand knobs, so a re-brand is:

```css
:root {
  --ui-brand-ink: #10222b; /* text, strong borders */
  --ui-brand-deep: #0b3d4a; /* hero, footer, auth photo panel */
  --ui-brand-primary: #0a7c86; /* buttons, links, focus ring, selected */
  --ui-brand-primary-hover: #0b3d4a;
  --ui-brand-tint: #e6f3f4; /* tabs track, tinted cards, subtle sections */
  --ui-brand-highlight: #7fd6dd; /* accent on dark surfaces, focus ring on dark */
  --ui-brand-display: #3cc4d0; /* big display headings on dark */
  --ui-font-display: 'Your Font', system-ui, sans-serif; /* and --ui-font-body */
}
```

Check contrast after overriding: `brand-primary` needs 4.5:1 against white (links and button fill with white text) and `brand-display` 3:1 against `brand-deep` (large type). Anything finer (radii, spacing, shadows, type scale) is a token as well: see `src/styles/tokens.css`. Wrap a subtree in `data-ui-surface="inverse"` to flip the roles onto the deep colour.

The mockup palette has no dark mode, so none is shipped. The editor core reads `--editor-*`; `editor-bridge.css` fills those from the kit tokens (a host that defines `--editor-*` itself keeps winning).

## Components

| Group      | Components                                                                                                                                                                                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Actions    | `Button` (primary, secondary, outline, inverse, ghost; sm, md, lg; `asChild`), `IconButton` (needs `label`)                                                                                                                                                                                |
| Forms      | `TextField` (label, hint, error, `labelAction`), `PasswordField` (show/hide toggle), `Checkbox`, `Select`, `PromptField` (pill input with round submit), `PromptComposer` (multi-line prompt card, options slot, Enter submits), `ChipGroup` (pill radios)                                 |
| Display    | `Card`, `CardMedia`, `CardBody`, `CardTitle`, `CardText`; `Badge` (tones, `square` tag, `lg` chips); `Avatar`, `Tile` + `TileList` (framed preview with name, in a scrolling row or a grid); `Alert` (info, success, warning, danger); `Tabs` (pill segmented); `ProgressSteps`; `Divider` |
| Navigation | `Wordmark`, `TopNav` (`solid` or `overlay`), `AppShell`, `SideRail`, `SideRailItem`                                                                                                                                                                                                        |
| Pages      | `AuthLayout` + `AuthForm` (split login/registration), `Hero`, `PromptHero` (dark band with the question and a prompt card), `Section` (two-tone statement), `FeatureGrid`, `PillList`, `Footer`                                                                                            |

Accessibility notes: every field links label, hint and error through `aria-describedby`/`aria-invalid`; icon-only buttons require an accessible name; the focus ring is one rule, 3px token colour with offset (`--ui-focus-ring`); controls are 40-54px high (44px minimum for tabs and icon buttons); motion tokens collapse under `prefers-reduced-motion`. Text pairs were measured against WCAG AA (see the review); axe runs over the gallery in the tests but cannot compute colour contrast in jsdom.

## Not included

Dark theme, toasts, dialogs, data tables, the editor's own panels. The mockups do not show them.
