/**
 * Static server for the Next.js export (out/) mirroring the production
 * .htaccess behaviour the E2E cares about:
 *  - COOP/COEP headers on every response (cross-origin isolation, SAB)
 *  - real files served as-is; directories resolve to index.html;
 *    /route → route.html fallback; everything else → /index.html (SPA)
 * Usage: node e2e/serve.mjs [port]
 */
import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'out');
const PORT = Number(process.argv[2]) || 8321;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain',
  '.bin': 'application/octet-stream',
  '.onnx': 'application/octet-stream',
  '.glb': 'model/gltf-binary',
  '.woff2': 'font/woff2',
};

function resolvePath(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split('?')[0])).replace(/^\/+/, '');
  const full = join(OUT, clean);
  if (!full.startsWith(OUT)) return null;
  if (existsSync(full)) {
    const st = statSync(full);
    if (st.isDirectory()) {
      const idx = join(full, 'index.html');
      return existsSync(idx) ? idx : null;
    }
    return full;
  }
  if (existsSync(`${full}.html`)) return `${full}.html`;
  return join(OUT, 'index.html');
}

http
  .createServer((req, res) => {
    const file = resolvePath(req.url || '/');
    if (!file || !existsSync(file)) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.setHeader('Content-Type', MIME[extname(file)] || 'application/octet-stream');
    createReadStream(file).pipe(res);
  })
  .listen(PORT, '127.0.0.1', () => {
    console.log(`e2e static server on http://127.0.0.1:${PORT} (root: ${OUT})`);
  });
