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

import studioDayJubilee from './templates/studio-day-jubilee.json' with { type: 'json' };
import studioDayPhotoGrid from './templates/studio-day-photo-grid.json' with { type: 'json' };
import studioDayPhoto from './templates/studio-day-photo.json' with { type: 'json' };
import studioDayThanks from './templates/studio-day-thanks.json' with { type: 'json' };

import studioCallDemo from './templates/studio-call-demo.json' with { type: 'json' };
import studioCallImperative from './templates/studio-call-imperative.json' with { type: 'json' };
import studioCallProgress from './templates/studio-call-progress.json' with { type: 'json' };
import studioCallThreeSteps from './templates/studio-call-three-steps.json' with { type: 'json' };
import studioCallTwoHalves from './templates/studio-call-two-halves.json' with { type: 'json' };

import studioDataBarRanking from './templates/studio-data-bar-ranking.json' with { type: 'json' };
import studioDataShareBar from './templates/studio-data-share-bar.json' with { type: 'json' };
import studioDataThreeColumns from './templates/studio-data-three-columns.json' with { type: 'json' };

import studioPhotoTextBox from './templates/studio-photo-text-box.json' with { type: 'json' };
import studioPhotoTextFade from './templates/studio-photo-text-fade.json' with { type: 'json' };
import studioPhotoTextMarker from './templates/studio-photo-text-marker.json' with { type: 'json' };
import studioPhotoTextPanel from './templates/studio-photo-text-panel.json' with { type: 'json' };
import studioPhotoTextQuestion from './templates/studio-photo-text-question.json' with { type: 'json' };
import studioPhotoTextQuiet from './templates/studio-photo-text-quiet.json' with { type: 'json' };

import studioStatementBar from './templates/studio-statement-bar.json' with { type: 'json' };
import studioStatementPhoto from './templates/studio-statement-photo.json' with { type: 'json' };
import studioStatementSandwich from './templates/studio-statement-sandwich.json' with { type: 'json' };
import studioStatementSerif from './templates/studio-statement-serif.json' with { type: 'json' };
import studioStatementSplitWord from './templates/studio-statement-split-word.json' with { type: 'json' };
import studioStatementStack from './templates/studio-statement-stack.json' with { type: 'json' };

import studioPersonBroadcast from './templates/studio-person-broadcast.json' with { type: 'json' };
import studioPersonNameBlock from './templates/studio-person-name-block.json' with { type: 'json' };
import studioPersonNameBoxes from './templates/studio-person-name-boxes.json' with { type: 'json' };
import studioPersonNameTop from './templates/studio-person-name-top.json' with { type: 'json' };
import studioPersonNewFace from './templates/studio-person-new-face.json' with { type: 'json' };
import studioPersonPair from './templates/studio-person-pair.json' with { type: 'json' };

import studioNumberOneDigit from './templates/studio-number-one-digit.json' with { type: 'json' };
import studioNumberPercent from './templates/studio-number-percent.json' with { type: 'json' };
import studioNumberPhotoStrip from './templates/studio-number-photo-strip.json' with { type: 'json' };
import studioNumberTwoColumns from './templates/studio-number-two-columns.json' with { type: 'json' };
import studioNumberWordStack from './templates/studio-number-word-stack.json' with { type: 'json' };

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

  studioDayJubilee,
  studioDayPhotoGrid,
  studioDayPhoto,
  studioDayThanks,

  studioCallDemo,
  studioCallImperative,
  studioCallProgress,
  studioCallThreeSteps,
  studioCallTwoHalves,

  studioDataBarRanking,
  studioDataShareBar,
  studioDataThreeColumns,

  studioPhotoTextBox,
  studioPhotoTextFade,
  studioPhotoTextMarker,
  studioPhotoTextPanel,
  studioPhotoTextQuestion,
  studioPhotoTextQuiet,

  studioStatementBar,
  studioStatementPhoto,
  studioStatementSandwich,
  studioStatementSerif,
  studioStatementSplitWord,
  studioStatementStack,

  studioPersonBroadcast,
  studioPersonNameBlock,
  studioPersonNameBoxes,
  studioPersonNameTop,
  studioPersonNewFace,
  studioPersonPair,

  studioNumberOneDigit,
  studioNumberPercent,
  studioNumberPhotoStrip,
  studioNumberTwoColumns,
  studioNumberWordStack,

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
