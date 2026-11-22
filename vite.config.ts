import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Port 6000 itself is blocked by Chrome, Edge and Firefox (ERR_UNSAFE_PORT), so we use 6001.
export default defineConfig({
  plugins: [react()],
  server: { port: 6001, strictPort: true, host: true },
  preview: { port: 6001, strictPort: true, host: true },
  build: {
    rollupOptions: {
      output: { manualChunks: { pdf: ['jspdf', 'jspdf-autotable'], supabase: ['@supabase/supabase-js'] } },
    },
  },
});
