// SPDX-License-Identifier: AGPL-3.0-only
import { createRoot } from 'react-dom/client';

import '../src/styles/fonts.css';
import '../src/styles/tokens.css';
import '../src/styles/editor-bridge.css';
import '../src/styles/components.css';
import { Gallery } from './Gallery.js';

createRoot(document.getElementById('root')!).render(<Gallery />);
