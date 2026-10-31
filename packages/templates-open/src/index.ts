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
import studioDataBarRanking from './templates/studio-data-bar-ranking.json' with { type: 'json' };
import studioDataShareBar from './templates/studio-data-share-bar.json' with { type: 'json' };
import studioDataThreeColumns from './templates/studio-data-three-columns.json' with { type: 'json' };

import studioAnnotatedHeadline from './templates/studio-annotated-headline.json' with { type: 'json' };
import studioCarouselCover from './templates/studio-carousel-cover.json' with { type: 'json' };
import studioCarouselInner from './templates/studio-carousel-inner.json' with { type: 'json' };
import studioCommunityQuestion from './templates/studio-community-question.json' with { type: 'json' };
import studioComparisonStacked from './templates/studio-comparison-stacked.json' with { type: 'json' };
import studioDemandPhotoBand from './templates/studio-demand-photo-band.json' with { type: 'json' };
import studioFactBarChart from './templates/studio-fact-bar-chart.json' with { type: 'json' };
import studioFigureOfTheMonth from './templates/studio-figure-of-the-month.json' with { type: 'json' };
import studioFramedPhoto from './templates/studio-framed-photo.json' with { type: 'json' };
import studioGoodNewsSlide from './templates/studio-good-news-slide.json' with { type: 'json' };
import studioInvitationPanel from './templates/studio-invitation-panel.json' with { type: 'json' };
import studioPetitionFace from './templates/studio-petition-face.json' with { type: 'json' };
import studioPosterType from './templates/studio-poster-type.json' with { type: 'json' };
import studioQuoteCard from './templates/studio-quote-card.json' with { type: 'json' };
import studioSplitPhotosBand from './templates/studio-split-photos-band.json' with { type: 'json' };
import studioStatementPanelDots from './templates/studio-statement-panel-dots.json' with { type: 'json' };
import studioStudyKickerBoxes from './templates/studio-study-kicker-boxes.json' with { type: 'json' };

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
  studioDataBarRanking,
  studioDataShareBar,
  studioDataThreeColumns,

  studioAnnotatedHeadline,
  studioCarouselCover,
  studioCarouselInner,
  studioCommunityQuestion,
  studioComparisonStacked,
  studioDemandPhotoBand,
  studioFactBarChart,
  studioFigureOfTheMonth,
  studioFramedPhoto,
  studioGoodNewsSlide,
  studioInvitationPanel,
  studioPetitionFace,
  studioPosterType,
  studioQuoteCard,
  studioSplitPhotosBand,
  studioStatementPanelDots,
  studioStudyKickerBoxes,
];

export interface OpenTemplateAsset {
  path: string;
  licence: string;
  source: string;
  author: string;
}

/** The assets the pack ships. Empty: the three templates use none. */
export const OPEN_TEMPLATE_MANIFEST: { assets: readonly OpenTemplateAsset[] } = manifest;

export { SAMPLE_PHOTOS, type SamplePhoto, type SamplePhotoRole } from './samples/index.js';
