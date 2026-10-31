/**
 * Shared Node-side runtime for the real-browser harnesses: esbuild the page
 * bundle + render worker, serve them (plus frontend/public for the TTS worker
 * and models) on 127.0.0.1, launch Chrome on a persistent profile, and
 * re-verify outputs with ffprobe/ffmpeg.
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../../../../..');
export const FRONTEND = path.join(REPO_ROOT, 'frontend');
const PUBLIC_DIR = path.join(FRONTEND, 'public');

const require = createRequire(path.join(FRONTEND, 'package.json'));
const esbuild = require('esbuild');
const { chromium } = require('@playwright/test');

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.wasm': 'application/wasm', '.json': 'application/json', '.map': 'application/json',
};

export function logger(prefix) {
  return (msg) => process.stdout.write(`[${prefix}] ${msg}\n`);
}

/** Bundle `<pageName>.ts` + the render worker into a temp dir with an index.html. */
export async function buildPage(pageName) {
  const outdir = fs.mkdtempSync(path.join(os.tmpdir(), `${pageName}-`));
  await esbuild.build({
    entryPoints: [path.join(__dirname, `${pageName}.ts`), path.join(__dirname, '../render-worker.ts')],
    bundle: true,
    format: 'esm',
    splitting: true,
    outdir,
    outbase: path.join(__dirname, '..'),
    absWorkingDir: FRONTEND,
    logLevel: 'warning',
    target: 'es2022',
  });
  fs.writeFileSync(
    path.join(outdir, 'index.html'),
    `<!doctype html><html><head><meta charset="utf-8"><title>${pageName}</title></head>` +
      `<body><script type="module" src="/harness/${pageName}.js"></script></body></html>`,
  );
  return outdir;
}

/** Static server for the bundle + public/, with PUT /artifact/<name> into `artifactsDir`. */
export function serve(buildDir, artifactsDir) {
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (req.method === 'PUT' && pathname.startsWith('/artifact/')) {
      const out = fs.createWriteStream(path.join(artifactsDir, path.basename(pathname)));
      req.pipe(out);
      out.on('finish', () => { res.writeHead(200); res.end('ok'); });
      out.on('error', (err) => { res.writeHead(500); res.end(String(err)); });
      return;
    }
    const rel = pathname === '/' ? '/index.html' : pathname;
    for (const root of [buildDir, PUBLIC_DIR]) {
      const file = path.join(root, rel);
      if (!file.startsWith(root)) continue;
      if (fs.existsSync(file) && fs.statSync(file).isFile()) {
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
        fs.createReadStream(file).pipe(res);
        return;
      }
    }
    res.writeHead(404);
    res.end('not found');
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}

/**
 * Launch Chrome on `profileDir`, open the page, wait for `readyGlobal`, run
 * `fn(page)`, then close (quits the browser process).
 */
export async function session({ profileDir, port, label, readyGlobal, consolePrefix, log }, fn) {
  let context;
  try {
    context = await chromium.launchPersistentContext(profileDir, { channel: 'chrome', headless: true });
  } catch (err) {
    log(`chrome channel unavailable (${err.message?.split('\n')[0]}); using bundled chromium`);
    context = await chromium.launchPersistentContext(profileDir, { headless: true });
  }
  const page = await context.newPage();
  page.on('console', (m) => {
    const t = m.text();
    if (t.startsWith(consolePrefix) || m.type() === 'error') log(`${label}: ${t}`);
  });
  page.on('pageerror', (e) => log(`${label} pageerror: ${e.message}`));
  try {
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
    await page.waitForFunction((g) => Boolean(window[g]), readyGlobal, { timeout: 30_000 });
    return await fn(page, context);
  } finally {
    await context.close().catch(() => {});
    log(`${label}: browser closed`);
  }
}

export const sha256File = (f) => createHash('sha256').update(fs.readFileSync(f)).digest('hex');

export function ffprobe(file) {
  return execFileSync('ffprobe', ['-v', 'error', '-show_format', '-show_streams', file], { encoding: 'utf8' });
}

/** ffprobe output minus fields that vary with encoded bytes. */
export const structural = (text) => text.split('\n').filter((l) => !/^(filename|bit_rate|size)=/.test(l)).join('\n');

/** Per-frame MD5 of the decoded video stream. */
export function decodedFrameMd5s(file) {
  const out = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-map', '0:v:0', '-f', 'framemd5', '-'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split(',').pop().trim());
}

export function decodedAudioMd5(file) {
  return execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-map', '0:a:0', '-f', 'md5', '-'], { encoding: 'utf8' }).trim();
}

export function countDiff(a, b, from, to) {
  let n = 0;
  for (let i = from; i < to; i++) if (a[i] !== b[i]) n++;
  return n;
}

export function freshProfile(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${name}-profile-`));
}
