<?php

declare(strict_types=1);

namespace Contentine\Controllers;

use Contentine\Auth;
use Contentine\Middleware\InputValidator;
use Contentine\Services\LLMService;
use Contentine\Services\AiProviderService;
use Contentine\Services\CreditService;

/** Proxies script generation requests to the LLM API. */
class ScriptController
{
    /** POST /api/scripts/generate — generate a video script via Claude/GPT/Gemini (tier-aware). */
    public function generate(array $params, array $body): void
    {
        $user = Auth::requireScope('scripts:generate');

        $clean = InputValidator::sanitize($body, [
            'topic'    => 'required|string|max:500|min:1',
            'tone'     => 'string|max:50',
            'length'   => 'string|max:50',
            'platform' => 'string|max:50',
            'tier'     => 'string|max:20',
            'service'  => 'string|max:50',
        ]);

        $topic = $clean['topic'];
        $tone = $clean['tone'] ?? 'Engaging';
        $length = $clean['length'] ?? 'Short (30s)';
        $platform = $clean['platform'] ?? 'TikTok';

        // Map length to scene/duration constraints
        $durationGuide = match (true) {
            str_contains($length, 'Short') => '15-30 seconds total, 3-5 scenes',
            str_contains($length, 'Medium') => '45-60 seconds total, 5-8 scenes',
            str_contains($length, 'Long') => '2-5 minutes total, 10-25 scenes',
            default => '30-60 seconds total, 4-8 scenes',
        };

        $systemPrompt = <<<PROMPT
You are a video script generator for short-form social media videos on {$platform}.
Given the topic below, create a compelling video script.

Output ONLY valid JSON in this exact format:
{
  "title": "Video title",
  "scenes": [
    {
      "narration": "What the voiceover says for this scene",
      "visual_prompt": "Detailed image generation prompt for this scene's visual — subject, action, setting, mood, camera angle",
      "duration": 5
    }
  ],
  "total_duration": 30,
  "suggested_music_mood": "upbeat"
}

Rules:
- {$durationGuide}
- Tone: {$tone}
- Target platform: {$platform}
- Start with a hook that creates curiosity (first 3 seconds)
- Each visual_prompt should be specific, cinematic, and visually distinct
- Narration should be conversational and natural — how people actually talk
- End with a clear CTA scene
- Each scene duration: 3-10 seconds based on narration length
- visual_prompt should describe: subject, action, setting, mood, camera angle
- Pacing: fast for hooks (3s), moderate for info (5-7s), slow for impact (8-10s)
PROMPT;

        $userMessage = "Create a video script about: {$topic}";

        try {
            $tier = $clean['tier'] ?? 'browser';
            $service = $clean['service'] ?? 'anthropic';

            // Resolve API key for tier
            $apiKey = null;
            if ($tier !== 'browser') {
                $providerSvc = new AiProviderService();
                $apiKey = $providerSvc->resolveApiKey((int)$user['id'], $service, $tier);
            }

            // Deduct credits (tier-aware)
            $creditSvc = new CreditService();
            $deduction = $creditSvc->deductForFeature((int)$user['id'], 'ai_script_generate', $tier);
            if (isset($deduction['deducted']) && !$deduction['deducted']) {
                http_response_code(402);
                echo json_encode(['error' => 'Insufficient credits', 'shortfall' => $deduction['shortfall'] ?? 0]);
                return;
            }

            $llm = new LLMService();
            $response = ($tier === 'browser')
                ? $llm->callClaude($systemPrompt, $userMessage, 0.7, 3000)
                : $llm->callForService($service, $systemPrompt, $userMessage, 0.7, 3000, $apiKey);

            // Try to parse JSON from response
            $json = $this->extractJSON($response);

            if (!$json || !isset($json['scenes'])) {
                http_response_code(500);
                echo json_encode(['error' => 'Failed to parse script. Please try again.']);
                return;
            }

            echo json_encode([
                'title' => $json['title'] ?? $topic,
                'scenes' => $json['scenes'],
                'total_duration' => $json['total_duration'] ?? 0,
                'suggested_music_mood' => $json['suggested_music_mood'] ?? 'upbeat',
            ]);
        } catch (\Exception $e) {
            error_log("Script generation error: " . $e->getMessage());
            http_response_code(500);
            echo json_encode(['error' => 'Script generation failed. Please try again.']);
        }
    }

    /** Extract JSON object from an LLM response that may contain markdown fences. */
    private function extractJSON(string $text): ?array
    {
        // Remove markdown code fences if present
        $text = preg_replace('/```json\s*/i', '', $text);
        $text = preg_replace('/```\s*/', '', $text);
        $text = trim($text);

        // Try direct parse
        $json = json_decode($text, true);
        if ($json !== null) {
            return $json;
        }

        // Try to find JSON object in the text
        if (preg_match('/\{[\s\S]*\}/', $text, $matches)) {
            $json = json_decode($matches[0], true);
            if ($json !== null) {
                return $json;
            }
        }

        return null;
    }
}
