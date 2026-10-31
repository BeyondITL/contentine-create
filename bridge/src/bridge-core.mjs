/**
 * contentine-bridge core: one paired browser tab ⇄ this process.
 *
 * Security model
 *  - Binds 127.0.0.1 only. Loopback is NOT treated as authentication.
 *  - WebSocket upgrades must come from an allow-listed Origin and address
 *    this server by a loopback Host (DNS-rebinding defence), on /bridge.
 *  - Pairing needs a single-use code (8 chars, 10 min, 5 attempts) that the
 *    person copies from their assistant into the app. Pairing yields a resume
 *    token; only its SHA-256 is stored (state dir, 0600), and it is revocable.
 *  - One active browser at a time. The BROWSER decides which projects and
 *    permissions the assistant gets; the bridge cannot widen them.
 *  - The bridge forwards only the eight typed cartoon commands. It exposes no
 *    shell, no evaluation, no file reads, and takes no paths from callers:
 *    artifacts are written by run id into the export directory chosen at
 *    startup, after their SHA-256 is verified.
 */

import { WebSocketServer } from 'ws';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const COMMANDS = [
  'project_inspect',
  'scene_propose_patch',
  'scene_apply_patch',
  'voice_synthesize',
  'render_start',
  'run_inspect',
  'run_cancel',
  'artifact_inspect',
];

export const DEFAULT_ORIGINS = ['https://create.contentine.ai', 'http://localhost:3000', 'http://127.0.0.1:3000'];
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
const CODE_TTL_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;
const MAX_ARTIFACT_BYTES = 512 * 1024 * 1024;
const RUN_ID = /^run_[A-Za-z0-9-]{8,80}$/;

export class BridgeError extends Error {
  constructor(code, message, details) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

function newCode() {
  let s = '';
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

function sameText(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function createBridge({
  port = 47821,
  allowedOrigins = DEFAULT_ORIGINS,
  stateDir,
  exportDir,
  callTimeoutMs = 120_000,
  pairingFile,
  log = () => {},
} = {}) {
  if (!stateDir || !exportDir) throw new Error('stateDir and exportDir are required');
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  fs.mkdirSync(exportDir, { recursive: true });
  const exportRoot = fs.realpathSync(exportDir);
  const sessionsFile = path.join(stateDir, 'sessions.json');
  const auditFile = path.join(stateDir, 'audit.jsonl');

  const readSessions = () => {
    try {
      return JSON.parse(fs.readFileSync(sessionsFile, 'utf8'));
    } catch {
      return [];
    }
  };
  const writeSessions = (list) => fs.writeFileSync(sessionsFile, JSON.stringify(list, null, 2), { mode: 0o600 });
  const audit = (entry) => fs.appendFileSync(auditFile, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`, { mode: 0o600 });

  let pairing = { code: newCode(), expires: Date.now() + CODE_TTL_MS, attempts: 0 };
  const rotate = () => {
    pairing = { code: newCode(), expires: Date.now() + CODE_TTL_MS, attempts: 0 };
    if (pairingFile) fs.writeFileSync(pairingFile, pairing.code, { mode: 0o600 });
  };
  if (pairingFile) fs.writeFileSync(pairingFile, pairing.code, { mode: 0o600 });

  /** @type {{ ws: import('ws').WebSocket, sessionId: string, origin: string, binding: object | null } | null} */
  let active = null;
  const pending = new Map();
  let nextId = 1;
  const waiters = new Set();

  const wss = new WebSocketServer({
    host: '127.0.0.1',
    port,
    path: '/bridge',
    maxPayload: 768 * 1024 * 1024,
    verifyClient: ({ origin, req }, done) => {
      const host = String(req.headers.host ?? '');
      const hostOk = /^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host);
      if (!hostOk) return done(false, 403, 'bad host');
      if (!origin || !allowedOrigins.includes(origin)) {
        audit({ event: 'rejected-origin', origin: origin ?? null });
        return done(false, 403, 'origin not allowed');
      }
      done(true);
    },
  });
  await new Promise((resolve, reject) => {
    wss.once('listening', resolve);
    wss.once('error', reject);
  });
  const actualPort = wss.address().port;

  wss.on('connection', (ws, req) => {
    const origin = req.headers.origin;
    let authed = null;
    const fail = (code, message) => {
      ws.send(JSON.stringify({ type: 'error', code, message }));
      ws.close(4001, code);
    };
    const authTimer = setTimeout(() => !authed && fail('PAIRING_TIMEOUT', 'pair or resume within 15s'), 15_000);

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return fail('BAD_MESSAGE', 'messages must be JSON');
      }
      if (!authed) {
        if (msg.type === 'pair') {
          if (active) return fail('ALREADY_PAIRED', 'another browser tab is paired; disconnect it first');
          if (Date.now() > pairing.expires) rotate();
          pairing.attempts++;
          if (!sameText(String(msg.code ?? '').toUpperCase().trim(), pairing.code)) {
            audit({ event: 'pair-failed', origin, attempts: pairing.attempts });
            if (pairing.attempts >= MAX_ATTEMPTS) rotate();
            return fail('PAIRING_FAILED', 'wrong or expired pairing code');
          }
          rotate(); // single use
          const token = randomBytes(32).toString('base64url');
          const sessionId = randomBytes(6).toString('hex');
          writeSessions([...readSessions(), { id: sessionId, tokenHash: sha256(token), origin, createdAt: new Date().toISOString() }]);
          authed = { sessionId };
          clearTimeout(authTimer);
          active = { ws, sessionId, origin, binding: null };
          audit({ event: 'paired', sessionId, origin });
          ws.send(JSON.stringify({ type: 'paired', sessionId, token }));
          for (const w of waiters) w();
          return;
        }
        if (msg.type === 'resume') {
          const hash = sha256(String(msg.token ?? ''));
          const s = readSessions().find((x) => x.tokenHash === hash && x.origin === origin);
          if (!s) return fail('PAIRING_FAILED', 'unknown or revoked token');
          if (active && active.sessionId !== s.id) return fail('ALREADY_PAIRED', 'another browser tab is paired');
          if (active) active.ws.close(4002, 'replaced');
          authed = { sessionId: s.id };
          clearTimeout(authTimer);
          active = { ws, sessionId: s.id, origin, binding: null };
          audit({ event: 'resumed', sessionId: s.id, origin });
          ws.send(JSON.stringify({ type: 'paired', sessionId: s.id }));
          for (const w of waiters) w();
          return;
        }
        return fail('NOT_PAIRED', 'pair or resume first');
      }
      if (msg.type === 'binding') {
        if (active?.ws === ws) active.binding = { projects: msg.projects, permissions: msg.permissions, renderer: msg.renderer };
        return;
      }
      if (msg.type === 'revoke') {
        writeSessions(readSessions().filter((x) => x.id !== authed.sessionId));
        audit({ event: 'revoked', sessionId: authed.sessionId });
        ws.close(4003, 'revoked');
        return;
      }
      if (msg.type === 'result') {
        const p = pending.get(msg.id);
        if (!p) return;
        pending.delete(msg.id);
        clearTimeout(p.timer);
        if (msg.ok) p.resolve(msg.value);
        else p.reject(new BridgeError(msg.error?.code ?? 'INTERNAL', msg.error?.message ?? 'browser error', msg.error?.details));
      }
    });

    ws.on('close', () => {
      clearTimeout(authTimer);
      if (active?.ws === ws) {
        active = null;
        for (const [id, p] of pending) {
          clearTimeout(p.timer);
          p.reject(new BridgeError('RENDERER_UNAVAILABLE', 'the paired browser tab disconnected'));
          pending.delete(id);
        }
      }
    });
  });

  /** Forward one typed command to the paired browser. */
  async function call(command, args) {
    if (!COMMANDS.includes(command)) throw new BridgeError('INVALID_ARGUMENT', `unknown command '${command}'`);
    if (!active) throw new BridgeError('RENDERER_UNAVAILABLE', 'No Contentine tab is paired. Ask the person to open the app and enter the pairing code from bridge_status.');
    const id = nextId++;
    const started = Date.now();
    try {
      const value = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new BridgeError('BRIDGE_TIMEOUT', `browser did not answer ${command} within ${callTimeoutMs} ms`));
        }, callTimeoutMs);
        pending.set(id, { resolve, reject, timer });
        active.ws.send(JSON.stringify({ type: 'call', id, command, args }));
      });
      audit({ event: 'call', command, ok: true, ms: Date.now() - started, args: summarizeArgs(command, args), result: summarizeResult(command, value) });
      return value;
    } catch (err) {
      audit({ event: 'call', command, ok: false, ms: Date.now() - started, args: summarizeArgs(command, args), error: { code: err.code, message: err.message } });
      throw err;
    }
  }

  /** Fetch a succeeded run's MP4 from the browser, verify it, and write it into the export dir. */
  async function saveArtifact(runId) {
    if (typeof runId !== 'string' || !RUN_ID.test(runId)) throw new BridgeError('INVALID_ARGUMENT', 'runId is not a valid run id');
    const value = await call('artifact_inspect', { runId, include: 'bytes' });
    const { metadata, mp4Base64 } = value ?? {};
    if (!metadata || typeof mp4Base64 !== 'string') throw new BridgeError('INVALID_RESPONSE', 'browser returned no artifact bytes');
    const bytes = Buffer.from(mp4Base64, 'base64');
    if (bytes.length > MAX_ARTIFACT_BYTES) throw new BridgeError('LIMIT_EXCEEDED', 'artifact too large');
    if (bytes.length !== metadata.sizeBytes || sha256(bytes) !== metadata.sha256) {
      throw new BridgeError('CORRUPT_ASSET', 'artifact bytes do not match their recorded SHA-256');
    }
    const target = path.join(exportRoot, `${runId}.mp4`);
    if (path.dirname(target) !== exportRoot) throw new BridgeError('INVALID_ARGUMENT', 'bad artifact path');
    const tmp = `${target}.partial`;
    fs.writeFileSync(tmp, bytes);
    fs.renameSync(tmp, target);
    audit({ event: 'artifact-saved', runId, path: target, sha256: metadata.sha256, sizeBytes: bytes.length });
    return { path: target, sha256: metadata.sha256, sizeBytes: bytes.length, metadata };
  }

  function status() {
    if (Date.now() > pairing.expires && !active) rotate();
    return active
      ? { paired: true, sessionId: active.sessionId, origin: active.origin, binding: active.binding }
      : { paired: false, pairingCode: pairing.code, codeExpiresInSec: Math.max(0, Math.round((pairing.expires - Date.now()) / 1000)), port: actualPort };
  }

  /** Resolve when a browser is paired, or after `seconds`. */
  function waitForPairing(seconds) {
    if (active || seconds <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(t);
        waiters.delete(done);
        resolve();
      };
      const t = setTimeout(done, seconds * 1000);
      waiters.add(done);
    });
  }

  function revokeAll() {
    writeSessions([]);
    active?.ws.close(4003, 'revoked');
    audit({ event: 'revoked-all' });
  }

  let closed = false;
  async function close() {
    if (closed) return;
    closed = true;
    for (const c of wss.clients) c.terminate();
    await new Promise((r) => wss.close(() => r()));
  }

  return { port: actualPort, call, saveArtifact, status, waitForPairing, revokeAll, close, get pairingCode() { return pairing.code; } };
}

function summarizeArgs(command, args) {
  if (!args || typeof args !== 'object') return args;
  const out = { ...args };
  if (Array.isArray(out.ops)) out.ops = out.ops.map((o) => ({ op: o.op, path: o.path }));
  return out;
}

function summarizeResult(command, v) {
  if (!v || typeof v !== 'object') return v;
  if (command === 'artifact_inspect') return { metadata: v.metadata };
  if (command === 'project_inspect') return { revision: v.revision, planHash: v.planHash };
  const keep = ['revision', 'runId', 'state', 'terminal', 'progress', 'changedScenes', 'linesNeedingVoice', 'predictedRender', 'synthesized', 'replayed', 'failure', 'partial', 'alreadyTerminal'];
  return Object.fromEntries(Object.entries(v).filter(([k]) => keep.includes(k)));
}
