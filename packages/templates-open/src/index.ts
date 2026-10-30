// SPDX-License-Identifier: CC0-1.0
import manifest from './manifest.json' with { type: 'json' };
import studioEventGiantDate from './templates/studio-event-giant-date.json' with { type: 'json' };
import studioEventPhotoDate from './templates/studio-event-photo-date.json' with { type: 'json' };
import studioEventProgramme from './templates/studio-event-programme.json' with { type: 'json' };
import studioEventDateBands from './templates/studio-event-date-bands.json' with { type: 'json' };
import studioEventCountdown from './templates/studio-event-countdown.json' with { type: 'json' };
import studioEventPanel from './templates/studio-event-panel.json' with { type: 'json' };
import studioHeadline from './templates/studio-headline.json' with { type: 'json' };
import studioNumber from './templates/studio-number.json' with { type: 'json' };
import studioPhotoNumber from './templates/studio-photo-number.json' with { type: 'json' };
import studioPhotoQuote from './templates/studio-photo-quote.json' with { type: 'json' };
import studioQuote from './templates/studio-quote.json' with { type: 'json' };

import studioQuoteGiantMark from './templates/studio-quote-giant-mark.json' with { type: 'json' };
import studioQuotePortrait from './templates/studio-quote-portrait.json' with { type: 'json' };
import studioQuoteSidePortrait from './templates/studio-quote-side-portrait.json' with { type: 'json' };
import studioQuoteTwoVoices from './templates/studio-quote-two-voices.json' with { type: 'json' };
import studioQuoteTypographic from './templates/studio-quote-typographic.json' with { type: 'json' };

/** The pack's template files as parsed JSON; consumers read each through `readTemplateFile`. */
export const OPEN_TEMPLATES: readonly unknown[] = [
  studioHeadline,
  studioQuote,
  studioNumber,
  studioEventGiantDate,
  studioEventPhotoDate,
  studioEventProgramme,
  studioEventDateBands,
  studioEventCountdown,
  studioEventPanel,
  studioPhotoQuote,
  studioPhotoNumber,

  studioQuoteGiantMark,
  studioQuotePortrait,
  studioQuoteSidePortrait,
  studioQuoteTwoVoices,
  studioQuoteTypographic,
];

export interface OpenTemplateAsset {
  path: string;
  licence: string;
  source: string;
  author: string;
}

/** The assets the pack ships. Empty: the three templates use none. */
export const OPEN_TEMPLATE_MANIFEST: { assets: readonly OpenTemplateAsset[] } = manifest;
