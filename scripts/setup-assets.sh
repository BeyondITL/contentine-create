#!/bin/bash
# scripts/setup-assets.sh — Run once after npm install
# NOTE: FFmpeg.wasm section REMOVED in v2.2 — using Mediabunny (pure TS, no WASM needed)
set -e

echo "=== Contentine Create: Asset Localization ==="

# ──────────────────────────────────────────────
# 1. face-api.js model weights
#    npm:  face-api.js@0.22.2 (MIT)
#    weights source: https://github.com/justadudewhohacks/face-api.js/tree/master/weights
#    NOTE: face_recognition_model removed — unused in codebase, saves ~6.2MB
# ──────────────────────────────────────────────
echo "[1/5] Downloading face-api.js models..."
mkdir -p frontend/public/models/face-api
FACE_API_BASE="https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights"

curl -L "${FACE_API_BASE}/tiny_face_detector_model-weights_manifest.json" -o frontend/public/models/face-api/tiny_face_detector_model-weights_manifest.json
curl -L "${FACE_API_BASE}/tiny_face_detector_model-shard1"                -o frontend/public/models/face-api/tiny_face_detector_model-shard1
curl -L "${FACE_API_BASE}/face_landmark_68_model-weights_manifest.json"   -o frontend/public/models/face-api/face_landmark_68_model-weights_manifest.json
curl -L "${FACE_API_BASE}/face_landmark_68_model-shard1"                  -o frontend/public/models/face-api/face_landmark_68_model-shard1
curl -L "${FACE_API_BASE}/face_expression_model-weights_manifest.json"    -o frontend/public/models/face-api/face_expression_model-weights_manifest.json
curl -L "${FACE_API_BASE}/face_expression_model-shard1"                   -o frontend/public/models/face-api/face_expression_model-shard1
curl -L "${FACE_API_BASE}/face_expression_model-shard2"                   -o frontend/public/models/face-api/face_expression_model-shard2

# ──────────────────────────────────────────────
# 2. Kokoro TTS voice files (5 defaults)
# ──────────────────────────────────────────────
echo "[2/5] Pre-downloading Kokoro TTS voice files (5 defaults)..."
mkdir -p frontend/public/models/kokoro-voices
KOKORO_BASE="https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices"

curl -L "${KOKORO_BASE}/af_sky.bin"     -o frontend/public/models/kokoro-voices/af_sky.bin
curl -L "${KOKORO_BASE}/af_bella.bin"   -o frontend/public/models/kokoro-voices/af_bella.bin
curl -L "${KOKORO_BASE}/am_adam.bin"    -o frontend/public/models/kokoro-voices/am_adam.bin
curl -L "${KOKORO_BASE}/am_michael.bin" -o frontend/public/models/kokoro-voices/am_michael.bin
curl -L "${KOKORO_BASE}/bf_emma.bin"    -o frontend/public/models/kokoro-voices/bf_emma.bin

echo "  NOTE: Main ONNX model (~87MB) downloads on first TTS use with progress bar."

# ──────────────────────────────────────────────
# 3. PDF.js worker
# ──────────────────────────────────────────────
echo "[3/5] Copying PDF.js worker..."
mkdir -p frontend/public/workers
# Check frontend/node_modules first (monorepo), then root node_modules
if [ -f frontend/node_modules/pdfjs-dist/build/pdf.worker.min.mjs ]; then
  cp frontend/node_modules/pdfjs-dist/build/pdf.worker.min.mjs frontend/public/workers/pdf.worker.min.mjs
elif [ -f frontend/node_modules/pdfjs-dist/build/pdf.worker.min.js ]; then
  cp frontend/node_modules/pdfjs-dist/build/pdf.worker.min.js frontend/public/workers/pdf.worker.min.js
elif [ -f node_modules/pdfjs-dist/build/pdf.worker.min.mjs ]; then
  cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs frontend/public/workers/pdf.worker.min.mjs
elif [ -f node_modules/pdfjs-dist/build/pdf.worker.min.js ]; then
  cp node_modules/pdfjs-dist/build/pdf.worker.min.js frontend/public/workers/pdf.worker.min.js
else
  echo "  WARNING: pdf.worker not found. Run npm install first."
fi

# ──────────────────────────────────────────────
# 4. ONNX Runtime Web WASM
# ──────────────────────────────────────────────
echo "[4/5] Copying ONNX Runtime WASM..."
mkdir -p frontend/public/wasm/ort
# Check frontend/node_modules first, then root node_modules
# NOTE: the .mjs ES-module glue MUST ship next to the .wasm — ORT's WebGPU
# (JSEP) backend imports it at runtime from env.wasm.wasmPaths ('/wasm/ort/',
# set in sd-turbo-engine). Wasm alone is not loadable.
if [ -d frontend/node_modules/onnxruntime-web/dist ]; then
  cp frontend/node_modules/onnxruntime-web/dist/*.wasm frontend/public/wasm/ort/ 2>/dev/null || true
  cp frontend/node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded*.mjs frontend/public/wasm/ort/ 2>/dev/null || true
  echo "  ONNX Runtime WASM+MJS files copied from frontend/node_modules."
elif [ -d node_modules/onnxruntime-web/dist ]; then
  cp node_modules/onnxruntime-web/dist/*.wasm frontend/public/wasm/ort/ 2>/dev/null || true
  cp node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded*.mjs frontend/public/wasm/ort/ 2>/dev/null || true
  echo "  ONNX Runtime WASM+MJS files copied from root node_modules."
else
  echo "  onnxruntime-web not installed yet. Will copy when needed."
fi

# ──────────────────────────────────────────────
# 5. TalkingHead default GLB avatar
# ──────────────────────────────────────────────
echo "[5/5] Setting up default TalkingHead avatar..."
mkdir -p frontend/public/models/avatars
if [ ! -f frontend/public/models/avatars/default.glb ]; then
  # Try downloading from a public GLB model source
  # Note: Ready Player Me shut down Jan 2026 — use alternative open-source avatar
  # The TalkingHead library repo includes example models
  echo "  NOTE: No default.glb avatar found."
  echo "  You need to provide a GLB avatar model with ARKit blend shapes at:"
  echo "    frontend/public/models/avatars/default.glb"
  echo ""
  echo "  Options to obtain a compatible GLB avatar:"
  echo "    1. Export from Mixamo (mixamo.com) with ARKit targets"
  echo "    2. Use TalkingHead library example models"
  echo "    3. Create in Blender with ARKit blend shape names (52 shapes)"
  echo "    4. Download from Sketchfab (filter: GLB, rigged, facial blend shapes)"
  echo ""
  echo "  The model MUST have: ARKit-compatible blend shapes, Mixamo-compatible rig, GLB format"
else
  echo "  default.glb avatar already exists."
fi

# ──────────────────────────────────────────────
# 6. transformers.js ONNX Runtime WASM (worker + main thread, offline-capable)
#    transformers.js bundles its OWN ort build — version must match, so these
#    ship separately from onnxruntime-web's /wasm/ort/ files.
# ──────────────────────────────────────────────
echo "[6/7] Copying transformers.js ONNX Runtime WASM..."
mkdir -p frontend/public/wasm/transformers
if [ -d frontend/node_modules/@huggingface/transformers/dist ]; then
  cp frontend/node_modules/@huggingface/transformers/dist/ort-wasm-simd-threaded*.wasm frontend/public/wasm/transformers/ 2>/dev/null || true
  cp frontend/node_modules/@huggingface/transformers/dist/ort-wasm-simd-threaded*.mjs frontend/public/wasm/transformers/ 2>/dev/null || true
  echo "  transformers.js ORT WASM+MJS copied."
else
  echo "  WARNING: @huggingface/transformers not installed — TTS worker WASM missing."
fi

# ──────────────────────────────────────────────
# 7. Kokoro TTS worker bundle (esbuild)
#    Bundles src/engine/tts-worker.ts + kokoro-js + transformers.js + the
#    model storage layer into ONE worker file. Replaces the old hand-written
#    worker that imported kokoro-js from the jsdelivr CDN at runtime (Law L2
#    offline violation; storage layer could not reach it).
# ──────────────────────────────────────────────
echo "[7/8] Bundling Kokoro TTS worker (esbuild)..."
(cd frontend && npx esbuild src/engine/tts-worker.ts \
  --bundle --format=esm --platform=browser --minify \
  --outfile=public/workers/tts-worker.js)
echo "  TTS worker bundled: frontend/public/workers/tts-worker.js"

# ──────────────────────────────────────────────
# 8. Cartoon deterministic render worker bundle (esbuild)
#    Bundles src/engine/cartoon/render-worker.ts (GSAP seek → OffscreenCanvas →
#    WebCodecs H.264 → Mediabunny mux) into ONE module worker file. The full-UI
#    cartoon flow loads it as a STATIC asset: CartoonGenerateStep.tsx passes
#    workerUrl:'/render-worker.js' (the engine's default new URL('./render-worker.ts')
#    does not compile under the Next static export). Without this file the render
#    worker 404s and the cartoon render crashes at ~10% ("Render worker crashed").
#    Same engine the C-M1 harness (harness/run-c-m1.mjs) esbuilds + proves 4/4.
# ──────────────────────────────────────────────
echo "[8/8] Bundling cartoon render worker (esbuild)..."
node scripts/build-cartoon-worker.mjs

echo ""
echo "=== Asset setup complete ==="
echo "  Face-API models: frontend/public/models/face-api/   (~1MB, detector+landmarks+expression)"
echo "  Kokoro voices:   frontend/public/models/kokoro-voices/ (~15MB, 5 defaults)"
echo "  PDF.js worker:   frontend/public/workers/           (~800KB)"
echo "  Render worker:   frontend/public/render-worker.js   (~700KB, cartoon)"
echo "  ONNX Runtime:    frontend/public/wasm/ort/          (if installed)"
echo "  Avatar GLB:      frontend/public/models/avatars/    (manual setup)"
echo ""
echo "NOTE: FFmpeg WASM removed in v2.2 — Mediabunny (pure TS) needs no WASM files."
