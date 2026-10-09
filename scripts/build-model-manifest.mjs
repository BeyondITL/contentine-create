#!/usr/bin/env node
/**
 * Contentine Create — model artifact manifest builder.
 *
 * Regenerates `frontend/src/lib/model-artifacts.ts` from the HuggingFace API:
 * for every catalog model whose engine we download ourselves (kokoro-js,
 * transformersjs), list the EXACT artifacts the engine fetches at runtime,
 * with pinned revision, byte size, and SHA-256 per artifact.
 *
 * - LFS files: SHA-256 comes from HF's authoritative LFS records (no download).
 * - Non-LFS files (small configs/tokenizers): downloaded here and hashed.
 * - Revision is pinned to the repo's current main commit at build time, so
 *   downloads are reproducible even if upstream main moves.
 *
 * Run from repo root:  node scripts/build-model-manifest.mjs
 * Reproducible in CI or any clean environment (no local state).
 */

import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../frontend/src/lib/model-artifacts.ts');

/**
 * Per-model artifact selectors. `files` are exact repo paths; `globs` are
 * prefix+suffix matches against the repo tree (for voices/*.bin).
 *
 * These lists mirror what each engine ACTUALLY fetches:
 *  - transformers.js ASR pipeline (browser => device 'wasm' => dtype 'q8'):
 *    config.json, generation_config.json, preprocessor_config.json,
 *    tokenizer.json, tokenizer_config.json,
 *    onnx/encoder_model_quantized.onnx, onnx/decoder_model_merged_quantized.onnx
 *  - kokoro-js (dtype 'q8', device 'wasm'): config.json, tokenizer.json,
 *    tokenizer_config.json, onnx/model_quantized.onnx + voices/*.bin
 *    (voices are fetched lazily per voice into the 'kokoro-voices' cache).
 * The adopt-folder E2E asserts zero network fetches for present artifacts,
 * which catches any drift between these lists and engine behavior.
 */
const MODELS = [
  {
    id: 'kokoro-82m',
    repo: 'onnx-community/Kokoro-82M-v1.0-ONNX',
    files: ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'onnx/model_quantized.onnx'],
    globs: [{ prefix: 'voices/', suffix: '.bin' }],
  },
  {
    // Timestamped Kokoro export — emits a per-phoneme `durations` output the base
    // repo lacks (drives real cartoon lip-sync). Same weights; model_quantized.onnx
    // differs, everything else (tokenizer/config/voices) is byte-identical to base.
    id: 'kokoro-82m-timestamped',
    repo: 'onnx-community/Kokoro-82M-v1.0-ONNX-timestamped',
    files: ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'onnx/model_quantized.onnx'],
    globs: [{ prefix: 'voices/', suffix: '.bin' }],
  },
  {
    id: 'whisper-tiny',
    repo: 'Xenova/whisper-tiny',
    files: [
      'config.json', 'generation_config.json', 'preprocessor_config.json',
      'tokenizer.json', 'tokenizer_config.json',
      'onnx/encoder_model_quantized.onnx', 'onnx/decoder_model_merged_quantized.onnx',
    ],
    globs: [],
  },
  {
    id: 'whisper-base',
    repo: 'onnx-community/whisper-base',
    files: [
      'config.json', 'generation_config.json', 'preprocessor_config.json',
      'tokenizer.json', 'tokenizer_config.json',
      'onnx/encoder_model_quantized.onnx', 'onnx/decoder_model_merged_quantized.onnx',
    ],
    globs: [],
  },
];

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

async function sha256Of(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  const buf = Buffer.from(await r.arrayBuffer());
  return { sha256: createHash('sha256').update(buf).digest('hex'), sizeBytes: buf.length };
}

const out = {};
for (const model of MODELS) {
  const info = await fetchJson(`https://huggingface.co/api/models/${model.repo}`);
  const revision = info.sha;
  const tree = await fetchJson(
    `https://huggingface.co/api/models/${model.repo}/tree/main?recursive=true&blobs=true`,
  );
  const byPath = new Map(tree.filter((f) => f.type === 'file').map((f) => [f.path, f]));

  const wanted = [...model.files];
  for (const glob of model.globs) {
    for (const p of byPath.keys()) {
      if (p.startsWith(glob.prefix) && p.endsWith(glob.suffix)) wanted.push(p);
    }
  }

  const artifacts = [];
  for (const path of wanted.sort()) {
    const f = byPath.get(path);
    if (!f) throw new Error(`${model.repo}: expected file missing upstream: ${path}`);
    let sha256, sizeBytes;
    if (f.lfs?.oid) {
      sha256 = f.lfs.oid;
      sizeBytes = f.lfs.size ?? f.size;
    } else {
      ({ sha256, sizeBytes } = await sha256Of(
        `https://huggingface.co/${model.repo}/resolve/${revision}/${path}`,
      ));
      if (sizeBytes !== f.size) throw new Error(`${model.repo}/${path}: size drift (${sizeBytes} vs tree ${f.size})`);
    }
    artifacts.push({ path, sizeBytes, sha256 });
    console.log(`  ${model.id}  ${path}  ${sizeBytes}  ${sha256.slice(0, 12)}…`);
  }
  out[model.id] = { repo: model.repo, revision, artifacts };
  console.log(`${model.id}: ${artifacts.length} artifacts @ ${revision.slice(0, 8)}`);
}

const banner = `/**
 * Contentine Create — GENERATED model artifact manifest. DO NOT EDIT BY HAND.
 * Regenerate with:  node scripts/build-model-manifest.mjs   (repo root)
 *
 * Every artifact of every self-downloaded model (kokoro-js / transformersjs
 * engines), with pinned revision, expected byte size, and SHA-256. LFS hashes
 * come from HuggingFace's authoritative LFS records; small non-LFS files are
 * hashed by the builder. WebLLM models are engine-cache-owned and are NOT
 * listed here (browser-storage-only, see model-storage.ts).
 */

export interface ModelArtifact {
  /** Repo-relative path, e.g. 'onnx/model_quantized.onnx'. */
  path: string;
  sizeBytes: number;
  /** Lowercase hex SHA-256 of the exact bytes. */
  sha256: string;
}

export interface ModelArtifactSet {
  repo: string;
  /** Pinned repo revision (main at manifest build time). */
  revision: string;
  artifacts: ModelArtifact[];
}

export const MODEL_ARTIFACTS: Record<string, ModelArtifactSet> = `;

writeFileSync(OUT, banner + JSON.stringify(out, null, 2) + ';\n');
console.log(`\nWrote ${OUT}`);
