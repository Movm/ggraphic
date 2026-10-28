// SPDX-License-Identifier: MPL-2.0
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { axe } from 'vitest-axe';
import { describe, expect, it, vi } from 'vitest';

import { Gallery } from '../demo/Gallery.js';
import {
  Alert,
  Avatar,
  ChipGroup,
  ProgressSteps,
  PromptComposer,
  PromptHero,
  Tile,
  TileList,
  TopNav,
  Wordmark,
} from './index.js';

describe('Alert', () => {
  it('announces danger assertively and the rest politely', () => {
    render(
      <>
        <Alert tone="danger">Kaputt</Alert>
        <Alert tone="info">Hinweis</Alert>
      </>
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Kaputt');
    expect(screen.getByRole('status')).toHaveTextContent('Hinweis');
  });
});

describe('ProgressSteps', () => {
  it('marks done, current and todo steps', () => {
    render(<ProgressSteps total={3} current={1} label="Schritt 2 von 3" />);
    const bars = screen.getAllByRole('listitem');
    expect(bars.map((b) => b.getAttribute('data-state'))).toEqual(['done', 'current', 'todo']);
    expect(bars[1]).toHaveAttribute('aria-current', 'step');
  });
});

describe('TopNav', () => {
  it('is a named landmark and marks the current link', () => {
    render(
      <TopNav brand={<Wordmark />} links={[{ label: 'Vorlagen', href: '/v', current: true }]} />
    );
    expect(screen.getByRole('navigation', { name: 'Hauptnavigation' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Vorlagen' })).toHaveAttribute('aria-current', 'page');
  });
});

describe('Gallery', () => {
  it('has no axe violations', async () => {
    const { container } = render(<Gallery />);
    // Colour contrast needs real layout and stylesheets; it is measured separately (see README).
    const results = await axe(container, {
      rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
    });
    expect(results).toHaveNoViolations();
  });
});

describe('PromptComposer', () => {
  function Harness({ onSubmit }: { onSubmit: () => void }) {
    const [format, setFormat] = useState('a');
    return (
      <PromptComposer
        label="Beschreibung"
        submitLabel="Gestalten"
        onSubmit={onSubmit}
        options={
          <ChipGroup
            legend="Format"
            value={format}
            onChange={setFormat}
            options={[
              { value: 'a', label: 'Plakat' },
              { value: 'b', label: 'Story', detail: '9:16' },
            ]}
          />
        }
      />
    );
  }

  it('submits on Enter, keeps Shift+Enter for a new line', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<Harness onSubmit={onSubmit} />);
    const box = screen.getByRole('textbox', { name: 'Beschreibung' });
    await user.type(box, 'Hallo{Shift>}{Enter}{/Shift}Welt');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(box).toHaveValue('Hallo\nWelt');
    await user.keyboard('{Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Gestalten' }));
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it('does not submit on Enter when submitOnEnter is off', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<PromptComposer label="Text" submitOnEnter={false} onSubmit={onSubmit} />);
    await user.type(screen.getByRole('textbox', { name: 'Text' }), 'a{Enter}');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows the chips as one named radio group', async () => {
    const user = userEvent.setup();
    render(<Harness onSubmit={() => {}} />);
    const group = screen.getByRole('group', { name: 'Format' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Plakat' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: /Story/ }));
    expect(screen.getByRole('radio', { name: /Story/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Plakat' })).not.toBeChecked();
  });
});

describe('Avatar', () => {
  it('names the account and shows its initial', () => {
    render(<Avatar name="anna" label="Konto" />);
    expect(screen.getByRole('img', { name: 'Konto: anna' })).toHaveTextContent('A');
  });
});

describe('Tile', () => {
  it('is a link named by title and meta', () => {
    render(
      <TileList aria-label="Zuletzt">
        <li>
          <Tile href="/p/1" media={<span />} title="Aktionstag" meta="gestern" />
        </li>
      </TileList>
    );
    expect(screen.getByRole('link', { name: 'Aktionstag gestern' })).toHaveAttribute(
      'href',
      '/p/1'
    );
  });
});

describe('Tile as button', () => {
  it('acts when it has no href', async () => {
    const onClick = vi.fn();
    render(<Tile media={<span />} title="Quote" onClick={onClick} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Quote' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('PromptHero', () => {
  it('renders the question as the page heading', () => {
    render(
      <PromptHero title="Was willst du erzählen?">
        <span>Composer</span>
      </PromptHero>
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Was willst du erzählen?');
  });
});
