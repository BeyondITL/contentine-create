/**
 * Contract tests for the bridge (verification class: contract_test). A `ws`
 * client stands in for the browser tab; the MCP surface is exercised through
 * the SDK's in-memory transport. The real assistant + real browser run is
 * frontend/src/engine/cartoon/harness/run-assistant.mjs.
 */
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import WebSocket from 'ws';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createBridge } from '../src/bridge-core.mjs';
import { registerTools } from '../src/companion.mjs';

const ORIGIN = 'http://localhost:3000';

const open = new Set();
after(async () => {
  for (const b of open) await b.close().catch(() => {});
});

async function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-test-'));
  const bridge = await createBridge({ port: 0, stateDir: path.join(dir, 'state'), exportDir: path.join(dir, 'exports'), callTimeoutMs: 2000 });
  open.add(bridge);
  return { bridge, dir };
}

function connect(bridge, { origin = ORIGIN, host } = {}) {
  const headers = host ? { host } : {};
  const opts = origin === 'none' ? { headers } : { origin, headers };
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}/bridge`, opts);
    const msgs = [];
    ws.on('message', (m) => msgs.push(JSON.parse(String(m))));
    ws.on('open', () => resolve({ ws, msgs, opened: true }));
    ws.on('unexpected-response', (_req, res) => resolve({ ws, msgs, opened: false, status: res.statusCode }));
    ws.on('error', () => {});
  });
}
const next = async (c, n = 1) => {
  for (let i = 0; i < 100 && c.msgs.length < n; i++) await new Promise((r) => setTimeout(r, 20));
  return c.msgs[n - 1];
};

/** A fake browser tab that answers calls with `handler`. */
function serveCalls(c, handler) {
  c.ws.on('message', async (m) => {
    const msg = JSON.parse(String(m));
    if (msg.type !== 'call') return;
    try {
      c.ws.send(JSON.stringify({ type: 'result', id: msg.id, ok: true, value: await handler(msg.command, msg.args) }));
    } catch (e) {
      c.ws.send(JSON.stringify({ type: 'result', id: msg.id, ok: false, error: { code: e.code ?? 'X', message: e.message } }));
    }
  });
}

test('rejects foreign origins and non-loopback Host headers before any message', async () => {
  const { bridge } = await setup();
  assert.equal((await connect(bridge, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await connect(bridge, { origin: 'none' })).status, 403);
  assert.equal((await connect(bridge, { host: `attacker.example:${bridge.port}` })).status, 403);
  await bridge.close();
});

test('pairing code is required, single-use, and rotates after 5 failures', async () => {
  const { bridge } = await setup();
  const code = bridge.pairingCode;
  for (let i = 0; i < 5; i++) {
    const c = await connect(bridge);
    c.ws.send(JSON.stringify({ type: 'pair', code: 'AAAA-AAAA' }));
    assert.equal((await next(c)).code, 'PAIRING_FAILED');
  }
  assert.notEqual(bridge.pairingCode, code, 'code rotated after too many attempts');
  const c = await connect(bridge);
  c.ws.send(JSON.stringify({ type: 'pair', code }));
  assert.equal((await next(c)).code, 'PAIRING_FAILED', 'old code no longer works');
  const good = await connect(bridge);
  const fresh = bridge.pairingCode;
  good.ws.send(JSON.stringify({ type: 'pair', code: fresh.toLowerCase() }));
  const paired = await next(good);
  assert.equal(paired.type, 'paired');
  assert.ok(paired.token.length >= 40);
  assert.notEqual(bridge.pairingCode, fresh, 'code is single use');
  const second = await connect(bridge);
  second.ws.send(JSON.stringify({ type: 'pair', code: bridge.pairingCode }));
  assert.equal((await next(second)).code, 'ALREADY_PAIRED');
  await bridge.close();
});

test('tools fail closed while no tab is paired; calls are forwarded once paired; disconnect fails in-flight calls', async () => {
  const { bridge } = await setup();
  await assert.rejects(bridge.call('project_inspect', { projectId: 'p' }), { code: 'RENDERER_UNAVAILABLE' });
  await assert.rejects(bridge.call('shell', {}), { code: 'INVALID_ARGUMENT' });
  const c = await connect(bridge);
  c.ws.send(JSON.stringify({ type: 'pair', code: bridge.pairingCode }));
  await next(c);
  serveCalls(c, async (command, args) => {
    if (command === 'run_inspect') return new Promise(() => {}); // never answers
    return { command, args };
  });
  assert.deepEqual(await bridge.call('project_inspect', { projectId: 'p' }), { command: 'project_inspect', args: { projectId: 'p' } });
  const hanging = bridge.call('run_inspect', { runId: 'run_12345678' });
  c.ws.close();
  await assert.rejects(hanging, { code: 'RENDERER_UNAVAILABLE' });
  await bridge.close();
});

test('resume tokens survive a bridge restart, are origin-bound, and are revocable', async () => {
  const { bridge, dir } = await setup();
  const c = await connect(bridge);
  c.ws.send(JSON.stringify({ type: 'pair', code: bridge.pairingCode }));
  const { token } = await next(c);
  c.ws.close();
  await bridge.close();

  const b2 = await createBridge({ port: 0, stateDir: path.join(dir, 'state'), exportDir: path.join(dir, 'exports') });
  open.add(b2);
  const wrongOrigin = await connect(b2, { origin: 'http://127.0.0.1:3000' });
  wrongOrigin.ws.send(JSON.stringify({ type: 'resume', token }));
  assert.equal((await next(wrongOrigin)).code, 'PAIRING_FAILED');
  const r = await connect(b2);
  r.ws.send(JSON.stringify({ type: 'resume', token }));
  assert.equal((await next(r)).type, 'paired');
  r.ws.send(JSON.stringify({ type: 'revoke' }));
  await new Promise((res) => setTimeout(res, 100));
  const again = await connect(b2);
  again.ws.send(JSON.stringify({ type: 'resume', token }));
  assert.equal((await next(again)).code, 'PAIRING_FAILED');
  const raw = fs.readFileSync(path.join(dir, 'state', 'sessions.json'), 'utf8');
  assert.ok(!raw.includes(token), 'token is never stored in clear');
  await b2.close();
});

test('artifacts are verified and written only as <runId>.mp4 inside the export dir', async () => {
  const { bridge, dir } = await setup();
  const c = await connect(bridge);
  c.ws.send(JSON.stringify({ type: 'pair', code: bridge.pairingCode }));
  await next(c);
  const bytes = Buffer.from('fake mp4 bytes');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  let tamper = false;
  serveCalls(c, async () => ({ metadata: { sha256, sizeBytes: bytes.length }, mp4Base64: (tamper ? Buffer.from('other bytes!!!') : bytes).toString('base64') }));
  const saved = await bridge.saveArtifact('run_abcdef12-3456');
  assert.equal(saved.path, path.join(fs.realpathSync(path.join(dir, 'exports')), 'run_abcdef12-3456.mp4'));
  assert.deepEqual(fs.readFileSync(saved.path), bytes);
  await assert.rejects(bridge.saveArtifact('../../etc/passwd'), { code: 'INVALID_ARGUMENT' });
  await assert.rejects(bridge.saveArtifact('run_../../x'), { code: 'INVALID_ARGUMENT' });
  tamper = true;
  await assert.rejects(bridge.saveArtifact('run_abcdef12-9999'), { code: 'CORRUPT_ASSET' });
  assert.ok(!fs.existsSync(path.join(dir, 'exports', 'run_abcdef12-9999.mp4')));
  await bridge.close();
});

test('MCP surface: exactly the typed tools, with side-effect annotations and strict op schemas', async () => {
  const { bridge } = await setup();
  const server = new McpServer({ name: 'contentine', version: 'test' });
  registerTools(server, bridge);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new Client({ name: 't', version: '0' });
  await client.connect(b);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), [
    'artifact_inspect', 'artifact_save', 'bridge_status', 'project_inspect', 'render_start', 'run_cancel', 'run_inspect', 'scene_apply_patch', 'scene_propose_patch', 'voice_synthesize',
  ]);
  for (const t of tools) assert.equal(typeof t.annotations?.readOnlyHint, 'boolean', `${t.name} declares side effects`);
  const status = await client.callTool({ name: 'bridge_status', arguments: {} });
  assert.match(status.content[0].text, /"paired":false/);
  const unpaired = await client.callTool({ name: 'project_inspect', arguments: { projectId: 'p' } });
  assert.equal(unpaired.isError, true);
  assert.match(unpaired.content[0].text, /RENDERER_UNAVAILABLE/);
  const badOp = await client.callTool({ name: 'scene_apply_patch', arguments: { projectId: 'p', expectedRevision: 1, idempotencyKey: 'k-12345678', ops: [{ op: 'move', path: '/x', from: '/y' }] } });
  assert.equal(badOp.isError, true);
  await client.close();
  await bridge.close();
});
