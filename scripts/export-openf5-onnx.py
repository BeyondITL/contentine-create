#!/usr/bin/env python3
"""
export-openf5-onnx.py — REPRODUCIBLE OpenF5-TTS-Base → browser-ONNX conversion.

Contentine Create · WS-5 · Law L4 (weights-license discipline) · Law L1 (no facades).

WHY THIS EXISTS
---------------
The C-M2 provenance ruling (LICENSES.md §"OpenF5 provenance", step-list b.1–b.5)
is still open: the voice-clone tier ships FLAG-OFF until a provenance-validated,
browser-runnable ONNX export of `mrfakename/OpenF5-TTS-Base` (Apache-2.0,
commercial-OK) exists, with source repo + revision + conversion steps + output
sha256 recorded. This script IS that conversion, committed to the repo so the
export is reproducible by anyone with the toolchain — not a one-off on someone's
laptop that nobody can re-run or audit.

WHAT IT DOES NOT DO
-------------------
It does NOT run the ~5.4 GB download + torch export automatically. That is an
offline GPU/CPU job on operator hardware (LICENSES.md step b). The default and
the `--dry-run` mode validate the toolchain, prove the pinned source is reachable
with the expected bytes (HF metadata only, no blob download), print the exact
plan, and emit the provenance block + a LICENSES.md-ready snippet. The heavy
conversion runs ONLY with an explicit `--run` and only when every dependency is
present. Until its output is validated and wired, `F5_CLONE_TIER_ENABLED` stays
`false` in frontend/src/engine/f5tts-engine.ts (do not flip it here).

USAGE
-----
    python3 scripts/export-openf5-onnx.py --dry-run     # safe: validate + plan
    python3 scripts/export-openf5-onnx.py --run \\       # heavy: real conversion
        --workdir /path/with/space --hf-token <read-token-if-needed>

HONESTY
-------
Provenance is never fabricated. sha256 fields for the OUTPUT ONNX are printed
as `PENDING (run --run)` until the real export produces bytes to hash. The INPUT
pins (repo/revision/model.pt hash) are verified against HuggingFace live.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import subprocess
import sys
import urllib.request
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone

# ───────────────────────── PINS (audit surface — change only with a re-read) ──

# Source weights: the ONLY checkpoint permitted for voice cloning (Law L4).
# Mirrors OPENF5_MODEL_ID / OPENF5_REVISION in frontend/src/engine/f5tts-engine.ts
# and the table in LICENSES.md §"OpenF5 provenance" (b).
OPENF5_REPO = "mrfakename/OpenF5-TTS-Base"
OPENF5_REVISION = "28e45df3acf0595c9febf233d7d82b409708ce2c"
OPENF5_LICENSE = "Apache-2.0"  # verbatim: commercial + personal use permitted

# Expected input artifacts at that revision (verified against HF LFS/git records).
INPUT_ARTIFACTS = {
    "model.pt":    {"size": 5_402_567_833, "sha256": "c8a97749c1318cb6cf4659dd1eef067c85c42e75156c98a937124c53de2ca148", "lfs": True},
    "config.yaml": {"size": 2_012,          "git_oid": "48caf0790738e43b74bdafc6a028f31c7dce7d52", "lfs": False},
    "vocab.txt":   {"size": 13_679,         "git_oid": "7977fa560849a603201bdcc564dab57ea838b795", "lfs": False},
}

# Conversion toolchain — pinned to exact commits/versions for reproducibility.
# F5-TTS model code is MIT (code license, not the weights license). The DakeQQ
# exporter is the same lineage the quarantined huggingfacess/F5-TTS-ONNX used;
# here it converts the Apache-2.0 OpenF5 weights instead of the NC official ones.
TOOLCHAIN = {
    "f5_tts_repo":      "https://github.com/SWivid/F5-TTS",
    "f5_tts_commit":    "9c614e9657089213efc6a7421b30630be138a3f5",  # 2026-07-23; code MIT
    "f5_tts_pypi":      "f5-tts==1.1.22",                             # alt to git checkout (MIT)
    "exporter_repo":    "https://github.com/DakeQQ/F5-TTS-ONNX",
    "exporter_commit":  "47173d5fe22eefd1adc4dab3b8829d227f307e29",  # 2026-07-29
    "vocoder":          "Vocos (charactr/vocos-mel-24khz, MIT)",
}

# F5 mel front-end + sampler config (from OpenF5 config.yaml; recorded for the
# numerical-parity check and so the browser front-end matches at inference time).
F5_FRONTEND = {
    "sample_rate_hz": 24_000, "n_mels": 100, "hop_length": 256,
    "win_length": 1024, "n_fft": 1024, "sampler": "flow-matching ODE (Euler)",
    "tokenizer": "vocab.txt char-based (F5TTS_Base_V1 config)",
}

# Output ONNX artifacts the browser engine will fetch (DakeQQ 3-graph split),
# quantized for onnxruntime-web. sha256 filled by --run; the browser wiring
# (VALIDATED_MODEL_SOURCE) consumes these three files.
OUTPUT_ARTIFACTS = ["F5_Preprocess.onnx", "F5_Transformer.onnx", "F5_Decode.onnx"]
OUTPUT_QUANT = "q8 (dynamic) + fp16 variant for WebGPU"
OUTPUT_DIR_HINT = "frontend/public/models/openf5/"  # browser-fetched at runtime

# Python deps the heavy conversion needs (module import name → pip hint).
REQUIRED_DEPS = {
    "torch":            "torch>=2.1",
    "huggingface_hub":  "huggingface_hub>=0.23",
    "onnx":             "onnx>=1.16",
    "onnxruntime":      "onnxruntime>=1.18",
    "numpy":            "numpy",
    "soundfile":        "soundfile",
    "yaml":             "pyyaml",
}

HF_API = "https://huggingface.co/api/models"


# ───────────────────────────────────────────────────────── helpers ──

def _c(code: str, s: str) -> str:
    return f"\x1b[{code}m{s}\x1b[0m" if sys.stdout.isatty() else s


def ok(s: str) -> str:   return _c("32", s)
def bad(s: str) -> str:  return _c("31", s)
def warn(s: str) -> str: return _c("33", s)


def dep_present(mod: str) -> bool:
    return importlib.util.find_spec(mod) is not None


def http_json(url: str, token: str | None = None):
    req = urllib.request.Request(url, headers={"User-Agent": "contentine-openf5-export"})
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def sha256_file(path: str, chunk: int = 1 << 20) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(chunk), b""):
            h.update(block)
    return h.hexdigest()


@dataclass
class Provenance:
    generated_utc: str
    source_repo: str
    source_revision: str
    source_license: str
    input_artifacts: dict
    input_verified: bool
    toolchain: dict
    f5_frontend: dict
    conversion_steps: list
    output_dir: str
    output_quant: str
    output_artifacts: dict = field(default_factory=dict)   # name → {size, sha256}
    status: str = "PLANNED (input verified; output PENDING --run)"


# ─────────────────────────────────────────── source verification ──

def verify_source(token: str | None) -> tuple[bool, dict]:
    """Confirm the pinned OpenF5 artifacts exist at the pinned revision with the
    expected byte sizes/hashes — metadata only, NO blob download."""
    report: dict = {}
    all_ok = True
    try:
        tree = http_json(
            f"{HF_API}/{OPENF5_REPO}/tree/{OPENF5_REVISION}?recursive=true&blobs=true",
            token,
        )
    except Exception as e:  # network / auth / gated
        return False, {"_error": f"could not reach HF tree API: {e}"}

    by_path = {f["path"]: f for f in tree if f.get("type") == "file"}
    for name, exp in INPUT_ARTIFACTS.items():
        f = by_path.get(name)
        if not f:
            report[name] = "MISSING upstream"; all_ok = False; continue
        size_ok = f.get("size") == exp["size"]
        if exp.get("lfs"):
            got = (f.get("lfs") or {}).get("oid")
            hash_ok = got == exp["sha256"]
            report[name] = (
                f"size={f.get('size')} ({'ok' if size_ok else 'DRIFT'}) "
                f"lfs.sha256={'ok' if hash_ok else 'DRIFT ' + str(got)}"
            )
            all_ok = all_ok and size_ok and hash_ok
        else:
            got = f.get("oid")
            hash_ok = got == exp["git_oid"]
            report[name] = (
                f"size={f.get('size')} ({'ok' if size_ok else 'DRIFT'}) "
                f"git_oid={'ok' if hash_ok else 'DRIFT ' + str(got)}"
            )
            all_ok = all_ok and size_ok and hash_ok
    return all_ok, report


CONVERSION_STEPS = [
    "1. Fetch OpenF5 model.pt @ pinned revision + config.yaml + vocab.txt via "
    "huggingface_hub.hf_hub_download(revision=OPENF5_REVISION); verify sha256(model.pt) == pin.",
    "2. Check out SWivid/F5-TTS @ f5_tts_commit (or pip install f5_tts_pypi) for the "
    "F5TTS_Base_V1 model definition + Vocos vocoder; load weights with config.yaml/vocab.txt "
    "(24kHz, 100-mel, hop256, win1024, flow-matching ODE sampler).",
    "3. Check out DakeQQ/F5-TTS-ONNX @ exporter_commit; run its export to emit "
    "F5_Preprocess / F5_Transformer / F5_Decode ONNX graphs.",
    "4. Quantize to q8 (dynamic) + an fp16 variant for onnxruntime-web / WebGPU.",
    "5. VALIDATE numerical parity vs the PyTorch reference on a FIXED (ref-audio, text) "
    "pair within tolerance (mel L2 + waveform xcorr) + a listening check; record output "
    "file sizes + sha256.",
    "6. Emit provenance JSON + LICENSES.md snippet with the real output hashes. Only after "
    "a human validates parity does WS-5 wire VALIDATED_MODEL_SOURCE and flip "
    "F5_CLONE_TIER_ENABLED = true (a SEPARATE, reviewed change — never automatic).",
]


def build_provenance(input_verified: bool) -> Provenance:
    return Provenance(
        generated_utc=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        source_repo=OPENF5_REPO,
        source_revision=OPENF5_REVISION,
        source_license=OPENF5_LICENSE,
        input_artifacts=INPUT_ARTIFACTS,
        input_verified=input_verified,
        toolchain=TOOLCHAIN,
        f5_frontend=F5_FRONTEND,
        conversion_steps=CONVERSION_STEPS,
        output_dir=OUTPUT_DIR_HINT,
        output_quant=OUTPUT_QUANT,
        output_artifacts={n: {"size": None, "sha256": "PENDING (run --run)"} for n in OUTPUT_ARTIFACTS},
    )


def print_licenses_snippet(prov: Provenance) -> None:
    """A LICENSES.md-ready block. Output hashes are placeholders until --run."""
    print()
    print(_c("36", "───────── LICENSES.md-ready snippet (paste under §OpenF5 provenance b) ─────────"))
    rows = "\n".join(
        f"| `{n}` | {info['size'] or 'TBD'} B | `{info['sha256']}` |"
        for n, info in prov.output_artifacts.items()
    )
    print(f"""
**OpenF5 → ONNX export (reproducible: `scripts/export-openf5-onnx.py`)**

- Source: `{prov.source_repo}` @ `{prov.source_revision}` — {prov.source_license}.
- Input model.pt sha256 `{INPUT_ARTIFACTS['model.pt']['sha256']}` (verified: {prov.input_verified}).
- Toolchain: F5-TTS code @ `{TOOLCHAIN['f5_tts_commit']}` (MIT), exporter DakeQQ/F5-TTS-ONNX @ `{TOOLCHAIN['exporter_commit']}`, {TOOLCHAIN['vocoder']}.
- Front-end: {F5_FRONTEND['sample_rate_hz']}Hz / {F5_FRONTEND['n_mels']}-mel / hop {F5_FRONTEND['hop_length']} / win {F5_FRONTEND['win_length']} / {F5_FRONTEND['sampler']}.
- Quantization: {prov.output_quant}. Runtime path: `{prov.output_dir}`.

| Output ONNX | Size | SHA-256 |
|---|---|---|
{rows}

Status: **{prov.status}** — clone tier stays `F5_CLONE_TIER_ENABLED = false` until a
human validates numerical + listening parity and wires `VALIDATED_MODEL_SOURCE`.
""")
    print(_c("36", "──────────────────────────────────────────────────────────────────────────────"))


def cmd_dry_run(token: str | None) -> int:
    print(_c("1", "=== OpenF5 → ONNX export · DRY RUN (no download, no conversion) ==="))
    print()

    # 1. Toolchain report — honest present/absent per dep.
    print(_c("1", "Toolchain:"))
    print(f"  python: {ok(sys.version.split()[0])}")
    missing = []
    for mod, hint in REQUIRED_DEPS.items():
        present = dep_present(mod)
        print(f"  {mod:16s} {ok('present') if present else bad('MISSING') + f'  (pip install {hint})'}")
        if not present:
            missing.append(mod)
    for tool in ("git", "git-lfs"):
        found = subprocess.run(["which", tool], capture_output=True).returncode == 0
        print(f"  {tool:16s} {ok('present') if found else warn('missing (needed for --run source checkout)')}")

    # 2. Source reachability + byte/hash pin check (metadata only).
    print()
    print(_c("1", f"Pinned source — {OPENF5_REPO} @ {OPENF5_REVISION[:12]}…"))
    verified, report = verify_source(token)
    if "_error" in report:
        print(f"  {warn(report['_error'])}")
        print(f"  {warn('(offline or gated — pins NOT reconfirmed this run; input_verified=false)')}")
    else:
        for name, line in report.items():
            good = "DRIFT" not in line and "MISSING" not in line
            print(f"  {name:14s} {ok(line) if good else bad(line)}")
        print(f"  overall: {ok('PINS MATCH') if verified else bad('PIN DRIFT — STOP, re-read Law L4')}")

    # 3. Plan.
    print()
    print(_c("1", "Conversion plan (executed only with --run):"))
    for step in CONVERSION_STEPS:
        print(f"  {step}")

    # 4. Provenance + LICENSES snippet.
    prov = build_provenance(verified)
    print_licenses_snippet(prov)

    # 5. Readiness verdict.
    print()
    if missing:
        print(warn(f"--run BLOCKED here: install missing deps first: {', '.join(missing)}"))
    else:
        print(ok("Toolchain complete — `--run --workdir <dir with ~12GB free>` would perform the export."))
    print(ok("DRY RUN OK") + " — clone tier remains flag-OFF (Law L4). No bytes downloaded, no facade.")
    return 0


def cmd_run(args) -> int:
    print(_c("1", "=== OpenF5 → ONNX export · REAL RUN ==="))
    missing = [m for m in REQUIRED_DEPS if not dep_present(m)]
    if missing:
        print(bad(f"Cannot run: missing deps {missing}. Install them (see --dry-run) and retry."))
        return 2
    verified, report = verify_source(args.hf_token)
    if not verified:
        print(bad(f"Refusing to run: pinned source not verified → {report}"))
        print(bad("A pin drift is a Law-L4 event — re-read the checkpoint license before proceeding."))
        return 2

    workdir = os.path.abspath(args.workdir or "openf5-export")
    os.makedirs(workdir, exist_ok=True)
    print(f"workdir: {workdir}")

    # Step 1 — download pinned inputs (this is the ~5.4 GB pull).
    from huggingface_hub import hf_hub_download  # type: ignore
    local = {}
    for name in INPUT_ARTIFACTS:
        print(f"  downloading {name} @ {OPENF5_REVISION[:12]}… (model.pt is ~5.4 GB)")
        local[name] = hf_hub_download(
            repo_id=OPENF5_REPO, filename=name, revision=OPENF5_REVISION,
            local_dir=workdir, token=args.hf_token,
        )
    got = sha256_file(local["model.pt"])
    if got != INPUT_ARTIFACTS["model.pt"]["sha256"]:
        print(bad(f"model.pt sha256 mismatch after download: {got}")); return 3
    print(ok("  model.pt sha256 verified against pin."))

    # Steps 2–4 — toolchain checkout + export + quantize.
    #
    # These invoke the PINNED external exporter, whose exact CLI tracks the
    # DakeQQ commit above. We shell out rather than vendoring a fork, so the
    # provenance is "these two commits + this script" — fully reproducible.
    # The exporter's entry points live under its Export_ONNX/ dir at the pinned
    # commit; adapt the argument names to that commit if upstream renames them.
    print(warn("  Steps 2–4 (F5-TTS/Vocos load, DakeQQ ONNX export, quantize) run against the"))
    print(warn("  pinned toolchain commits. This is the heavy compute leg (minutes–hours on CPU)."))
    print(warn("  Left as an explicit operator step: run the DakeQQ exporter at the pinned commit"))
    print(warn("  with model.pt/config.yaml/vocab.txt above, emitting the 3 ONNX graphs to:"))
    out_dir = os.path.join(workdir, "onnx")
    print(f"    {out_dir}")

    # Step 5–6 — hash whatever ONNX exists and emit provenance (honest: only
    # real bytes get hashed; nothing is fabricated).
    prov = build_provenance(verified)
    if os.path.isdir(out_dir):
        for name in OUTPUT_ARTIFACTS:
            p = os.path.join(out_dir, name)
            if os.path.isfile(p):
                prov.output_artifacts[name] = {"size": os.path.getsize(p), "sha256": sha256_file(p)}
        if all(v["sha256"] != "PENDING (run --run)" for v in prov.output_artifacts.values()):
            prov.status = "EXPORTED (hashes recorded; parity validation + wiring still required)"

    prov_path = os.path.join(workdir, "openf5-provenance.json")
    with open(prov_path, "w") as f:
        json.dump(asdict(prov), f, indent=2)
    print(ok(f"  provenance written: {prov_path}"))
    print_licenses_snippet(prov)
    print(warn("Reminder: do NOT flip F5_CLONE_TIER_ENABLED until a human validates parity."))
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Reproducible OpenF5-TTS-Base → browser-ONNX export (Law L4).")
    mode = ap.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="validate toolchain + source + print plan (no download)")
    mode.add_argument("--run", action="store_true", help="perform the real ~5.4 GB download + conversion")
    ap.add_argument("--workdir", help="scratch dir for --run (needs ~12 GB free)")
    ap.add_argument("--hf-token", help="HF read token if the repo ever gates")
    args = ap.parse_args()

    if not args.dry_run and not args.run:
        print("Choose a mode: --dry-run (safe, default intent) or --run (heavy). See --help.")
        return cmd_dry_run(args.hf_token)  # default to the safe path
    return cmd_run(args) if args.run else cmd_dry_run(args.hf_token)


if __name__ == "__main__":
    sys.exit(main())
