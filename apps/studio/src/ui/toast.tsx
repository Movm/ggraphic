// SPDX-License-Identifier: AGPL-3.0-only
/**
 * A small toast queue for the app and for the editor's toast seam
 * (`registerToast`). One live region announces every message.
 */
import { type EditorToast, type EditorToastOptions } from '@ggraphic/editor/utils/editorToast';
import { useSyncExternalStore } from 'react';

interface ToastItem {
  id: number;
  message: string;
  tone: 'info' | 'error';
  action?: EditorToastOptions['action'];
}

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

function dismiss(id: number) {
  items = items.filter((item) => item.id !== id);
  emit();
}

function show(message: string, tone: ToastItem['tone'], options?: EditorToastOptions) {
  const id = nextId++;
  items = [...items, { id, message, tone, ...(options?.action ? { action: options.action } : {}) }];
  emit();
  setTimeout(() => dismiss(id), options?.duration ?? (tone === 'error' ? 6000 : 4000));
  return id;
}

export const toast: EditorToast = Object.assign(
  (message: string, options?: EditorToastOptions) => show(message, 'info', options),
  { error: (message: string, options?: EditorToastOptions) => show(message, 'error', options) }
);

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function Toaster() {
  const current = useSyncExternalStore(
    subscribe,
    () => items,
    () => items
  );
  return (
    <div className="studio-toasts" role="status" aria-live="polite">
      {current.map((item) => (
        <div key={item.id} className={`studio-toast studio-toast--${item.tone}`}>
          <span>{item.message}</span>
          {item.action ? (
            <button
              type="button"
              className="studio-link-button"
              onClick={() => {
                item.action?.onClick();
                dismiss(item.id);
              }}
            >
              {item.action.label}
            </button>
          ) : null}
          <button
            type="button"
            className="studio-icon-button"
            aria-label="Dismiss"
            onClick={() => dismiss(item.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
