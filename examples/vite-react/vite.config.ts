// SPDX-License-Identifier: CC0-1.0
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // One React copy for the app and the editor, or hooks fail.
  resolve: { dedupe: ['react', 'react-dom'] },
});
