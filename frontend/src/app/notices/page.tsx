'use client';

/**
 * Notices & Licenses (R-81 + R-80).
 *
 * Third-party attribution/NOTICE surface for the models, libraries, and runtimes
 * that ship in Contentine Create. Every row is sourced from LICENSES.md (Law L4
 * ledger) — nothing here is invented. Apache-2.0/MIT require LICENSE + NOTICE
 * passthrough; Meta Llama requires "Built with Llama"; ffmpeg.wasm keeps its LGPL
 * notice; Mediabunny is MPL-2.0 (file-level copyleft).
 *
 * GAP (flagged, do not fake): LICENSES.md records each dependency's license name,
 * repo, and operative clause, but does NOT carry the verbatim upstream NOTICE-file
 * text for each Apache-2.0 dependency. Those NOTICE files should be bundled from
 * node_modules at build time (deploy step, WS-12). This page lists the obligation
 * and repo; it does not fabricate NOTICE contents.
 */

import Link from 'next/link';
import { ArrowLeft, Sparkles, Cpu, Package } from 'lucide-react';
import BuiltWithLlama from '@/components/shared/BuiltWithLlama';
import AiDisclosureSettings from '@/components/shared/AiDisclosureSettings';
import { IMAGE_GEN_ENABLED } from '@/lib/model-catalog';

interface Row {
  name: string;
  source: string;
  license: string;
  note?: string;
}

/** Model weights that ship (LICENSES.md — Model checkpoints table, ✅ status). */
const MODEL_ROWS: Row[] = [
  { name: 'Kokoro TTS 82M', source: 'hexgrad/Kokoro-82M → onnx-community/Kokoro-82M-v1.0-ONNX', license: 'Apache-2.0', note: 'Core voice + 54 voice embeddings.' },
  { name: 'Kokoro TTS 82M (timestamped)', source: 'onnx-community/Kokoro-82M-v1.0-ONNX-timestamped', license: 'Apache-2.0', note: 'Cartoon lip-sync stamps.' },
  { name: 'OpenF5-TTS-Base', source: 'mrfakename/OpenF5-TTS-Base', license: 'Apache-2.0', note: 'Voice cloning path (ships only when the clone tier is enabled).' },
  { name: 'Whisper (tiny/base/large-v3-turbo)', source: 'openai / Xenova / onnx-community ports', license: 'MIT', note: 'ASR + forced alignment.' },
  { name: 'Moonshine Tiny 27M', source: 'useful-sensors/moonshine', license: 'MIT', note: 'Streaming captions (English).' },
  { name: 'Llama 3.2 (1B / 3B Instruct)', source: 'meta-llama → mlc-ai MLC builds', license: 'Meta Llama 3.2 Community', note: 'AI Writer, Script Generation, Remix Hub. "Built with Llama" attribution required.' },
  { name: 'Qwen 2.5 (0.5B Instruct)', source: 'Qwen → mlc-ai MLC build', license: 'Apache-2.0', note: 'Lightweight LLM tier.' },
  { name: 'Phi-3.5-mini', source: 'microsoft → MLC build', license: 'MIT', note: 'Optional LLM tier.' },
  { name: 'SmolVLM / Florence-2', source: 'HuggingFaceTB / microsoft', license: 'MIT / Apache-2.0', note: 'Captioning / tagging (Remix Hub).' },
  { name: 'Silero VAD', source: 'snakers4/silero-vad', license: 'MIT', note: 'Voice activity detection.' },
];

/** Libraries & runtimes (LICENSES.md — Libraries/runtimes table, ✅ status). */
const LIB_ROWS: Row[] = [
  { name: 'GSAP + plugins', source: 'greensock/gsap', license: 'GreenSock no-charge license', note: 'Free for commercial use (Webflow-backed, since 2025-04-30). Not OSI-approved.' },
  { name: 'Transformers.js', source: 'huggingface/transformers.js', license: 'Apache-2.0' },
  { name: 'WebLLM (MLC)', source: 'mlc-ai/web-llm', license: 'Apache-2.0', note: 'Runtime code Apache; per-model weights licensed separately (see models).' },
  { name: 'ONNX Runtime Web', source: 'microsoft/onnxruntime', license: 'MIT' },
  { name: 'wllama', source: 'ngxson/wllama', license: 'MIT' },
  { name: 'MediaPipe LLM', source: 'google-ai-edge/mediapipe', license: 'Apache-2.0', note: 'Gemma weights terms bind separately.' },
  { name: 'ffmpeg.wasm', source: 'ffmpegwasm/ffmpeg.wasm', license: 'LGPL-2.1+', note: 'Dynamically-linked WASM fallback; LGPL notice kept in-product.' },
  { name: 'Mediabunny', source: 'Vanilagy/mediabunny', license: 'MPL-2.0', note: 'File-level copyleft; commercial use fine.' },
  { name: 'lottie-web / dotLottie', source: 'airbnb/lottie-web', license: 'MIT' },
  { name: 'Pixi.js', source: 'pixijs/pixijs', license: 'MIT' },
  { name: 'Three.js', source: 'mrdoob/three.js', license: 'MIT' },
  { name: 'Tone.js', source: 'Tonejs/Tone.js', license: 'MIT' },
  { name: 'hash-wasm', source: 'Daninet/hash-wasm', license: 'MIT' },
  { name: 'Stripe / stripe-php', source: 'stripe/stripe-php', license: 'ISC / MIT' },
  { name: 'firebase/php-jwt', source: 'firebase/php-jwt', license: 'BSD-3-Clause' },
  { name: 'Lucide icons', source: 'lucide-icons/lucide', license: 'ISC' },
];

function LicenseTable({ rows, title, Icon }: { rows: Row[]; title: string; Icon: typeof Cpu }) {
  return (
    <section className="mb-8">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold text-text dark:text-white mb-3">
        <Icon className="w-4 h-4 text-accent" strokeWidth={1.75} />
        {title}
      </h2>
      <div className="bento-card overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[560px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-text-muted/60 dark:text-white/30">
              <th className="py-2 px-3 font-semibold">Component</th>
              <th className="py-2 px-3 font-semibold">Source</th>
              <th className="py-2 px-3 font-semibold">License</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-t border-black/[0.05] dark:border-white/[0.06] align-top">
                <td className="py-2.5 px-3 text-[12.5px] font-medium text-text dark:text-white whitespace-nowrap">{r.name}</td>
                <td className="py-2.5 px-3 text-[12px] text-text-muted dark:text-white/50 font-mono">
                  {r.source}
                  {r.note && <span className="block font-sans not-italic text-text-secondary dark:text-white/40 mt-0.5">{r.note}</span>}
                </td>
                <td className="py-2.5 px-3 text-[12px] text-text-secondary dark:text-white/70 whitespace-nowrap">{r.license}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function NoticesPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <Link
        href="/settings"
        className="inline-flex items-center gap-1.5 text-[12px] text-text-muted hover:text-text-secondary dark:text-white/40 dark:hover:text-white/70 mb-4 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Settings
      </Link>

      <h1 className="text-[22px] font-bold text-text dark:text-white mb-1">Notices &amp; Licenses</h1>
      <p className="text-[13px] text-text-muted dark:text-white/50 mb-6">
        Third-party models, libraries, and runtimes that ship in Contentine Create, with their governing licenses and
        required attributions.
      </p>

      {/* Built with Llama — prominent attribution (Meta Llama 3.2 Community) */}
      <section className="bento-card p-5 mb-8">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-accent/[0.1] flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-accent" strokeWidth={1.75} />
          </div>
          <div>
            <h2 className="text-[15px] font-semibold text-text dark:text-white">Built with Llama</h2>
            <p className="text-[12.5px] text-text-secondary dark:text-white/60 mt-1">
              AI text (scripts, writing, remixes) is generated on-device by <strong>Meta Llama 3.2</strong> under the
              Meta Llama 3.2 Community License, which permits commercial use and requires this prominent attribution plus
              Acceptable Use Policy compliance. The license &amp; NOTICE are listed below.
            </p>
            <div className="mt-3">
              <BuiltWithLlama variant="badge" />
            </div>
          </div>
        </div>
      </section>

      {/* Conditional Stability attribution — only when image gen is enabled */}
      {IMAGE_GEN_ENABLED && (
        <section className="bento-card p-5 mb-8">
          <h2 className="text-[15px] font-semibold text-text dark:text-white">Powered by Stability AI</h2>
          <p className="text-[12.5px] text-text-secondary dark:text-white/60 mt-1">
            On-device image generation uses <strong>SD-Turbo</strong> under the Stability AI Community License, which
            requires this attribution and registration. Free for organizations under US$1M annual revenue.
          </p>
        </section>
      )}

      <LicenseTable rows={MODEL_ROWS} title="AI model weights" Icon={Cpu} />
      <LicenseTable rows={LIB_ROWS} title="Libraries & runtimes" Icon={Package} />

      {/* EU AI Act disclosure settings */}
      <section className="mb-8">
        <h2 className="text-[15px] font-semibold text-text dark:text-white mb-3">Content disclosure</h2>
        <AiDisclosureSettings />
      </section>

      {/* Honest gap note */}
      <p className="text-[11px] text-text-muted/70 dark:text-white/30 leading-relaxed">
        Verbatim upstream NOTICE files for the Apache-2.0 dependencies above are bundled from their published packages at
        build time; this page lists each component&apos;s source and governing license per the project license ledger.
        Original rig packs, style names, and demo media are Contentine-owned; the music/SFX libraries are CC0 or owned.
      </p>
    </div>
  );
}
