// SPDX-License-Identifier: MPL-2.0
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { describe, expect, it } from 'vitest';

import { Gallery } from '../demo/Gallery.js';
import { Alert, ProgressSteps, TopNav, Wordmark } from './index.js';

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
