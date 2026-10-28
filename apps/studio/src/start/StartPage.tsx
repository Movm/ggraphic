// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The start page: one prompt in the middle ("What do you want to create?"),
 * the format under it, a few example prompts, and the recent projects below.
 * Submitting creates a project, lets the AI write its texts and opens it.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type FormEvent, type KeyboardEvent } from 'react';
import { PiArrowRight } from 'react-icons/pi';

import { api, ApiError, type StudioConfig } from '../api/client';
import { DEFAULT_FORMAT, STUDIO_FORMATS, type StudioFormatId } from '../editor/document';
import { PROJECTS_QUERY_KEY, projectsKey } from '../pages/ProjectListPage';
import { editorPath, navigate, PROJECTS_PATH } from '../router';
import { useLoggedIn } from '../session/SessionContext';
import { AccountBar } from '../ui/AccountBar';
import { toast } from '../ui/toast';

import { createFromPrompt } from './createFromPrompt';

/** Invented, neutral examples. */
export const EXAMPLE_PROMPTS = [
  'Invite the neighbourhood to a summer street festival on Saturday afternoon',
  'Announce that the library now opens on Sundays',
  'A quote about why small steps matter',
  'Share that 120 volunteers planted 800 trees this spring',
] as const;

const RECENT_COUNT = 6;

const errorText = (err: unknown) =>
  err instanceof ApiError ? err.message : 'The project could not be created.';

export function StartPage({ config }: { config: StudioConfig | undefined }) {
  const queryClient = useQueryClient();
  const { organisation } = useLoggedIn();
  const [prompt, setPrompt] = useState('');
  const [formatId, setFormatId] = useState<StudioFormatId>(DEFAULT_FORMAT);
  const [busy, setBusy] = useState(false);
  const promptId = useId();
  const hintId = useId();
  const ai = config?.features.ai ?? false;

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    const text = prompt.trim();
    if (!text || busy || !config) return;
    setBusy(true);
    try {
      const { projectId, draftError } = await createFromPrompt({
        organisationId: organisation.id,
        prompt: text,
        formatId,
        ai,
      });
      void queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
      if (draftError) toast.error(`${draftError} The template is ready for your own text.`);
      navigate(editorPath(projectId));
    } catch (err) {
      toast.error(errorText(err));
      setBusy(false);
    }
  };

  // Enter sends, Shift+Enter makes a new line, as in a chat composer.
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <main className="studio-start">
      <header className="studio-start__bar">
        <span className="studio-logo">ggraphic Studio</span>
        <AccountBar />
      </header>

      <section className="studio-start__hero" aria-labelledby={promptId + '-title'}>
        <h1 id={promptId + '-title'} className="studio-start__title">
          What do you want to create?
        </h1>
        <form className="studio-composer" onSubmit={(e) => void submit(e)} aria-busy={busy}>
          <label htmlFor={promptId} className="studio-visually-hidden">
            Describe your graphic
          </label>
          <textarea
            id={promptId}
            className="studio-composer__input"
            rows={3}
            maxLength={4000}
            value={prompt}
            placeholder="Describe your graphic: what it is about, for whom, and when"
            aria-describedby={hintId}
            disabled={busy}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <div className="studio-composer__row">
            <fieldset className="studio-chips" disabled={busy}>
              <legend className="studio-visually-hidden">Format</legend>
              {STUDIO_FORMATS.map((format) => (
                <label key={format.id} className="studio-chip">
                  <input
                    type="radio"
                    name="start-format"
                    value={format.id}
                    checked={formatId === format.id}
                    onChange={() => setFormatId(format.id)}
                  />
                  <span>
                    {format.label} <small>{format.size}</small>
                  </span>
                </label>
              ))}
            </fieldset>
            <button
              type="submit"
              className="studio-composer__send"
              disabled={busy || !prompt.trim() || !config}
            >
              {busy ? (ai ? 'Writing your draft…' : 'Creating…') : 'Create'}
              {busy ? null : <PiArrowRight aria-hidden />}
            </button>
          </div>
        </form>
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
              <button
                type="button"
                className="studio-example"
                disabled={busy}
                onClick={() => setPrompt(example)}
              >
                {example}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <RecentProjects />
    </main>
  );
}

function RecentProjects() {
  const { organisation } = useLoggedIn();
  const projects = useQuery({
    queryKey: projectsKey(organisation.id),
    queryFn: () => api.listProjects(organisation.id),
  });
  const recent = projects.data?.slice(0, RECENT_COUNT) ?? [];
  if (recent.length === 0) return null;
  return (
    <section className="studio-recent" aria-labelledby="recent-heading">
      <div className="studio-recent__head">
        <h2 id="recent-heading" className="studio-section__title">
          Recent projects
        </h2>
        <a
          className="studio-link"
          href={PROJECTS_PATH}
          onClick={(e) => {
            e.preventDefault();
            navigate(PROJECTS_PATH);
          }}
        >
          Show all
        </a>
      </div>
      <ul className="studio-recent__list">
        {recent.map((project) => (
          <li key={project.id}>
            <a
              className="studio-recent__item"
              href={editorPath(project.id)}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                e.preventDefault();
                navigate(editorPath(project.id));
              }}
            >
              <span className="studio-recent__thumb">
                {project.thumbnailUrl ? <img src={project.thumbnailUrl} alt="" /> : null}
              </span>
              <span className="studio-recent__name">{project.name}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
