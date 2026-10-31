# contentine-bridge

Lets an AI assistant that speaks MCP (for example Claude Code) edit and render a
cartoon in **your open Contentine Create tab** — through the same typed commands
the timeline editor uses. Rendering and voice synthesis still run in your
browser; the bridge only relays calls.

```
assistant ──MCP (stdio)──▶ contentine-bridge ──WebSocket 127.0.0.1──▶ your Contentine tab
                                                                   └─ CartoonCommandService
```

## Set up (Claude Code)

```bash
cd bridge && npm ci
claude mcp add contentine -- node "$(pwd)/src/companion.mjs"
```

Then, in Contentine Create, open a saved cartoon in the timeline editor. Ask
your assistant to connect ("check the Contentine bridge status"); it shows a
pairing code such as `K7QM-2XPA`. Enter it in **Assistant → Connect** in the
editor, choose what the assistant may do (edit scenes, voice lines, render),
and connect. The tab remembers the pairing and reconnects when your assistant
starts again; **Disconnect** revokes it.

Options: `--port` (default 47821), `--allow-origin URL` (add an app origin;
defaults: `https://create.contentine.ai`, `http://localhost:3000`,
`http://127.0.0.1:3000`), `--state-dir` (default `~/.contentine-bridge`),
`--export-dir` (default `~/Contentine Exports`), `--revoke-all`.

## Tools

| Tool | Side effects |
| --- | --- |
| `bridge_status` | none — pairing state, code to show the person |
| `project_inspect` | none |
| `scene_propose_patch` | none — validates and dry-runs a patch |
| `scene_apply_patch` | new project revision (CAS on `expectedRevision`, idempotency key) |
| `voice_synthesize` | new takes for lines whose text/voice/speed changed |
| `render_start` | starts a render run in the browser |
| `run_inspect` | none (`waitSeconds` ≤ 60 to wait for completion) |
| `run_cancel` | cancels a run; previous output kept |
| `artifact_inspect` | none |
| `artifact_save` | writes `<runId>.mp4` into the export dir after checking its SHA-256 |

Command contract, patch format and error codes: `docs/cartoon-commands.md`.

## Security model

- **Local only.** The WebSocket listens on 127.0.0.1. Loopback is not treated
  as authentication.
- **Origin and Host checks.** Upgrades must come from an allow-listed Origin and
  address the bridge by a loopback Host name (defends against DNS rebinding and
  other pages in your browser).
- **Pairing.** A single-use 8-character code (10-minute lifetime, rotated after
  5 wrong attempts) that you copy from your assistant into the app. Pairing
  returns a resume token; the bridge stores only its SHA-256 (file mode 0600),
  bound to the pairing Origin. **Disconnect** or `--revoke-all` revokes it.
- **One tab at a time.** A second tab cannot pair while one is connected.
- **The browser holds the authority.** You choose the project and permissions
  in the app; the bridge cannot widen them. A project id sent by the assistant
  is checked against that grant.
- **Narrow surface.** Only the typed cartoon commands are forwarded. No shell,
  no JavaScript evaluation, no file reads, and no caller-supplied paths;
  artifacts are written by run id into the export directory you chose.
- **Audit log.** `audit.jsonl` in the state dir records pairing events and every
  call (command, outcome, duration; patch values are omitted).
- If the tab disconnects, in-flight calls fail with `RENDERER_UNAVAILABLE`; a
  render whose tab closed becomes `interrupted`, never a false success.

## Tests

```bash
npm test                                   # bridge contract tests (ws client as the tab)
node ../frontend/src/engine/cartoon/harness/run-assistant.mjs   # real assistant + real app (see header)
```
