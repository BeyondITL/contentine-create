/**
 * Browser side of the assistant bridge (see bridge/ at the repo root).
 *
 * The tab connects to the person's local contentine-bridge companion over
 * ws://127.0.0.1, pairs with a code the person copies from their assistant,
 * and then answers typed command calls by dispatching them to the SAME
 * CartoonCommandService the editor uses.
 *
 * Authority stays here: the person chooses which project(s) and permissions
 * the assistant gets, and every call runs under a CommandContext built from
 * that binding — never from anything the assistant sends.
 */

import { COMMAND_NAMES, type CartoonCommandService, type CommandContext, type Permission } from './service';

export interface BridgeBinding {
  projectIds: string[];
  permissions: Permission[];
}

export type BridgeStatus =
  | { state: 'disconnected'; reason?: string }
  | { state: 'connecting' }
  | { state: 'connected'; sessionId: string; binding: BridgeBinding };

const TOKEN_KEY = 'contentine.assistantBridge.token';
const PORT_KEY = 'contentine.assistantBridge.port';
export const DEFAULT_BRIDGE_PORT = 47821;
const MUTATING = new Set(['scene_apply_patch', 'voice_synthesize', 'render_start', 'run_cancel']);

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function storageSet(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // per-viewer convenience only
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let out = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) out += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(out);
}

/** Event fired on window after the assistant changed a project. */
export const PROJECT_CHANGED_EVENT = 'contentine:project-changed';
export interface ProjectChangedDetail {
  projectId: string;
  command: string;
  revision?: number;
}

export class AssistantBridgeClient {
  private ws: WebSocket | null = null;
  private binding: BridgeBinding | null = null;
  private sessionId: string | null = null;
  private resuming = false;

  constructor(
    private readonly service: CartoonCommandService,
    private readonly workspaceId: string,
    private readonly onStatus: (s: BridgeStatus) => void,
  ) {}

  static savedPort(): number {
    const p = Number(storageGet(PORT_KEY));
    return Number.isInteger(p) && p > 0 && p < 65536 ? p : DEFAULT_BRIDGE_PORT;
  }

  static hasSavedPairing(): boolean {
    return Boolean(storageGet(TOKEN_KEY));
  }

  /** Pair with a code (first time) or resume with the stored token (code omitted). */
  connect(port: number, binding: BridgeBinding, code?: string): void {
    this.disconnect(false);
    if (binding.projectIds.length === 0) {
      this.onStatus({ state: 'disconnected', reason: 'Choose at least one project for the assistant.' });
      return;
    }
    const token = storageGet(TOKEN_KEY);
    if (!code && !token) {
      this.onStatus({ state: 'disconnected', reason: 'Enter the pairing code your assistant shows.' });
      return;
    }
    this.binding = { projectIds: [...binding.projectIds], permissions: [...binding.permissions] };
    this.onStatus({ state: 'connecting' });
    let ws: WebSocket;
    try {
      ws = new WebSocket(`ws://127.0.0.1:${port}/bridge`);
    } catch (err) {
      this.onStatus({ state: 'disconnected', reason: err instanceof Error ? err.message : 'Could not reach the bridge.' });
      return;
    }
    this.ws = ws;
    this.resuming = !code;
    storageSet(PORT_KEY, String(port));

    ws.onopen = () => {
      ws.send(JSON.stringify(code ? { type: 'pair', code } : { type: 'resume', token }));
    };
    ws.onmessage = (ev) => void this.handle(ws, String(ev.data));
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.sessionId = null;
      const reason =
        ev.code === 4001 ? `Pairing refused (${ev.reason || 'check the code'})` :
        ev.code === 4003 ? 'Disconnected and revoked.' :
        this.resuming
          ? 'Waiting for your assistant — it reconnects automatically when the assistant starts.'
          : 'The assistant bridge is not running. Start your assistant (it launches the bridge), then connect again.';
      this.onStatus({ state: 'disconnected', reason });
    };
  }

  disconnect(revoke: boolean): void {
    const ws = this.ws;
    if (!ws) return;
    if (revoke && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'revoke' }));
      storageSet(TOKEN_KEY, null);
    }
    this.ws = null;
    this.sessionId = null;
    ws.close();
    this.onStatus({ state: 'disconnected', reason: revoke ? 'Disconnected and revoked.' : undefined });
  }

  private context(callId: number): CommandContext {
    return {
      actor: { id: `assistant:${this.sessionId}`, kind: 'assistant' },
      workspaceId: this.workspaceId,
      projects: new Set(this.binding!.projectIds),
      permissions: new Set(this.binding!.permissions),
      requestId: `bridge-${this.sessionId}-${callId}`,
    };
  }

  private async handle(ws: WebSocket, raw: string): Promise<void> {
    let msg: { type?: string; [k: string]: unknown };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.type === 'paired') {
      this.sessionId = String(msg.sessionId);
      if (typeof msg.token === 'string') storageSet(TOKEN_KEY, msg.token);
      const renderer = await this.service.rendererStatus();
      ws.send(JSON.stringify({ type: 'binding', projects: this.binding!.projectIds, permissions: this.binding!.permissions, renderer }));
      this.onStatus({ state: 'connected', sessionId: this.sessionId, binding: this.binding! });
      return;
    }
    if (msg.type === 'error') {
      // A refused resume means the saved pairing was revoked or belongs to another bridge.
      if (msg.code === 'PAIRING_FAILED' && this.resuming) storageSet(TOKEN_KEY, null);
      return; // the close handler reports it
    }
    if (msg.type !== 'call' || !this.sessionId) return;
    const id = Number(msg.id);
    const command = String(msg.command);
    const reply = (body: object) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'result', id, ...body }));
    };
    if (!(COMMAND_NAMES as readonly string[]).includes(command)) {
      reply({ ok: false, error: { code: 'INVALID_ARGUMENT', message: `unknown command '${command}'` } });
      return;
    }
    try {
      const ctx = this.context(id);
      let value: unknown;
      if (command === 'artifact_inspect') {
        const r = await this.service.artifactInspect(ctx, msg.args);
        value = r.mp4 ? { metadata: r.metadata, mp4Base64: await blobToBase64(r.mp4) } : { metadata: r.metadata };
      } else {
        value = await this.service.dispatch(command, ctx, msg.args);
      }
      reply({ ok: true, value });
      if (MUTATING.has(command)) {
        const v = value as { projectId?: string; revision?: number };
        const args = msg.args as { projectId?: string };
        const projectId = v?.projectId ?? args?.projectId;
        if (projectId) {
          window.dispatchEvent(new CustomEvent<ProjectChangedDetail>(PROJECT_CHANGED_EVENT, { detail: { projectId, command, revision: v?.revision } }));
        }
      }
    } catch (err) {
      const e = err as { code?: string; message?: string; details?: unknown };
      reply({ ok: false, error: { code: e.code ?? 'INTERNAL', message: e.message ?? String(err), details: e.details } });
    }
  }
}
