// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The Studio's part of the editor shell (`registerEditorShell`): the "AI draft"
 * document tab and the page picker behind "Add page" and "Change template".
 */
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

import { ApiError } from '../api/client';
import { toast } from '../ui/toast';

import { draftDeckOps } from './aiDraft';
import { DEFAULT_FORMAT, formatSize } from './document';
import { templatesFor, type CatalogEntry } from './templates/catalog';
import { BLANK_TEMPLATE_ID, FREE_PAGE_CONFIG_ID, isStudioTemplateId } from './templates/ids';
import { templatePageState } from './templates/instantiate';

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

function errorText(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'ai_timeout') return 'The AI took too long. Try a shorter briefing.';
    if (err.code === 'ai_disabled') return 'AI is not available on this server.';
    return err.message;
  }
  return 'The draft could not be created.';
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
      setError(errorText(err));
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
  const options = [
    { id: BLANK_TEMPLATE_ID, label: 'Blank', description: 'An empty page on a solid ground' },
    ...templatesFor(formatId ?? DEFAULT_FORMAT).map((e) => ({
      id: e.id,
      label: e.title,
      description: e.description,
    })),
  ];
  const select = (id: string) => {
    const entry = templatesFor(formatId ?? DEFAULT_FORMAT).find((e) => e.id === id);
    if (mode === 'add' && addPage) {
      const state = entry ? templatePageState(entry, formatId ?? DEFAULT_FORMAT) : null;
      if (entry && !state) {
        // Say so instead of adding a blank page the user did not ask for.
        toast.error('This template cannot be placed on the current format and brand.');
        return;
      }
      void addPage(FREE_PAGE_CONFIG_ID, false, state ?? undefined);
    } else if (mode === 'replace') {
      // Every page is a free page whose config stays, so the new state travels with the choice.
      const state = id === BLANK_TEMPLATE_ID ? blankPageState(currentState) : placed(entry);
      if (!state) {
        toast.error('This template cannot be placed on the current format and brand.');
        return;
      }
      onSelectTemplate(FREE_PAGE_CONFIG_ID, state);
    } else if (isStudioTemplateId(id)) {
      onSelectTemplate(id);
    }
  };
  const placed = (entry: CatalogEntry | undefined) =>
    entry ? templatePageState(entry, formatId ?? DEFAULT_FORMAT) : null;
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
        className="studio-dialog"
      >
        <h2 id={titleId} className="studio-dialog__title">
          {mode === 'add' ? 'Add a page' : 'Change template'}
        </h2>
        <ul className="studio-template-list">
          {options.map((template) => (
            <li key={template.id}>
              <button
                type="button"
                className="studio-template-option"
                aria-current={template.id === heldTemplateId ? 'true' : undefined}
                onClick={() => {
                  select(template.id);
                  onClose();
                }}
              >
                <strong>{template.label}</strong>
                <span>{template.description}</span>
              </button>
            </li>
          ))}
        </ul>
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
  });
}
