---
name: license-audit
description: Weights-license read protocol. Use before wiring any model, before pinning a checkpoint, and any time a new library dep is added. Enforces Law L4.
---

# license-audit

**The founding read (F5-TTS lesson):** F5-TTS *code* is MIT, but the **weights** are CC-BY-NC-4.0 — banned from production. **A model's license is its weights license, not its code license.**

## The read protocol (before any wire)

1. Open the checkpoint page on Hugging Face (or the source repo).
2. Read the **weights license file in full** (not the summary chip). Look for:
   - "commercial use" clauses (allowed / forbidden / conditional).
   - **Field-of-use** restrictions (e.g. "not for surveillance / not for financial decisioning").
   - **NC** (non-commercial) triggers — even implicit ("training data was NC" — as with official F5-TTS + Emilia).
   - Attribution / redistribution requirements (Llama-3 community license has both).
   - Revenue thresholds ("free below X users" — Llama-2 was 700 M MAU; check current terms).
3. Read the training-data credits. If the base model was trained on NC data and the maintainer says derivatives inherit that, treat as NC.
4. Record verbatim in `LICENSES.md`:
   - Row: model / library, exact HF repo string or version, license SPDX or verbatim name, status (✅ / ⚠ / ❌), notes with the clause you're relying on.

## Standing rulings (freeze into `LICENSES.md`)

- ✅ **Kokoro** Apache-2.0.
- ✅ **OpenF5-TTS-Base** (`mrfakename/OpenF5-TTS-Base`) Apache-2.0. **The clone pin.**
- ❌ **Official F5-TTS** (`SWivid/F5-TTS`) CC-BY-NC-4.0. Research-only.
- ❌ **XTTS v2** CPML-NC (Coqui shut down; no relicense possible).
- ✅ **Whisper large-v3-turbo class** MIT.
- ✅ **Moonshine Tiny 27M** MIT.
- ✅ **GSAP + all plugins** GreenSock no-charge (free incl. commercial since 2025-04-30). Not OSI — record current license text on adoption.
- ✅ **lottie-web** MIT.
- ⚠ **SD-Turbo** — re-read pending. Hard gate before any image-gen prod use.
- ⚠ **MediaPipe LLM (Google Gemma)** — Gemma weights terms bind separately; do not confuse code license.
- ❌ **Live2D Cubism** proprietary.
- ⚠ **Hunyuan** — territorial bar lifts under US-only operation; **stays excluded by default** per COWORK_BRIEF.

## Escalation

- Any license anomaly on any model/library → **STOP**. Quote the verbatim clause and route to operator. Do not ship "we think it's OK" — the F5 lesson is exactly that class of mistake.
- If the license changes upstream while our version is pinned: pin persists, but flag in `LICENSES.md` and re-review next sprint.

## Bookkeeping

- `LICENSES.md` is a live ledger. Update in the same commit as the wire-up. `LICENSES.md` in the tip must match what's actually shipped.
- Original assets (rigs, style-pack designs, music) list themselves under `## Original assets` with `license: contentine-owned`.

## The `license-auditor` subagent

- Runs before each C-Mx: sweeps `frontend/src/engine/**` for HF model IDs, cross-references `LICENSES.md`, reports any unpinned or missing entries.
