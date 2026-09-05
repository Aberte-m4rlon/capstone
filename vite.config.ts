import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function localApiPlugin() {
  return {
    name: 'local-api-handler',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        if (req.url && req.url.startsWith('/api/auth/sms')) {
          try {
            const { default: handler } = await server.ssrLoadModule('/api/auth/sms.ts');
            let body = '';
            req.on('data', (chunk: any) => { body += chunk.toString(); });
            req.on('end', async () => {
              try {
                req.body = body ? JSON.parse(body) : {};
              } catch {
                req.body = {};
              }
              const vercelRes = {
                statusCode: 200,
                status(code: number) {
                  res.statusCode = code;
                  this.statusCode = code;
                  return this;
                },
                setHeader(name: string, value: string) {
                  res.setHeader(name, value);
                  return this;
                },
                json(obj: any) {
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify(obj));
                  return this;
                },
                end() {
                  res.end();
                  return this;
                },
              };
              await handler(req, vercelRes);
            });
            return;
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err?.message || 'Local API Error' }));
            return;
          }
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), localApiPlugin()],
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
