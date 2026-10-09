#!/usr/bin/env node
/**
 * Contentine Create — local model mirror (de-flakes the download-all deploy gate).
 *
 * Per deploy-lane-fixes/MODEL_MIRROR_PLAN.md. Sources the ~3-4 GB of model
 * weights from a FAST, LOCAL, DETERMINISTIC mirror instead of the public
 * HuggingFace/MLC CDN, WITHOUT bypassing the browser download→store→READY
 * pipeline the gate protects (no IndexedDB pre-seed — Law: exercise the real
 * path). The mirror lives on THIS machine (never the AWS box — C-03).
 *
 * Two subcommands:
 *   seed  [mirrorDir]        Server-side, resumable download of every byte the
 *                            model registry requests into <mirrorDir>/<host>/<path>,
 *                            preserving the CDN path layout. Robust retry/backoff,
 *                            skips files already present. Run until it completes
 *                            once; re-runs are near-instant.
 *   serve [port] [mirrorDir] Caching reverse-proxy static server (default :8099)
 *                            with permissive CORS, CORP (loadable under COEP
 *                            require-corp), and HTTP Range support. Serves seeded
 *                            files from disk; on a miss it fetches upstream once,
 *                            caches, and serves (so `serve` alone also works, just
 *                            slower on the first cold request).
 *
 * Upstreams mirrored (the only two hosts the app fetches model bytes from):
 *   - huggingface.co            all weight shards + configs (managed + WebLLM/MLC)
 *   - raw.githubusercontent.com WebLLM model_lib .wasm files
 * HF `resolve` URLs 302-redirect to cdn-lfs / xet hosts; the mirror follows
 * those redirects server-side, so the browser only ever talks to the mirror.
 *
 * Run from repo root.
 */

import { createHash } from 'node:crypto';
import {
  existsSync, mkdirSync, createReadStream, createWriteStream, statSync, renameSync, rmSync, readFileSync,
} from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createHttpsServer } from 'node:https';
import { spawnSync } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FRONTEND = join(ROOT, 'frontend');
const DEFAULT_MIRROR = join(ROOT, 'mirror');
const ARTIFACTS_TS = join(FRONTEND, 'src/lib/model-artifacts.ts');
const TLS_DIR = join(ROOT, '.mirror-tls');

/**
 * The mirror serves HTTPS so the E2E can point the browser at it with
 * `route.continue({ url })` (Playwright forbids an https→http origin switch on
 * continue). The browser then STREAMS bytes directly from the mirror with
 * backpressure — exactly like a real CDN — instead of a multi-GB response being
 * round-tripped through Playwright's CDP fulfill, which crashes the context.
 * A self-signed localhost cert is generated once; the E2E sets ignoreHTTPSErrors.
 */
function ensureCert() {
  const cert = join(TLS_DIR, 'cert.pem');
  const key = join(TLS_DIR, 'key.pem');
  if (existsSync(cert) && existsSync(key)) return { cert: readFileSync(cert), key: readFileSync(key) };
  mkdirSync(TLS_DIR, { recursive: true });
  const r = spawnSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '3650',
    '-keyout', key, '-out', cert, '-subj', '/CN=localhost',
    '-addext', 'subjectAltName=IP:127.0.0.1,DNS:localhost',
  ], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`openssl cert generation failed: ${r.stderr}`);
  return { cert: readFileSync(cert), key: readFileSync(key) };
}

/** The catalog's WebLLM models (engineModelId → mlc-ai HF repo). See model-catalog.ts. */
const WEBLLM_MODELS = [
  'Llama-3.2-3B-Instruct-q4f16_1-MLC',
  'Llama-3.2-1B-Instruct-q4f16_1-MLC',
  'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
];

const ALLOWED_HOSTS = new Set(['huggingface.co', 'raw.githubusercontent.com']);

const log = (...a) => console.log(...a);
const human = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${(n / 1e3).toFixed(0)} KB`);

// ── URL enumeration ────────────────────────────────────────────────────────

/** Parse the generated manifest (JSON.stringify'd object) without importing TS. */
async function readManagedArtifacts() {
  const src = await readFile(ARTIFACTS_TS, 'utf8');
  const eq = src.indexOf('=', src.indexOf('MODEL_ARTIFACTS'));
  const obj = src.slice(eq + 1, src.lastIndexOf(';')).trim();
  return JSON.parse(obj); // { id: { repo, revision, artifacts:[{path,...}] } }
}

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

/** Ask WebLLM's own prebuiltAppConfig (in frontend/node_modules) for model + model_lib URLs. */
function webllmConfig() {
  const code =
    'import { prebuiltAppConfig } from "@mlc-ai/web-llm";' +
    `const ids=${JSON.stringify(WEBLLM_MODELS)};` +
    'const out={};for(const id of ids){const m=prebuiltAppConfig.model_list.find(x=>x.model_id===id);' +
    'if(!m)throw new Error("appConfig missing "+id);out[id]={model:m.model,model_lib:m.model_lib};}' +
    'process.stdout.write(JSON.stringify(out));';
  const r = spawnSync('node', ['--input-type=module', '-e', code], { cwd: FRONTEND, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`webllm appConfig read failed: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

/** Every upstream URL the app fetches, across both hosts. */
async function enumerateUrls() {
  const urls = new Set();

  // Managed (kokoro/transformers): exact pinned-revision artifacts.
  const managed = await readManagedArtifacts();
  for (const { repo, revision, artifacts } of Object.values(managed)) {
    for (const a of artifacts) urls.add(`https://huggingface.co/${repo}/resolve/${revision}/${a.path}`);
  }

  // WebLLM/MLC: full repo tree at main + the model_lib wasm.
  const cfg = webllmConfig();
  for (const id of WEBLLM_MODELS) {
    const repo = `mlc-ai/${id}`;
    const tree = await fetchJson(`https://huggingface.co/api/models/${repo}/tree/main?recursive=true`);
    for (const f of tree) if (f.type === 'file') urls.add(`https://huggingface.co/${repo}/resolve/main/${f.path}`);
    urls.add(cfg[id].model_lib); // raw.githubusercontent.com/.../*.wasm
  }
  return [...urls];
}

// ── seed ─────────────────────────────────────────────────────────────────────

function localPathFor(mirrorDir, urlStr) {
  const u = new URL(urlStr);
  if (!ALLOWED_HOSTS.has(u.hostname)) throw new Error(`refusing to mirror unlisted host: ${u.hostname}`);
  return join(mirrorDir, u.hostname, decodeURIComponent(u.pathname).replace(/^\/+/, ''));
}

async function fetchWithRetry(url, init = {}, tries = 4) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, init);
      if (r.status >= 400 && r.status < 500 && r.status !== 429) return r; // don't retry 4xx (except 429)
      if (r.ok || r.status === 206) return r;
      const ra = Number(r.headers.get('retry-after'));
      const wait = Number.isFinite(ra) && ra > 0 ? ra * 1000 : Math.min(30_000, 1000 * 2 ** i);
      log(`  ${r.status} on ${url} — retry in ${Math.round(wait / 1000)}s`);
      await new Promise((res) => setTimeout(res, wait));
    } catch (e) {
      lastErr = e;
      const wait = Math.min(30_000, 1000 * 2 ** i);
      log(`  fetch error on ${url} (${e.message}) — retry in ${Math.round(wait / 1000)}s`);
      await new Promise((res) => setTimeout(res, wait));
    }
  }
  throw lastErr ?? new Error(`exhausted retries: ${url}`);
}

async function downloadTo(url, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  const tmp = `${dest}.part-${process.pid}`;
  const r = await fetchWithRetry(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  await pipeline(Readable.fromWeb(r.body), createWriteStream(tmp));
  renameSync(tmp, dest);
  return statSync(dest).size;
}

async function seed(mirrorDir) {
  log(`[mirror] seeding → ${mirrorDir}`);
  const urls = await enumerateUrls();
  log(`[mirror] ${urls.length} artifacts to mirror across ${ALLOWED_HOSTS.size} hosts`);
  let have = 0, got = 0, bytes = 0;
  for (const url of urls) {
    const dest = localPathFor(mirrorDir, url);
    if (existsSync(dest) && statSync(dest).size > 0) { have++; continue; }
    const size = await downloadTo(url, dest);
    got++; bytes += size;
    log(`  ✓ ${new URL(url).pathname}  ${human(size)}`);
  }
  log(`[mirror] seed complete: ${got} downloaded (${human(bytes)}), ${have} already present, ${urls.length} total`);
}

// ── serve ────────────────────────────────────────────────────────────────────

const MIME = {
  '.json': 'application/json', '.wasm': 'application/wasm', '.bin': 'application/octet-stream',
  '.onnx': 'application/octet-stream', '.txt': 'text/plain', '.md': 'text/plain',
};
const mimeFor = (p) => MIME[p.slice(p.lastIndexOf('.'))] ?? 'application/octet-stream';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Expose-Headers': '*',
    // Loadable as a subresource on a COEP: require-corp origin.
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Accept-Ranges': 'bytes',
  };
}

/** Reconstruct the upstream URL from a mirror request path /<host>/<path>. */
function upstreamFor(reqUrl) {
  const u = new URL(reqUrl, 'http://localhost');
  const parts = decodeURIComponent(u.pathname).replace(/^\/+/, '').split('/');
  const host = parts.shift();
  if (!ALLOWED_HOSTS.has(host)) return null;
  return { host, upstream: `https://${host}/${parts.join('/')}${u.search}`, local: join(parts.join('/')) };
}

async function ensureCached(mirrorDir, host, localRel, upstream) {
  const dest = join(mirrorDir, host, localRel);
  if (existsSync(dest) && statSync(dest).size > 0) return dest;
  log(`[mirror] miss → fetching ${upstream}`);
  await downloadTo(upstream, dest);
  return dest;
}

function serveFile(req, res, filePath) {
  const size = statSync(filePath).size;
  const headers = { ...corsHeaders(), 'Content-Type': mimeFor(filePath) };
  const range = req.headers.range;
  const m = range && /^bytes=(\d*)-(\d*)$/.exec(range);
  if (m) {
    let start = m[1] === '' ? 0 : Number(m[1]);
    let end = m[2] === '' ? size - 1 : Number(m[2]);
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || end >= size) {
      res.writeHead(416, { ...headers, 'Content-Range': `bytes */${size}` });
      return res.end();
    }
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
    if (req.method === 'HEAD') return res.end();
    return createReadStream(filePath, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...headers, 'Content-Length': size });
  if (req.method === 'HEAD') return res.end();
  return createReadStream(filePath).pipe(res);
}

function serve(port, mirrorDir) {
  mkdirSync(mirrorDir, { recursive: true });
  const server = createHttpsServer(ensureCert(), async (req, res) => {
    try {
      if (req.method === 'OPTIONS') { res.writeHead(204, corsHeaders()); return res.end(); }
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, corsHeaders()); return res.end(); }
      if (req.url === '/healthz') { res.writeHead(200, corsHeaders()); return res.end('ok'); }
      const info = upstreamFor(req.url);
      if (!info) { res.writeHead(400, corsHeaders()); return res.end('unlisted host'); }
      const filePath = await ensureCached(mirrorDir, info.host, info.local, info.upstream);
      serveFile(req, res, filePath);
    } catch (e) {
      log(`[mirror] 502 ${req.url}: ${e.message}`);
      if (!res.headersSent) res.writeHead(502, corsHeaders());
      res.end(String(e.message));
    }
  });
  server.listen(port, '127.0.0.1', () => log(`[mirror] serving ${mirrorDir} on https://127.0.0.1:${port} (hosts: ${[...ALLOWED_HOSTS].join(', ')})`));
  return server;
}

// ── CLI ────────────────────────────────────────────────────────────────────

const [cmd, a1, a2] = process.argv.slice(2);
if (cmd === 'seed') {
  await seed(resolve(a1 || DEFAULT_MIRROR));
} else if (cmd === 'serve') {
  serve(Number(a1) || 8099, resolve(a2 || DEFAULT_MIRROR));
} else {
  console.error('usage: model-mirror.mjs seed [mirrorDir] | serve [port] [mirrorDir]');
  process.exit(2);
}
