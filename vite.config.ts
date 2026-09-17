import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function localApiPlugin() {
  return {
    name: 'local-api-handler',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        if (
          req.url &&
          (req.url.startsWith('/api/auth/sms') ||
            req.url.startsWith('/api/public-animal') ||
            req.url.startsWith('/api/gemini/detect-objects') ||
            req.url.startsWith('/api/gemini/animal-scan') ||
            req.url.startsWith('/api/ai/animal-scan'))
        ) {
          try {
            let modulePath = '/api/auth/sms.ts';
            if (req.url.startsWith('/api/public-animal')) {
              modulePath = '/api/public-animal.ts';
            } else if (req.url.startsWith('/api/gemini/detect-objects')) {
              modulePath = '/api/gemini/detect-objects.ts';
            } else if (req.url.startsWith('/api/gemini/animal-scan')) {
              modulePath = '/api/gemini/animal-scan.ts';
            } else if (req.url.startsWith('/api/ai/animal-scan')) {
              modulePath = '/api/gemini/animal-scan.ts';
            }
            const { default: handler } = await server.ssrLoadModule(modulePath);
            let body = '';
            req.on('data', (chunk: any) => { body += chunk.toString(); });
            req.on('end', async () => {
              try {
                req.body = body ? JSON.parse(body) : {};
              } catch {
                req.body = {};
              }
              // Parse query parameters
              const urlObj = new URL(req.url, 'http://localhost');
              req.query = Object.fromEntries(urlObj.searchParams.entries());

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
  },
});
