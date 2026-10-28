# UI kit review: ggraphic design mockups

Source: the design export with four mockups (`ggraphic Landing.dc.html`, `ggraphic Landing v2.dc.html`, `ggraphic Login.dc.html`, `ggraphic Mobil.dc.html`) and two reference screenshots. The mockups are design-tool pages with inline styles; this document extracts the language they share and records what the `@ggraphic/ui` kit follows. Nothing from `uploads/` (screenshots, the Unsplash photo) is bundled in the repo.

## Mockups

### Landing v2 (the newer landing, primary reference)

Five full-viewport scenes: Hero, Demo, Vorlagen, Für wen, Ende.

- **Colour.** Ink `#3A0B1C` for text on white; deep wine `#4A0F24` for inverse sections and chat bubbles; wine `#6B1535` for secondary text and headings on tints; magenta `#D6146F` for links, buttons and statement accents; display pink `#FF3D96` for the giant headlines on dark; rosé `#FF7DB8` / `#FF8FC3` as accent text on wine; blush `#FBEAF1` section tint; hairline `#F3DCE6`; `#EBD3DD` for dotted-canvas dots; `#F6DCE7` for secondary text on wine; dotted work surface `#F8F1F4`.
- **Type.** One family, Bricolage Grotesque (opsz 12..96; weights 400/500/700/800). Hero headline `clamp(64px, 12vw, 184px)`, weight 800, line-height .88, tracking -0.05em, max-width 11ch. Section statements `clamp(34px, 4.6vw, 64px)`, 700, line-height 1.04, tracking -0.035em, `text-wrap: balance`, always two-tone (ink + magenta, or white + rosé on wine). Lead `clamp(18px, 1.6vw, 22px)`, line-height 1.45. Audience chips `clamp(20px, 3.4vw, 46px)`/700. Wordmark `ggraphic` 800, 24px, -0.04em, no dot.
- **Spacing.** Page gutter `clamp(20px, 4vw, 56px)`; section padding `clamp(88px, 10vw, 140px)`; sections min-height 100vh.
- **Radii.** Pills (999px) for every button, chip, tab and the prompt field; 16px panels; 12px cards/posters; 6px poster previews; 8px small inputs.
- **Shadows.** Always wine-tinted: `0 4px 16px rgba(58,11,28,.12)` (toolbar), `0 14px 40px rgba(58,11,28,.22)` (poster), `0 20px 50px / 0 30px 80px rgba(0,0,0,.35)` (demo panel on wine).
- **Buttons.** Demo step buttons: 2px rosé border pill, filled rosé when active. End-of-page CTA is a white pill input with a 48px round magenta arrow button (hover wine). Nav: transparent over the B/W photo, white text, a plain "Anmelden" text link.
- **Inputs.** The "Was ist passiert?" prompt (white pill, 52px min-height, 500 weight) and the 1.5px `#F3DCE6` small field with 8px radius.
- **Cards.** Poster cards on a 4:5 ratio, `container-type: inline-size` and `cqw` units so the poster scales with its card.
- **Hero pattern.** Full-bleed greyscale photo (`grayscale(1) contrast(1.08)`), bottom shade gradient, overlay nav, oversized pink headline, short white lead.
- **Brand mark.** Wordmark text only.

### Landing v1 (older)

Same palette and type, different structure: sticky white nav with blur, 1px hairline and a magenta pill CTA ("Kostenlos starten"), a dot after the wordmark, JetBrains Mono eyebrows (`01 — Schreib, was passiert ist`), two hero variants (full-bleed photo, split), a "Warum ggraphic" feature section on blush with a 2px ink rule on top of every item, CTA hover `#B00E5B`, hero CTA hover `#FF3D96`. Status-like colours appear once each: teal `#1C7C80`, ochre `#B8841F`, blue `#2A4BB8`.

### Login (login, registration and brand setup)

- **Split layout.** `grid-template-columns: repeat(auto-fit, minmax(min(100%, 440px), 1fr))`. Left: photo panel (greyscale photo at .6 opacity, `#4A0F24` multiply layer, bottom fade), wordmark top-left, big weight-500 pink heading `clamp(48px, 6.5vw, 104px)` ("Schön, dass du da bist."), or the live poster preview during brand setup. On narrow screens the panel becomes a 38vh banner (56vh in setup). Right: form column max 420px, centred.
- **Form pattern.** Pill segmented tabs (track `#FBEAF1`, white active pill with `0 1px 4px` shadow, 44px); labels 15px/700 above 52px fields (1.5px `#EBD3DD` border, 12px radius, focus border magenta); a "Vergessen?" link beside the password label; 54px magenta pill submit (hover wine); "oder" divider; outlined 1.5px ink pill secondary button; 14px legal line in muted `#9A6A7C`.
- **States.** A "sent" confirmation (round check, 40px title, wine paragraph) and a four-step brand setup with 4px segmented progress bars (done magenta, current rosé, todo `#F3DCE6`), logo drop zone (dashed 1.5px, 14px radius), colour rows, palette chips, font tiles.
- **Fonts.** The font tiles list Bricolage Grotesque, Archivo Black, DM Serif Display, Space Grotesk. These are the _user's poster fonts_, not UI fonts.

### Mobil

Five 390x844 phone frames, each an iframe of Landing v2 scrolled to one section. No design of its own; it confirms the fluid behaviour: `clamp()` type, `auto-fit` grids, a mobile variant of the demo (stacked chat/toolbar/poster).

### Screenshots

1. **Canva home (a functional reference, not a visual one).** Left icon rail with labels (Erstellen, Startseite, Projekte, Vorlagen, Marke, ...), a big pill search, a row of round tool shortcuts, "Weiter bearbeiten" with a grid of document cards (preview, title, meta). It informs `AppShell`/`SideRail` and the card grid, in the ggraphic palette rather than Canva's purple.
2. **Studio template detail.** The three poster templates of Landing v2, with a 2px rosé line, dot grid and stripe field, shown as cards with title, a "4:5" tag (small square badge) and a description. It informs `Card`/`CardMedia`/`Badge shape="square"`. Its top bar (home icon, breadcrumb, Chatten, Teilen) is a plain app bar.

## Consistent across the files

Palette (wine/magenta/rosé/blush), Bricolage Grotesque only, extreme negative tracking on display type, pill-shaped controls, wine-tinted shadows, greyscale photos under a wine multiply, 4:5 posters, `clamp()` gutters, `auto-fit` grids, 44-54px control heights, "Kostenlos starten" as the CTA.

## Contradictions and decisions

| Topic                   | Files                                                                                                         | Followed                                                                                | Why                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Nav                     | v1: sticky white blur + magenta pill CTA, dot after wordmark. v2: transparent overlay + text link, no dot.    | Both as `TopNav variant="solid" \| "overlay"`; `Wordmark dot` is opt-in. Default is v2. | v2 is newer; v1's bar is what an app/inner page needs.           |
| CTA hover               | v1: `#B00E5B` / `#FF3D96`. v2 and Login: `#4A0F24`.                                                           | `#4A0F24` (`--ui-brand-primary-hover`).                                                 | v2 and Login agree.                                              |
| Eyebrow type            | v1: JetBrains Mono caps labels. v2: none.                                                                     | Dropped; `--ui-font-mono` is a system stack.                                            | v2 removed it; avoids a third font.                              |
| Hero                    | v1: two variants with two CTAs; v2: photo only, no CTA.                                                       | One `Hero` (photo, actions optional).                                                   | v2 base, actions kept because the app needs a CTA.               |
| Muted text `#9A6A7C`    | Login/v2                                                                                                      | `--ui-color-text-muted: #7F5366` (6.3:1).                                               | `#9A6A7C` on white is 4.4:1, below WCAG AA 4.5:1 for small text. |
| Placeholder `#B58A9B`   | Login                                                                                                         | `--ui-color-text-muted`.                                                                | 3:1, fails AA.                                                   |
| Field border `#EBD3DD`  | Login                                                                                                         | `--ui-color-border-control: #9A6A7C`; `#F3DCE6`/`#EBD3DD` stay for decoration.          | A control edge needs 3:1 (WCAG 1.4.11); `#EBD3DD` is 1.5:1.      |
| Teal `#1C7C80`          | v1                                                                                                            | `#17696D`                                                                               | 4.4:1 as text on its tint.                                       |
| Danger colour           | none shown                                                                                                    | `#B3261E`, not the brand pink.                                                          | Magenta is the primary; an error in a near hue is ambiguous.     |
| Heading weight          | v2 hero 800, Login/Ende 500                                                                                   | Both kept: `--ui-text-display` is 800 (hero), `.ui-auth__heading` 500.                  | Genuinely different roles.                                       |
| Studio fonts vs mockups | Studio uses Raleway/PT Sans/Vollkorn as the neutral _poster brand_ fonts; mockups use Bricolage for the _UI_. | Kit UI = Bricolage Grotesque; the poster brand fonts are untouched.                     | They are different layers (chrome vs. content).                  |
| Dark mode               | none                                                                                                          | Not provided. Only `data-ui-surface="inverse"` (the wine sections).                     | Mockups imply no dark theme.                                     |

## Fonts and licences

All fonts the mockups load are SIL OFL 1.1: Bricolage Grotesque (UI, shipped), Archivo Black, DM Serif Display, Space Grotesk (poster-font choices; not shipped by the kit), JetBrains Mono (v1, dropped). The kit ships Bricolage Grotesque via `@fontsource-variable/bricolage-grotesque` (OFL-1.1, self-hosted, no Google Fonts request; the mockups' Google Fonts `<link>` is not used). The licence gate (`scripts/check-licences.mjs`) already allows OFL-1.1 and now includes `packages/ui`.
