/**
 * WS-4 C-M2 P0 (expansion) unit gate — the built bundle must contain NO model
 * download that routes through the server. Model weights stream browser → CDN
 * directly (Law L2); the dead `/api/models/download` proxy that 404'd on the
 * static export must be gone from the shipped JS.
 *
 * Fails (exit 1) if any built chunk references `api/models/download`, or if the
 * legacy proxy symbols (`fetchModelViaProxy`, `Proxy returned`) survive, or if
 * the old TRUNCATED WebLLM error survives / the new FULL error is missing (the
 * "never truncate the error" ruling, C-M2 P0 expansion point 2).
 *
 * Run from frontend/:  node scripts/check-no-proxy-urls.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '..', 'out');
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ART = path.join(REPO_ROOT, 'artifacts', 'model-download-p0');

// Any model fetch that goes through our origin's /api is a server-in-the-path
// violation. Plus the old truncated WebLLM error must not survive. These are the
// exact strings that would appear if the proxy/helpers or the old copy remained.
const BANNED = [
  'api/models/download',
  'fetchModelViaProxy',
  'Proxy returned ',
  'No compatible model found', // old truncated WebLLM error — must be gone
];
// The new full, honest WebLLM failure copy must be present in the bundle.
const REQUIRED = ['Could not load an on-device AI model'];

function walk(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (/\.(js|mjs)$/.test(entry.name)) files.push(full);
  }
  return files;
}

function main() {
  if (!fs.existsSync(OUT)) {
    console.error(`[no-proxy] build output not found at ${OUT} — run "next build" first`);
    process.exit(1);
  }
  fs.mkdirSync(ART, { recursive: true });

  const files = walk(OUT);
  const hits = [];
  const foundRequired = new Set();
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    for (const token of BANNED) {
      if (text.includes(token)) hits.push({ file: path.relative(OUT, f), token });
    }
    for (const token of REQUIRED) {
      if (text.includes(token)) foundRequired.add(token);
    }
  }
  const missingRequired = REQUIRED.filter((t) => !foundRequired.has(t));

  const report = {
    scannedFiles: files.length,
    banned: BANNED,
    required: REQUIRED,
    hits,
    missingRequired,
    clean: hits.length === 0 && missingRequired.length === 0,
  };
  fs.writeFileSync(path.join(ART, 'no-proxy-urls.json'), JSON.stringify(report, null, 2));

  if (hits.length > 0 || missingRequired.length > 0) {
    if (hits.length > 0) {
      console.error(`[no-proxy] FAIL — ${hits.length} banned reference(s) in the bundle:`);
      for (const h of hits) console.error(`  ${h.file}: "${h.token}"`);
    }
    if (missingRequired.length > 0) {
      console.error(`[no-proxy] FAIL — required string(s) missing from bundle: ${missingRequired.map((s) => `"${s}"`).join(', ')}`);
    }
    process.exit(1);
  }
  console.log(`[no-proxy] PASS — scanned ${files.length} bundle files: no server-in-the-model-path or truncated-error references; full honest error present.`);
}

main();
