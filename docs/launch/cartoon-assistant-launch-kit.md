# Launch kit — Cartoon Studio + assistant editing (DRAFT, not published)

Status: ready for owner review. Nothing here has been posted, sent or deployed.
Every claim below links to the evidence record that supports it
(`docs/execution/EVIDENCE.md`). Claims without evidence are not made.

## What works (observed)

| Capability | Evidence | Environment it was observed in |
| --- | --- | --- |
| Render a 3-scene, 35 s, 1080p cartoon with on-device narration (Kokoro) to MP4 | A01, demo | Linux, headless Chrome 153 (software H.264 + Opus) |
| Change one scene visually and re-render only that scene; other scenes and narration stay bit-identical | A02, A07–A12, demo | same |
| Save a complete project; it survives quitting and relaunching the browser; reopen without re-voicing | A05 | same |
| Damaged or missing voice audio is reported, never silently regenerated; a failed save keeps the last good version | A06 | same (injected failures) |
| Backup/restore a project as one `.ccproj` file | A05, A06 | same |
| Voice/speed changes re-voice exactly the affected line; replaced asset bytes re-render the scenes that use them | A04 | same |
| An AI assistant (Claude Code over MCP) inspects, proposes, applies a bounded scene edit, renders and saves the MP4 — through the same commands as the editor | A12 | Claude Code 2.1.316 + app build in Chrome 153 |
| If you edit while the assistant is planning, its stale change is rejected; it re-reads and keeps your edit | A07, A12 | same |
| Cancel a render; the previous MP4 stays. A render interrupted by closing the browser is reported as interrupted, not finished | A11 | same |
| The assistant can only touch the project you connect, with the permissions you tick; bridge is local-only with pairing | A09, A13 | contract tests + A12 |

## Tested matrix

| Platform | Browser | Result |
| --- | --- | --- |
| Linux x86_64 (container) | Chrome 153 headless, software rendering | **Tested** — all records above |
| macOS | Chrome | Not re-tested in this milestone (an earlier project note reports byte-identical software encodes there; not verified here) |
| Windows | Chrome / Edge | Not tested |
| any | Safari, Firefox | Not tested (WebCodecs H.264 encoding support varies) |
| Mobile | any | Editor requires a laptop-width screen (≥ 1024 px); not tested |

## Requirements and first-run cost

- A Chromium-based browser with WebCodecs H.264 encoding, OffscreenCanvas,
  OfflineAudioContext and IndexedDB. The app checks this before rendering and
  reports `RENDERER_UNAVAILABLE` instead of producing a broken file.
- First narration downloads the Kokoro voice model once (about 87 MB per the
  in-app message) from Hugging Face's CDN; later runs use the browser cache.
  Measured in the recorded demo (fresh browser profile, this Linux container,
  software rendering): opening the sample the first time — model download,
  voicing 6 lines on-device, full 1062-frame render — took **378 s**; a
  visual-only scene-2 re-roll took **24 s**. Expect different numbers on
  other machines; nothing faster is claimed.
- Assistant editing: Node 20+, `bridge/` installed, and an MCP-capable
  assistant. Only Claude Code was tested.

## Known limitations

- On Linux Chromium the software H.264 encoder is not byte-reproducible run to
  run: frames, mixed audio and stream structure are identical, MP4 bytes are
  not (ENC-01). Don't claim byte-identical exports in general.
- Audio is Opus where the browser has no AAC encoder.
- Editing narration text changes timing, so the whole video re-renders (the
  report says why). Visual-only edits are the partial case.
- Backgrounds made by the wizard are procedural; image backgrounds are
  supported by the renderer and project format but have no upload control yet.
- One active render per workspace; one browser tab per bridge; no remote
  bridge mode.
- Browser storage can be cleared by the browser or the person — keep a
  `.ccproj` backup for anything that matters.
- Not tested with real users yet (WP8 needs outreach approval).

## Draft launch copy (for review — not posted)

**Short (social):**
Your AI assistant can now edit a cartoon for you — inside your own browser.
Ask it to move a character in scene two; it inspects the project, proposes the
change, applies it, and re-renders only that scene. Narration and timing stay
put. Nothing is uploaded: voices and video are made on your device.
Tested with Claude Code on Chrome (Linux). Feedback welcome.

**Longer (README / post):**
Contentine Create's Cartoon Studio turns a short script into a narrated
cartoon entirely in the browser. This release adds three things:

1. **Projects that last.** Your cartoon — plan, voices and render — is saved on
   your device, survives a browser restart, and can be backed up to one file.
2. **Edits that don't start over.** Change how one scene looks and only that
   scene re-renders; everything else is reused exactly.
3. **An assistant that edits through the same controls you use.** Connect an
   MCP assistant (tested: Claude Code) with a pairing code. It can only touch
   the project you connect, it can't run shell commands through Contentine,
   and if you change something while it's working, it is told to re-read
   instead of overwriting you.

Known limits: tested on Chrome; first narration downloads an ~87 MB voice
model; editing narration re-renders the whole video.

## Tester invitation (draft — send only after approval)

Subject: Try editing a cartoon with your AI assistant (20 minutes)

Hi —

I'm looking for five people to try one task and tell me where it breaks:

1. Open https://create.contentine.ai/cartoon/ in Chrome on a laptop.
2. **Open file** → choose `dot-and-dash.plan.json` (attached) → **Open**. The
   first time, it downloads a voice model and renders (a few minutes).
3. Change the background of scene 2 and press **Re-roll**. Download the MP4.
4. Optional, if you use Claude Code: install the bridge (`bridge/README.md`),
   connect it in the editor's Assistant panel, and ask it to move the
   character in scene 2.

What I'd like back: did you get an MP4 (yes/no), how long each step took,
anything confusing, your OS/browser, and whether you'd use this for your own
script. Nothing you make leaves your computer unless you send it to me.

Thank you!

## Before publishing (owner decisions)

- Approve or edit the copy above; approve tester outreach (WP8).
- Merge the PR stack and deploy to create.contentine.ai (production deploy
  needs explicit approval; `scripts/` deploy is unchanged).
- Decide whether to publish `bridge/` to npm or document running it from the
  repository (current docs use the repository).
