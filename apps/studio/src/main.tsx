// SPDX-License-Identifier: AGPL-3.0-only
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@ggraphic/ui/fonts.css';
import '@ggraphic/ui/tokens.css';
import '@ggraphic/ui/editor-bridge.css';
import '@ggraphic/ui/styles.css';
import '@ggraphic/editor/styles';
import './fonts';
import './styles.css';
import { App } from './App';
import { registerEditor } from './registerEditor';
import { trackFocusModality } from './ui/focusModality';

// Before anything renders: configs, commands and offscreen renders read these registers.
registerEditor();
trackFocusModality();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing in index.html');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
);
