import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['@electric-sql/pglite'],
  },
  build: {
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Split TensorFlow.js into its own async chunk — only loaded when camera screening runs
          if (id.includes('@tensorflow/tfjs')) return 'tfjs';
        },
      },
    },
  },
});
