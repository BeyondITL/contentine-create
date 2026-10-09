#!/usr/bin/env node
/**
 * check-model-bom.mjs — Law L4/L5 file-level model BOM gate.
 *
 * Reads the `bom` field on every entry in frontend/src/lib/model-catalog.ts
 * (the Law-5 implementation standard per RECONCILED_MODEL_VERDICTS_2026-08-03)
 * and FAILS (exit 1) on a supply-chain problem for any LIVE (shippable) model:
 *   - missing per-artifact hash for a self-downloaded model (integrity gap)
 *   - missing primary weights license
 *   - non-commercial / research-only terms
 *   - unresolved base-model, or a face-analysis dependency (InsightFace-class)
 *   - an unreviewed conversion/quantization repo
 *   - an upstream/downstream (base vs shipped) license mismatch
 *
 * Honesty rules (operator-ordered): provenance is never fabricated. An entry
 * that cannot be sourced declares integrity:'UNREVIEWED' and the gate reports
 * it. Entries gated OFF at build time (e.g. SD-Turbo while NEXT_PUBLIC_IMAGE_GEN
 * is off) are audited too, but their problems are WARNINGS (they cannot reach a
 * user) — flip the flag and they become hard failures, which is the point:
 * SD-Turbo cannot ship until its conversion is reviewed + hashes pinned.
 *
 * 'webllm-managed' integrity (Llama/Qwen via MLC) is a WARNING, not a pass and
 * not a hard fail: provenance IS recorded (base repo + MLC conversion + license)
 * but this app does not pin per-file SHA-256 (WebLLM owns its cache). Surfaced
 * every run so the gap is visible, not silently green.
 *
 * No new deps: transpiles the two TS data modules in-memory with the already
 * installed `typescript` and imports them as ESM data URLs.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const FRONTEND = join(ROOT, 'frontend');

// typescript lives in frontend/node_modules — resolve it from there.
const requireFromFrontend = createRequire(join(FRONTEND, 'package.json'));
const ts = requireFromFrontend('typescript');

/** Transpile a self-contained TS data module and import it as ESM. */
async function loadTsModule(absPath) {
  const source = readFileSync(absPath, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: 'ESNext', target: 'ES2020' },
  });
  const url = 'data:text/javascript;base64,' + Buffer.from(outputText).toString('base64');
  return import(url);
}

const NC_RE = /non-?commercial|research[-\s]only|no commercial use|cc-by-nc|research purposes only|academic use only/i;
const FACE_RE = /insightface|antelope|buffalo_|facexlib|face-?alignment|dwpose|scrfd|retinaface/i;
const HASH_RE = /^[0-9a-f]{64}$/i;

function auditEntry(entry, artifacts) {
  const errors = [];
  const warnings = [];
  const bom = entry.bom;

  if (!bom) {
    errors.push('no BOM declared');
    return { errors, warnings };
  }

  // 1. primary license present
  if (!bom.primaryLicense || !String(bom.primaryLicense).trim()) {
    errors.push('missing primary weights license');
  }

  // 2. NC / research-only terms in the governing license/clause
  const licenseText = `${bom.primaryLicense || ''} ${bom.licenseClause || ''}`;
  if (NC_RE.test(licenseText)) {
    errors.push('non-commercial / research-only terms in the primary license');
  }

  // 3. base model resolved
  const baseRepo = bom.baseModel && bom.baseModel.repo;
  if (!baseRepo || /UNRESOLVED|UNREVIEWED|unknown/i.test(baseRepo)) {
    errors.push('unresolved base-model repo');
  }

  // 4. face-analysis dependency (InsightFace-class contamination)
  const faceDep = String(bom.faceAnalysisDependency || '').trim();
  if (faceDep && !/^none$/i.test(faceDep)) {
    errors.push(
      FACE_RE.test(faceDep)
        ? `face-analysis dependency (InsightFace-class): ${faceDep}`
        : `undocumented face-analysis dependency: ${faceDep}`,
    );
  }

  // 5. conversion reviewed
  if (bom.conversion && bom.conversion.reviewed !== true) {
    errors.push(`unreviewed conversion repo (${bom.conversion.repo || '?'})`);
  }

  // 6. upstream/downstream license mismatch
  const baseLicense = bom.baseModel && bom.baseModel.license;
  if (baseLicense && bom.primaryLicense && baseLicense !== bom.primaryLicense) {
    errors.push(`upstream/downstream license mismatch (base=${baseLicense}, shipped=${bom.primaryLicense})`);
  }

  // 7. integrity / hashes
  if (bom.integrity === 'per-artifact-sha256') {
    const set = artifacts[entry.id];
    if (!set || !Array.isArray(set.artifacts) || set.artifacts.length === 0) {
      errors.push('integrity=per-artifact-sha256 but no artifact manifest found (missing hashes)');
    } else {
      const bad = set.artifacts.filter((a) => !HASH_RE.test(String(a.sha256 || '')));
      if (bad.length > 0) errors.push(`${bad.length} artifact(s) missing a valid SHA-256`);
    }
  } else if (bom.integrity === 'webllm-managed') {
    warnings.push('per-file SHA-256 not pinned (WebLLM-cache integrity; provenance recorded)');
  } else {
    errors.push(`integrity is ${bom.integrity || 'undeclared'} — no hash discipline established`);
  }

  // Obligations unmet is a WARNING (a compliance to-do, not a provenance defect).
  if (bom.obligationsMet === false) {
    warnings.push(`obligations UNMET: ${(bom.obligations || []).join('; ')}`);
  }

  return { errors, warnings };
}

async function main() {
  const catalog = await loadTsModule(join(FRONTEND, 'src/lib/model-catalog.ts'));
  const artifactsMod = await loadTsModule(join(FRONTEND, 'src/lib/model-artifacts.ts'));
  const artifacts = artifactsMod.MODEL_ARTIFACTS || {};

  const live = catalog.MODEL_CATALOG || [];
  const liveIds = new Set(live.map((e) => e.id));

  // Audit every live entry (hard-fail on problems) plus any gated entry that is
  // defined but excluded from the live catalog (warn-only until it ships).
  const auditSet = [...live.map((e) => ({ entry: e, active: true }))];
  if (catalog.SD_TURBO_ENTRY && !liveIds.has(catalog.SD_TURBO_ENTRY.id)) {
    auditSet.push({ entry: catalog.SD_TURBO_ENTRY, active: false });
  }

  console.log('=== Model BOM gate (Law L4/L5) ===');
  let hardFailures = 0;
  let warnCount = 0;

  for (const { entry, active } of auditSet) {
    const { errors, warnings } = auditEntry(entry, artifacts);
    const tag = active ? '' : ' (gated: NEXT_PUBLIC_IMAGE_GEN off)';

    if (errors.length === 0) {
      console.log(`  \x1b[32m✓\x1b[0m ${entry.id}${tag}`);
    } else if (active) {
      hardFailures += errors.length;
      console.log(`  \x1b[31m✗\x1b[0m ${entry.id}${tag}`);
      for (const e of errors) console.log(`      \x1b[31mFAIL\x1b[0m ${e}`);
    } else {
      // Gated: problems are warnings until the entry goes live.
      warnCount += errors.length;
      console.log(`  \x1b[33m•\x1b[0m ${entry.id}${tag}`);
      for (const e of errors) console.log(`      \x1b[33mwarn (gated)\x1b[0m ${e}`);
    }
    for (const w of warnings) {
      warnCount++;
      console.log(`      \x1b[33mwarn\x1b[0m ${w}`);
    }
  }

  console.log('');
  console.log(`Audited ${auditSet.length} entries · hard failures: ${hardFailures} · warnings: ${warnCount}`);
  if (hardFailures > 0) {
    console.log('\x1b[31mMODEL BOM GATE FAILED\x1b[0m — resolve the FAIL lines above (do not fabricate provenance).');
    process.exit(1);
  }
  console.log('\x1b[32mMODEL BOM GATE PASSED\x1b[0m (warnings are non-blocking, but tracked).');
  process.exit(0);
}

main().catch((err) => {
  console.error('check-model-bom.mjs crashed:', err);
  process.exit(1);
});
