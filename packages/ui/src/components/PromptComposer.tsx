// SPDX-License-Identifier: MPL-2.0
import { type FormEvent, type KeyboardEvent, type ReactNode, forwardRef, useId } from 'react';
import { type TextareaHTMLAttributes } from 'react';

import { cx } from '../cx.js';
import { ArrowUpIcon } from '../icons.js';
import { IconButton } from './IconButton.js';

export interface PromptComposerProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'onSubmit'
> {
  /** Visually hidden label of the text area; the placeholder is not a label. */
  label: string;
  /** Accessible name of the round submit button. */
  submitLabel?: string;
  submitDisabled?: boolean;
  /** Shown under the card contents on the left of the submit button, usually a <ChipGroup />. */
  options?: ReactNode;
  /** Marks the form busy for assistive technology. */
  busy?: boolean;
  /** Enter submits, Shift+Enter breaks the line (as in a chat). Default true. */
  submitOnEnter?: boolean;
  onSubmit?: (event?: FormEvent<HTMLFormElement>) => void;
  className?: string;
}

/** The big prompt card: a multi-line text area, options on the bottom left, a round submit on the right. */
export const PromptComposer = forwardRef<HTMLTextAreaElement, PromptComposerProps>(
  function PromptComposer(
    {
      label,
      submitLabel = 'Absenden',
      submitDisabled,
      options,
      busy,
      submitOnEnter = true,
      onSubmit,
      onKeyDown,
      id,
      rows = 3,
      className,
      ...rest
    },
    ref
  ) {
    const auto = useId();
    const inputId = id ?? auto;
    const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
      onKeyDown?.(event);
      if (
        submitOnEnter &&
        !event.defaultPrevented &&
        event.key === 'Enter' &&
        !event.shiftKey &&
        !event.nativeEvent.isComposing
      ) {
        event.preventDefault();
        event.currentTarget.form?.requestSubmit();
      }
    };
    return (
      <form
        className={cx('ui-composer', className)}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit?.(event);
        }}
        aria-busy={busy || undefined}
      >
        <label htmlFor={inputId} className="ui-visually-hidden">
          {label}
        </label>
        <textarea
          ref={ref}
          id={inputId}
          className="ui-composer__input"
          rows={rows}
          onKeyDown={keyDown}
          {...rest}
        />
        <div className="ui-composer__row">
          <div className="ui-composer__options">{options}</div>
          <IconButton
            type="submit"
            variant="solid"
            size="lg"
            label={submitLabel}
            icon={<ArrowUpIcon />}
            disabled={submitDisabled}
          />
        </div>
      </form>
    );
  }
);
