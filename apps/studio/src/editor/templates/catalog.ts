// SPDX-License-Identifier: AGPL-3.0-only
import {
  BLANK_TEMPLATE_ID,
  HEADLINE_TEMPLATE_ID,
  NUMBER_TEMPLATE_ID,
  QUOTE_TEMPLATE_ID,
  type StudioTemplateId,
} from './ids';

/** How the Studio's pickers name its templates, in picker order. */
export const TEMPLATE_CATALOG: readonly {
  id: StudioTemplateId;
  label: string;
  description: string;
}[] = [
  { id: BLANK_TEMPLATE_ID, label: 'Blank', description: 'An empty page on a solid ground' },
  {
    id: HEADLINE_TEMPLATE_ID,
    label: 'Headline + text',
    description: 'Headline, subline, body and a call to action',
  },
  { id: QUOTE_TEMPLATE_ID, label: 'Quote', description: 'A quotation with its speaker' },
  { id: NUMBER_TEMPLATE_ID, label: 'Big number', description: 'One figure and what it means' },
];
