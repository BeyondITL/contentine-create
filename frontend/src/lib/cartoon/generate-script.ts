/**
 * Contentine Create — Cartoon Studio: on-device script drafting (WS-4, C-M2 P0).
 *
 * Replaces the old server call (`/scripts/generate`) — which silently no-oped on
 * a fresh/unauthenticated profile — with browser-native WebLLM (llama-3.2-1b,
 * Law L2). The model is downloaded first through the readiness gate; this module
 * only runs inference on the already-initialized engine and NEVER swallows an
 * error: WebGPU-absent and parse failures throw a clear, user-readable reason.
 */

export interface CartoonScriptInput {
  topic: string;
  tone: string;
  length: string;
  platform: string;
}

export interface CartoonScriptResult {
  title: string;
  /** One short spoken line per scene (single narrator). */
  scenes: string[];
}

const SYSTEM_PROMPT =
  'You are a cartoon scriptwriter. Given a topic you write a short, punchy single-narrator ' +
  'cartoon script. Respond with ONLY valid minified JSON, no prose, no code fences, in exactly ' +
  'this shape: {"title": string, "scenes": string[]}. Each scenes entry is ONE spoken line of ' +
  '1-2 sentences. Produce 3 to 6 scenes. Keep it original — no real brand, show, or character names.';

function sceneCountHint(length: string): string {
  if (/short/i.test(length)) return 'Write 3 scenes.';
  if (/long/i.test(length)) return 'Write 6 scenes.';
  return 'Write 4 to 5 scenes.';
}

/** Extract the first balanced JSON object from a model response. */
function extractJson(raw: string): string {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('The AI returned an unexpected format. Please try again.');
  }
  return raw.slice(start, end + 1);
}

function parseScript(raw: string, fallbackTitle: string): CartoonScriptResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    throw new Error('Could not read the AI script. Please try again.');
  }
  const obj = parsed as { title?: unknown; scenes?: unknown };
  const rawScenes = Array.isArray(obj.scenes) ? obj.scenes : [];
  const scenes = rawScenes
    .map((s) => (typeof s === 'string' ? s : (s as { narration?: string; text?: string })?.narration ?? (s as { text?: string })?.text ?? ''))
    .map((s) => String(s).trim())
    .filter(Boolean);
  if (scenes.length === 0) {
    throw new Error('The AI did not return any scenes. Please try a different topic.');
  }
  const title = typeof obj.title === 'string' && obj.title.trim() ? obj.title.trim() : fallbackTitle;
  return { title, scenes };
}

/**
 * Draft a cartoon script on-device. Requires WebGPU + the llama-3.2-1b model
 * already downloaded (the caller gates on `useModelReadiness('cartoon-script')`).
 */
export async function generateCartoonScript(
  input: CartoonScriptInput,
  onToken?: (text: string) => void,
): Promise<CartoonScriptResult> {
  // Dynamic import — Law L8 (WebLLM/onnx never lands in the page bundle).
  const { webllmEngine } = await import('@/engine/webllm-engine');

  if (!(await webllmEngine.isAvailable())) {
    throw new Error(
      'AI drafting needs WebGPU (Chrome or Edge on desktop). You can type your scenes below instead.',
    );
  }

  const userPrompt =
    `Topic: ${input.topic}\nTone: ${input.tone}\nPlatform: ${input.platform}\n${sceneCountHint(input.length)}`;

  // Decode-time JSON guarantee (WebLLM XGrammar): the model can only emit
  // syntactically valid JSON, so the {"title","scenes"} shape holds at
  // generation time rather than being coaxed by the prompt alone. parseScript
  // stays as defense-in-depth; if the engine lacks grammar support the engine
  // logs it and falls back to prompt-only JSON (still parsed below).
  //
  // `schema` is REQUIRED (SA-34): WebLLM 0.2.84 compiles `json_object` through
  // `compileJSONSchema(schema)` with no undefined-guard, and the resulting embind
  // "Cannot pass non-string to std::string" throws inside an async promise
  // executor that never settles — an unhandled rejection plus a permanent
  // "Drafting script…" spinner. It is a JSON-Schema STRING, not an object.
  // Scene count is left to the prompt: item-count keywords are not uniformly
  // supported by the compiled grammar backend, and over-constraining here
  // trades a soft miss for a hard failure.
  const jsonFormat = {
    type: 'json_object',
    schema: JSON.stringify({
      type: 'object',
      properties: {
        title: { type: 'string' },
        scenes: { type: 'array', items: { type: 'string' } },
      },
      required: ['title', 'scenes'],
    }),
  } as const;
  const raw = onToken
    ? await webllmEngine.generateStream(SYSTEM_PROMPT, userPrompt, onToken, {
        temperature: 0.8,
        maxTokens: 1200,
        responseFormat: jsonFormat,
      })
    : await webllmEngine.generate(SYSTEM_PROMPT, userPrompt, {
        temperature: 0.8,
        maxTokens: 1200,
        responseFormat: jsonFormat,
      });

  return parseScript(raw, input.topic.slice(0, 60) || 'My Cartoon');
}
