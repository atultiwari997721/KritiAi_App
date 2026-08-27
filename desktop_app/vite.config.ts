import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 9716,
    strictPort: true,
    host: true,
    allowedHosts: true
  },
  preview: {
    port: 9716,
    strictPort: true,
    host: true,
    allowedHosts: true
  }
});
