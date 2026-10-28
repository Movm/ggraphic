// SPDX-License-Identifier: MPL-2.0
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Button, Checkbox, PasswordField, PromptField, TextField } from './index.js';

describe('TextField', () => {
  it('links label, hint and error to the input', () => {
    render(<TextField label="E-Mail" hint="Wir melden uns." error="Ungültige Adresse" />);
    const input = screen.getByLabelText('E-Mail');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const described = input.getAttribute('aria-describedby')?.split(' ') ?? [];
    expect(described).toHaveLength(2);
    const texts = described.map((id) => document.getElementById(id)?.textContent);
    expect(texts).toEqual(['Wir melden uns.', 'Ungültige Adresse']);
  });

  it('is valid and undescribed without hint or error', () => {
    render(<TextField label="Name" />);
    const input = screen.getByLabelText('Name');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).not.toHaveAttribute('aria-describedby');
  });

  it('keeps a caller aria-describedby', () => {
    render(<TextField label="Name" aria-describedby="extra" error="x" />);
    expect(screen.getByLabelText('Name').getAttribute('aria-describedby')).toMatch(/^extra /);
  });
});

describe('PasswordField', () => {
  it('toggles visibility and the accessible name of the toggle', async () => {
    const user = userEvent.setup();
    render(<PasswordField label="Passwort" />);
    const input = screen.getByLabelText('Passwort');
    expect(input).toHaveAttribute('type', 'password');

    const show = screen.getByRole('button', { name: 'Passwort anzeigen' });
    expect(show).toHaveAttribute('aria-pressed', 'false');
    await user.click(show);

    expect(input).toHaveAttribute('type', 'text');
    const hide = screen.getByRole('button', { name: 'Passwort verbergen' });
    expect(hide).toHaveAttribute('aria-pressed', 'true');
    await user.click(hide);
    expect(input).toHaveAttribute('type', 'password');
  });

  it('does not submit the surrounding form when toggled', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <PasswordField label="Passwort" />
      </form>
    );
    await user.click(screen.getByRole('button', { name: 'Passwort anzeigen' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('Button', () => {
  it('defaults to type=button so it never submits a form by accident', () => {
    render(<Button>Los</Button>);
    expect(screen.getByRole('button', { name: 'Los' })).toHaveAttribute('type', 'button');
  });

  it('renders a link with the button look through asChild', () => {
    render(
      <Button asChild>
        <a href="/x">Hin</a>
      </Button>
    );
    const link = screen.getByRole('link', { name: 'Hin' });
    expect(link).toHaveClass('ui-button');
    expect(link).not.toHaveAttribute('type');
  });
});

describe('Checkbox', () => {
  it('toggles through its label and reports the change', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Checkbox label="AGB" onCheckedChange={onChange} />);
    await user.click(screen.getByText('AGB'));
    expect(onChange).toHaveBeenCalledWith(true);
    expect(screen.getByRole('checkbox', { name: 'AGB' })).toBeChecked();
  });

  it('wires its error message', () => {
    render(<Checkbox label="AGB" error="Pflichtfeld" />);
    const box = screen.getByRole('checkbox', { name: 'AGB' });
    expect(box).toHaveAttribute('aria-invalid', 'true');
    expect(document.getElementById(box.getAttribute('aria-describedby') ?? '')).toHaveTextContent(
      'Pflichtfeld'
    );
  });
});

describe('PromptField', () => {
  it('labels the input and submits through the named button', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    render(<PromptField label="Was ist passiert?" submitLabel="Gestalten" onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText('Was ist passiert?'), 'Hallo');
    await user.click(screen.getByRole('button', { name: 'Gestalten' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
