// SPDX-License-Identifier: CC0-1.0
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import './page.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
