// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The start page: a dark band with one prompt ("What do you want to tell?"),
 * the format as chips inside the prompt card and a few example prompts; below
 * it a compact row of the Studio's templates and all projects with a search.
 * Submitting the prompt creates a project, lets the AI write its texts and opens it.
 */
import { Button, ChipGroup, PromptComposer, PromptHero, Tile, TileList } from '@ggraphic/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useId, useState, type ReactNode } from 'react';
import { PiFile, PiQuotes, PiTextT, PiNumberOne } from 'react-icons/pi';

import { ApiError, type StudioConfig } from '../api/client';
import { DEFAULT_FORMAT, STUDIO_FORMATS, type StudioFormatId } from '../editor/document';
import { TEMPLATE_CATALOG } from '../editor/templates/catalog';
import {
  BLANK_TEMPLATE_ID,
  HEADLINE_TEMPLATE_ID,
  NUMBER_TEMPLATE_ID,
  QUOTE_TEMPLATE_ID,
  type StudioTemplateId,
} from '../editor/templates/ids';
import { PROJECTS_QUERY_KEY } from '../projects/projectsKey';
import { editorPath, navigate } from '../router';
import { useLoggedIn } from '../session/SessionContext';
import { PageShell } from '../ui/PageShell';
import { toast } from '../ui/toast';

import { AiPromptError, createFromPrompt, createFromTemplate } from './createFromPrompt';
import { ProjectGrid } from './ProjectGrid';

/** Invented, neutral examples. */
export const EXAMPLE_PROMPTS = [
  'Invite the neighbourhood to a summer street festival on Saturday afternoon',
  'Announce that the library now opens on Sundays',
  'A quote about why small steps matter',
  'Share that 120 volunteers planted 800 trees this spring',
] as const;

const TEMPLATE_ICONS: Record<StudioTemplateId, ReactNode> = {
  [BLANK_TEMPLATE_ID]: <PiFile aria-hidden />,
  [HEADLINE_TEMPLATE_ID]: <PiTextT aria-hidden />,
  [QUOTE_TEMPLATE_ID]: <PiQuotes aria-hidden />,
  [NUMBER_TEMPLATE_ID]: <PiNumberOne aria-hidden />,
};

const FORMAT_OPTIONS = STUDIO_FORMATS.map((f) => ({
  value: f.id,
  label: f.label,
  detail: f.size,
}));

const errorText = (err: unknown) =>
  err instanceof AiPromptError || err instanceof ApiError
    ? err.message
    : 'The project could not be created.';

export function StartPage({ config }: { config: StudioConfig | undefined }) {
  const queryClient = useQueryClient();
  const { organisation } = useLoggedIn();
  const [prompt, setPrompt] = useState('');
  const [formatId, setFormatId] = useState<StudioFormatId>(DEFAULT_FORMAT);
  const [busy, setBusy] = useState(false);
  const hintId = useId();
  const ai = config?.features.ai ?? false;

  const submit = async () => {
    const text = prompt.trim();
    if (!text || busy || !config) return;
    setBusy(true);
    try {
      const { projectId } = await createFromPrompt({
        organisationId: organisation.id,
        prompt: text,
        formatId,
        ai,
      });
      void queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
      navigate(editorPath(projectId));
    } catch (err) {
      // The prompt stays in the field: the user can try again or edit it.
      toast.error(errorText(err));
      setBusy(false);
    }
  };

  const startFromTemplate = async (templateId: StudioTemplateId, name: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const projectId = await createFromTemplate({
        organisationId: organisation.id,
        templateId,
        name,
        formatId,
      });
      void queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
      navigate(editorPath(projectId));
    } catch (err) {
      toast.error(errorText(err));
      setBusy(false);
    }
  };

  const submitLabel = busy ? (ai ? 'Writing your draft…' : 'Creating…') : 'Create';

  return (
    <PageShell flush>
      <PromptHero
        className="studio-start__hero"
        title="What do you want to tell?"
        footer={
          <>
            <p id={hintId} className="studio-start__hint" role={busy ? 'status' : undefined}>
              {busy && ai
                ? 'The AI is writing the texts. This can take up to a minute.'
                : ai
                  ? 'The AI writes headline and texts; you edit everything in the editor.'
                  : 'AI drafts are off: your text becomes the headline. To turn them on, set OPENAI_BASE_URL, OPENAI_API_KEY and OPENAI_MODEL in .env.'}
            </p>
            <ul className="studio-examples" aria-label="Example prompts">
              {EXAMPLE_PROMPTS.map((example) => (
                <li key={example}>
                  <Button
                    variant="inverse"
                    size="sm"
                    className="studio-example"
                    disabled={busy}
                    onClick={() => setPrompt(example)}
                  >
                    {example}
                  </Button>
                </li>
              ))}
            </ul>
          </>
        }
      >
        <PromptComposer
          label="Describe your graphic"
          submitLabel={submitLabel}
          submitDisabled={busy || !prompt.trim() || !config}
          busy={busy}
          maxLength={4000}
          value={prompt}
          placeholder="Describe your graphic: what it is about, for whom, and when"
          aria-describedby={hintId}
          disabled={busy}
          onChange={(e) => setPrompt(e.target.value)}
          onSubmit={() => void submit()}
          options={
            <ChipGroup
              legend="Format"
              name="start-format"
              options={FORMAT_OPTIONS}
              value={formatId}
              onChange={setFormatId}
              disabled={busy}
              size="sm"
            />
          }
        />
      </PromptHero>

      <div className="studio-start__body">
        <section
          className="studio-start__section studio-start__section--compact"
          aria-labelledby="templates-heading"
        >
          <div className="studio-start__head">
            <h2 id="templates-heading" className="studio-start__heading">
              Start from a template
            </h2>
            <p className="studio-muted">Opens in the format chosen above.</p>
          </div>
          <TileList layout="row" aria-label="Templates">
            {TEMPLATE_CATALOG.map((template) => (
              <li key={template.id}>
                <Tile
                  disabled={busy}
                  ratio="4 / 5"
                  media={
                    <span className="studio-template-icon" data-template={template.id}>
                      {TEMPLATE_ICONS[template.id]}
                    </span>
                  }
                  title={template.label}
                  meta={template.description}
                  onClick={() => void startFromTemplate(template.id, template.label)}
                />
              </li>
            ))}
          </TileList>
        </section>
        <ProjectGrid />
      </div>
    </PageShell>
  );
}
