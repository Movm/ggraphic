// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The Studio's part of the editor shell (`registerEditorShell`): the "AI draft"
 * document tab and the page picker behind "Add page" and "Change template".
 */
import { SCHEME_IDS, type SchemeId } from '@ggraphic/core';
import { useCanvasEditorServices } from '@ggraphic/editor/CanvasEditorProvider';
import {
  registerEditorShell,
  type EditorPagePickerProps,
  type EditorTabSectionProps,
} from '@ggraphic/editor/components/CanvasEditor/editorShell';
import { Button } from '@ggraphic/ui';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { PiSparkle } from 'react-icons/pi';

import { useHiddenTemplates } from '../start/hiddenTemplates';
import { TemplateGallery } from '../start/TemplateGallery';
import { apiErrorText } from '../ui/errorText';
import { toast } from '../ui/toast';

import { draftDeckOps } from './aiDraft';
import { DEFAULT_FORMAT, formatSize } from './document';
import { type CatalogEntry } from './templates/catalog';
import { FREE_PAGE_CONFIG_ID } from './templates/ids';
import { templatePageState } from './templates/instantiate';
import { PreviewHost } from './templates/previews';
import { BlockInsertProvider } from './blocks/BlockInsertProvider';

/** The id of the template a page was placed from, if its state says so. */
function templateRefOf(state: Record<string, unknown> | undefined): string | null {
  const ref = state?.['templateRef'];
  return typeof ref === 'object' && ref !== null && typeof (ref as { id?: unknown }).id === 'string'
    ? (ref as { id: string }).id
    : null;
}

/** An emptied page: no elements and no template, the ground and its binding stay. */
function blankPageState(current: Record<string, unknown> | undefined): Record<string, unknown> {
  const kept: Record<string, unknown> = {};
  for (const key of ['backgroundColor', 'bind', 'brandScheme', 'brandStamp']) {
    if (current && key in current) kept[key] = current[key];
  }
  return { ...kept, shapeInstances: [], additionalTexts: [], layerOrder: [] };
}

export const AI_DRAFT_TAB_ID = 'ai-draft';

const FIELD =
  'w-full rounded-lg border border-[var(--editor-border)] bg-[var(--editor-tile)] p-3 text-sm text-[var(--editor-text)] placeholder:text-[var(--editor-placeholder)] focus:border-[var(--editor-accent)] focus:outline-none';
const PRIMARY_BUTTON =
  'inline-flex items-center justify-center gap-2 rounded-lg border-none bg-[var(--editor-accent)] px-4 py-2 text-sm font-semibold text-white cursor-pointer disabled:cursor-default disabled:opacity-60';

const DRAFT_FAILED = 'The draft could not be created.';

/** What a failed AI draft tells the person: by code, never the server's text. */
export function draftErrorText(err: unknown): string {
  return apiErrorText(err, DRAFT_FAILED, {
    ai_timeout: 'The AI took too long. Try a shorter briefing.',
    ai_disabled: 'AI is not available on this server.',
  });
}

/** The "AI draft" tab: a briefing in, the draft's texts onto the design. */
export function AiDraftSection({ formatId, deck, onShowPage, canAddPage }: EditorTabSectionProps) {
  const { aiDraft } = useCanvasEditorServices();
  const [briefing, setBriefing] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fieldId = useId();
  const hintId = useId();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const text = briefing.trim();
    if (!aiDraft || !text || busy) return;
    setBusy(true);
    setError(null);
    try {
      const size = formatSize(formatId);
      const draft = await aiDraft.draft(text, size);
      const ops = draftDeckOps(deck.getPages(), deck.getActivePageId(), draft, size);
      if (ops.inserts.length > 0 && !canAddPage) {
        setError(
          'This design has as many pages as it can hold. Delete one, or open a page with a headline.'
        );
        return;
      }
      const [inserted] = deck.replaceDeck(ops);
      if (inserted) onShowPage(inserted);
      toast(inserted ? 'Draft added as a new page.' : 'Draft applied to this page.');
    } catch (err) {
      setError(draftErrorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="flex flex-col gap-3 p-4" onSubmit={(e) => void submit(e)}>
      <label htmlFor={fieldId} className="text-sm font-semibold text-[var(--editor-text)]">
        What is the graphic about?
      </label>
      <textarea
        id={fieldId}
        aria-describedby={hintId}
        className={FIELD}
        rows={6}
        maxLength={4000}
        value={briefing}
        onChange={(e) => setBriefing(e.target.value)}
        placeholder="e.g. Invite neighbours to the street festival on 12 June, 3 pm, at the old market"
        disabled={busy}
      />
      <p id={hintId} className="m-0 text-xs text-[var(--editor-text-secondary)]">
        The draft fills the headline and the other texts of this page. A page without them gets a
        new &ldquo;Headline + text&rdquo; page.
      </p>
      <button type="submit" className={PRIMARY_BUTTON} disabled={busy || !briefing.trim()}>
        <PiSparkle aria-hidden />
        {busy ? 'Writing the draft…' : 'Draft with AI'}
      </button>
      {error ? (
        <p role="alert" className="m-0 text-sm text-[var(--editor-danger-fg)]">
          {error}
        </p>
      ) : null}
    </form>
  );
}

/** "Add page" and "Change template": the Studio templates as a list. */
export function StudioPagePicker({
  isOpen,
  onClose,
  mode,
  currentTemplateId,
  formatId,
  onSelectTemplate,
  addPage,
  currentState,
  onDuplicateCurrent,
}: EditorPagePickerProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Hidden for everyone here: owners show them again on the start page.
  const { hiddenIds, settled: hiddenSettled } = useHiddenTemplates();

  useEffect(() => {
    if (!isOpen) return;
    dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  const targetFormat = formatId ?? DEFAULT_FORMAT;
  // Every page is a free page whose config stays, so a template's page travels with the choice.
  const pickTemplate = (entry: CatalogEntry, schemeId: SchemeId) => {
    const state = templatePageState(entry, targetFormat, { schemeId });
    if (!state) {
      // Say so instead of adding a blank page the user did not ask for.
      toast.error('This template cannot be placed on the current format and brand.');
      return;
    }
    if (mode === 'add') void addPage?.(FREE_PAGE_CONFIG_ID, false, state);
    else onSelectTemplate(FREE_PAGE_CONFIG_ID, state);
    onClose();
  };
  const pickBlank = () => {
    if (mode === 'add') void addPage?.(FREE_PAGE_CONFIG_ID, false, undefined);
    else onSelectTemplate(FREE_PAGE_CONFIG_ID, blankPageState(currentState));
    onClose();
  };
  // The page keeps its colour world on the new template when that offers it; otherwise the tile
  // starts in the template's first world.
  const scheme = currentState?.['brandScheme'];
  const pageScheme = SCHEME_IDS.find((id) => id === scheme) ?? null;
  const heldTemplateId = templateRefOf(currentState) ?? currentTemplateId;
  // On the body: a box that opened the picker (the small "Add page" button) must not size or clip it.
  return createPortal(
    <div className="studio-overlay">
      {/* Clicking beside the dialog closes it; Escape does the same from the keyboard. */}
      <div className="studio-overlay__backdrop" onClick={onClose} role="presentation" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="studio-dialog studio-dialog--wide"
      >
        <h2 id={titleId} className="studio-dialog__title">
          {mode === 'add' ? 'Add a page' : 'Change template'}
        </h2>
        <TemplateGallery
          formatId={targetFormat}
          hiddenIds={hiddenIds}
          loading={!hiddenSettled}
          showBlank
          defaultSchemeId={pageScheme}
          currentTemplateId={heldTemplateId}
          onPick={pickTemplate}
          onPickBlank={pickBlank}
        />
        <PreviewHost />
        <div className="studio-dialog__actions">
          {mode === 'add' && onDuplicateCurrent ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onDuplicateCurrent();
                onClose();
              }}
            >
              Duplicate this page
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function registerStudioEditorShell(): void {
  registerEditorShell({
    tabs: [
      {
        tab: {
          id: AI_DRAFT_TAB_ID,
          icon: PiSparkle,
          label: 'AI draft',
          ariaLabel: 'AI draft: write the texts from a briefing',
        },
        // First, before the page's own tabs.
        insertAt: () => 0,
        isAvailable: ({ services }) => services.aiDraft !== undefined,
        Section: AiDraftSection,
      },
    ],
    pagePicker: { Picker: StudioPagePicker },
    Provider: BlockInsertProvider,
  });
}
