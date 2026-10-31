'use client';

import { useEffect, useRef, useState } from 'react';
import { Bot, Link2, Unlink, Loader2 } from 'lucide-react';
import type { AssistantBridgeClient, BridgeStatus } from '@/lib/cartoon/commands/assistant-bridge';
import type { Permission } from '@/lib/cartoon/commands/service';

const GRANTS: Array<{ id: Permission; label: string }> = [
  { id: 'edit', label: 'Edit scenes' },
  { id: 'voice', label: 'Voice lines' },
  { id: 'render', label: 'Render MP4' },
];

/**
 * Connect a local AI assistant (via the contentine-bridge companion) to THIS
 * project. The person picks the permissions; the assistant can read and act
 * only on this project, through the same commands as the editor.
 */
export default function AssistantBridgePanel({ projectId, disabled }: { projectId: string; disabled?: boolean }) {
  const clientRef = useRef<AssistantBridgeClient | null>(null);
  const [status, setStatus] = useState<BridgeStatus>({ state: 'disconnected' });
  const [code, setCode] = useState('');
  const [port, setPort] = useState(47821);
  const [grants, setGrants] = useState<Set<Permission>>(new Set(['edit', 'voice', 'render']));
  const [remembered, setRemembered] = useState(false);

  const binding = () => ({ projectIds: [projectId], permissions: ['read' as Permission, ...grants] });

  const ensureClient = async () => {
    if (clientRef.current) return clientRef.current;
    const [bridge, ports] = await Promise.all([import('@/lib/cartoon/commands/assistant-bridge'), import('@/lib/cartoon/commands/browser-ports')]);
    clientRef.current = new bridge.AssistantBridgeClient(ports.getCartoonCommands(), ports.LOCAL_WORKSPACE, setStatus);
    return clientRef.current;
  };

  // Resume a remembered pairing for this project.
  useEffect(() => {
    let alive = true;
    (async () => {
      const bridge = await import('@/lib/cartoon/commands/assistant-bridge');
      if (!alive) return;
      setPort(bridge.AssistantBridgeClient.savedPort());
      setRemembered(bridge.AssistantBridgeClient.hasSavedPairing());
      if (bridge.AssistantBridgeClient.hasSavedPairing()) {
        const c = await ensureClient();
        if (alive) c.connect(bridge.AssistantBridgeClient.savedPort(), binding());
      }
    })();
    return () => {
      alive = false;
      clientRef.current?.disconnect(false);
      clientRef.current = null;
    };
    // binding is captured at mount; grant changes apply on the next connect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // A remembered pairing reconnects by itself: assistants start a fresh
  // bridge process per session, so the tab keeps trying (loopback only).
  useEffect(() => {
    if (status.state !== 'disconnected' || !remembered || disabled) return;
    if (status.reason === 'Disconnected and revoked.') return;
    const t = setTimeout(async () => {
      const bridge = await import('@/lib/cartoon/commands/assistant-bridge');
      if (!bridge.AssistantBridgeClient.hasSavedPairing()) {
        setRemembered(false);
        return;
      }
      (await ensureClient()).connect(port, binding());
    }, 3000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, remembered, disabled, port]);

  const connect = async () => {
    const c = await ensureClient();
    c.connect(port, binding(), code.trim() || undefined);
    if (code.trim()) setRemembered(true);
    setCode('');
  };

  const connected = status.state === 'connected';

  return (
    <div className="bento-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Bot size={16} className="text-primary" />
        <h3 className="text-sm font-semibold text-text dark:text-white">Assistant</h3>
        <span className={`ml-auto text-[11px] ${connected ? 'text-secondary' : 'text-muted'}`}>
          {connected ? 'Connected' : status.state === 'connecting' ? 'Connecting…' : 'Not connected'}
        </span>
      </div>

      {connected ? (
        <>
          <p className="text-[11px] text-muted">
            Your assistant can work on this project only: {status.binding.permissions.filter((p) => p !== 'read').join(', ') || 'read'}. Its edits
            become new saved revisions; load them here, and restore an earlier version from Version history if you don&rsquo;t want them.
          </p>
          <button
            type="button"
            onClick={() => {
              setRemembered(false);
              clientRef.current?.disconnect(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] md:min-h-0 rounded-lg bg-surface dark:bg-[#2a2a2a] text-xs font-medium text-text dark:text-white hover:bg-border-light dark:hover:bg-[#333] transition-colors"
          >
            <Unlink size={13} /> Disconnect
          </button>
        </>
      ) : (
        <>
          <p className="text-[11px] text-muted">
            Ask your assistant for the Contentine pairing code (it runs the local <code>contentine-bridge</code>), then enter it here.
          </p>
          <div className="flex gap-2">
            <input
              aria-label="Pairing code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABCD-2345"
              maxLength={9}
              disabled={disabled || status.state === 'connecting'}
              className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-border-light dark:border-[#333] bg-white dark:bg-[#1e1e1e] text-sm font-mono tracking-wider text-text dark:text-white"
            />
            <input
              aria-label="Bridge port"
              type="number"
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
              className="w-20 px-2 py-2 rounded-lg border border-border-light dark:border-[#333] bg-white dark:bg-[#1e1e1e] text-xs text-text dark:text-white"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            {GRANTS.map((g) => (
              <label key={g.id} className="inline-flex items-center gap-1.5 text-[11px] text-text dark:text-white">
                <input
                  type="checkbox"
                  checked={grants.has(g.id)}
                  onChange={(e) => {
                    const next = new Set(grants);
                    if (e.target.checked) next.add(g.id);
                    else next.delete(g.id);
                    setGrants(next);
                  }}
                />
                {g.label}
              </label>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void connect()}
            disabled={disabled || status.state === 'connecting' || (!code.trim() && !remembered)}
            className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] md:min-h-0 bg-[#0A0A0A] dark:bg-white text-white dark:text-[#0A0A0A] rounded-lg text-xs font-medium hover:opacity-90 transition-all disabled:opacity-40"
          >
            {status.state === 'connecting' ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />} {code.trim() || !remembered ? 'Connect' : 'Reconnect'}
          </button>
          {status.state === 'disconnected' && status.reason && (
            <p className={`text-[11px] ${status.reason.startsWith('Waiting') ? 'text-muted' : 'text-danger'}`}>{status.reason}</p>
          )}
        </>
      )}
    </div>
  );
}
