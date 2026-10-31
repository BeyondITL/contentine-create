#!/usr/bin/env node
/**
 * contentine-bridge — MCP server (stdio) for an assistant such as Claude Code,
 * forwarding typed cartoon commands to ONE paired Contentine Create browser
 * tab. See bridge/README.md for setup and the security model.
 *
 *   contentine-bridge [--port 47821] [--allow-origin URL]... [--state-dir DIR]
 *                     [--export-dir DIR] [--pairing-file FILE] [--revoke-all]
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { BridgeError, DEFAULT_ORIGINS, createBridge } from './bridge-core.mjs';

function parseArgs(argv) {
  const o = { port: 47821, origins: [...DEFAULT_ORIGINS], stateDir: path.join(os.homedir(), '.contentine-bridge'), exportDir: path.join(os.homedir(), 'Contentine Exports'), pairingFile: null, revokeAll: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === '--port') o.port = Number(next());
    else if (a === '--allow-origin') o.origins.push(new URL(next()).origin);
    else if (a === '--state-dir') o.stateDir = path.resolve(next());
    else if (a === '--export-dir') o.exportDir = path.resolve(next());
    else if (a === '--pairing-file') o.pairingFile = path.resolve(next());
    else if (a === '--revoke-all') o.revokeAll = true;
    else throw new Error(`unknown option ${a}`);
  }
  return o;
}

const ok = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });
const fail = (err) => ({
  isError: true,
  content: [{ type: 'text', text: JSON.stringify({ error: { code: err.code ?? 'INTERNAL', message: err.message, ...(err.details ? { details: err.details } : {}) } }) }],
});

const patchOp = z.object({
  op: z.enum(['replace', 'add', 'remove', 'test']),
  path: z.string().max(300),
  value: z.unknown().optional(),
}).strict();
const idemKey = z.string().regex(/^[A-Za-z0-9._:-]{8,128}$/).describe('Unique per intended change; reuse the SAME key only to retry the SAME request.');

export function registerTools(server, bridge) {
  const forward = (command, mapArgs = (a) => a) => async (args) => {
    try {
      return ok(await bridge.call(command, mapArgs(args)));
    } catch (err) {
      return fail(err);
    }
  };

  server.registerTool('bridge_status', {
    title: 'Bridge status',
    description: 'Is a Contentine browser tab paired? If not, returns a pairing code for the person to enter in the app (Timeline editor → Assistant → Connect). Optionally waits up to 120 s for pairing. No side effects.',
    inputSchema: { waitSeconds: z.number().int().min(0).max(120).optional() },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ waitSeconds }) => {
    await bridge.waitForPairing(waitSeconds ?? 0);
    return ok(bridge.status());
  });

  server.registerTool('project_inspect', {
    title: 'Inspect project',
    description: 'Compact summary of a bound cartoon project: revision, scenes (ids, characters with positions, dialogue with take status ok/stale/missing), render cache, recent runs, patch rules and limits. Read-only.',
    inputSchema: { projectId: z.string().max(200) },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, forward('project_inspect'));

  server.registerTool('scene_propose_patch', {
    title: 'Propose scene patch',
    description: 'Validate and dry-run a JSON Patch (replace/add/remove/test) against the scene plan and report the impact (changed scenes, lines needing voice, predicted render). Paths: /title or /scenes/{index|@sceneId}/...; use @id for characters (instanceId) and dialogue lines. No side effects. Max 32 ops.',
    inputSchema: { projectId: z.string().max(200), baseRevision: z.number().int().min(0).optional(), ops: z.array(patchOp).min(1).max(32) },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, forward('scene_propose_patch'));

  server.registerTool('scene_apply_patch', {
    title: 'Apply scene patch',
    description: 'Atomically apply a validated patch as a new project revision. Requires expectedRevision (fails with REVISION_CONFLICT if the project changed — re-inspect and replan) and an idempotencyKey. Reversible through revision history. Does not render.',
    inputSchema: { projectId: z.string().max(200), expectedRevision: z.number().int().min(0), ops: z.array(patchOp).min(1).max(32), idempotencyKey: idemKey, note: z.string().max(200).optional() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, forward('scene_apply_patch'));

  server.registerTool('voice_synthesize', {
    title: 'Synthesize voice takes',
    description: "Create on-device (Kokoro) voice takes only for lines whose text/voice/speed no longer match their take; creates a new revision when anything was synthesized. Max 50 lines per call. Runs in the person's browser.",
    inputSchema: { projectId: z.string().max(200), expectedRevision: z.number().int().min(0), idempotencyKey: idemKey, lineIds: z.array(z.string().max(200)).max(50).optional() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, forward('voice_synthesize'));

  server.registerTool('render_start', {
    title: 'Start render',
    description: "Start an MP4 render of the project at expectedRevision in the person's browser (partial when only some scenes changed). Returns a runId immediately; poll run_inspect. One active run at a time (BUSY otherwise). Fails with TAKES_MISSING if lines need voice_synthesize first.",
    inputSchema: { projectId: z.string().max(200), expectedRevision: z.number().int().min(0), idempotencyKey: idemKey, mode: z.enum(['auto', 'full']).optional() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, forward('render_start'));

  server.registerTool('run_inspect', {
    title: 'Inspect run',
    description: 'Status of a render run: state (queued, waiting_for_renderer, running, succeeded, failed, cancelled, interrupted), progress, recent events, failure, artifact reference. waitSeconds (≤ 60) blocks until the run is terminal or the time passes. Read-only.',
    inputSchema: { runId: z.string().max(100), waitSeconds: z.number().int().min(0).max(60).optional() },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ runId, waitSeconds }) => {
    try {
      const deadline = Date.now() + (waitSeconds ?? 0) * 1000;
      let r = await bridge.call('run_inspect', { runId });
      while (!r.terminal && Date.now() < deadline) {
        await new Promise((res) => setTimeout(res, 1000));
        r = await bridge.call('run_inspect', { runId });
      }
      return ok(r);
    } catch (err) {
      return fail(err);
    }
  });

  server.registerTool('run_cancel', {
    title: 'Cancel run',
    description: 'Cancel a queued or running render. Idempotent; the previous good output is kept. Works even if the project has changed since the run started.',
    inputSchema: { runId: z.string().max(100) },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, forward('run_cancel'));

  server.registerTool('artifact_inspect', {
    title: 'Inspect artifact',
    description: 'Metadata of a succeeded run’s MP4 (sha256, size, duration, resolution, codecs, verification). Read-only.',
    inputSchema: { runId: z.string().max(100) },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, forward('artifact_inspect', ({ runId }) => ({ runId, include: 'metadata' })));

  server.registerTool('artifact_save', {
    title: 'Save artifact',
    description: "Copy a succeeded run's MP4 from the browser into the export folder configured when the bridge started (file name = runId.mp4), after verifying its SHA-256. Takes no path. Returns the saved path.",
    inputSchema: { runId: z.string().max(100) },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ runId }) => {
    try {
      return ok(await bridge.saveArtifact(runId));
    } catch (err) {
      return fail(err);
    }
  });
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const log = (m) => process.stderr.write(`[contentine-bridge] ${m}\n`);
  const bridge = await createBridge({ port: o.port, allowedOrigins: o.origins, stateDir: o.stateDir, exportDir: o.exportDir, pairingFile: o.pairingFile, log });
  if (o.revokeAll) {
    bridge.revokeAll();
    log('all paired browser sessions revoked');
  }
  log(`listening on 127.0.0.1:${bridge.port} · pairing code ${bridge.pairingCode} · exports → ${o.exportDir}`);
  const server = new McpServer({ name: 'contentine', version: '0.1.0' });
  registerTools(server, bridge);
  await server.connect(new StdioServerTransport());
  const shutdown = async () => {
    await bridge.close().catch(() => {});
    process.exit(0);
  };
  process.stdin.on('close', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

const invokedDirectly = (() => {
  try {
    return fs.realpathSync(process.argv[1] ?? '') === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();
if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`[contentine-bridge] fatal: ${err instanceof BridgeError ? err.code : ''} ${err.message}\n`);
    process.exit(1);
  });
}
