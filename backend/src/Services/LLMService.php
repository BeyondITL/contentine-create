<?php

declare(strict_types=1);

namespace Contentine\Services;

class LLMService
{
    private ApiKeyService $keyService;

    public function __construct()
    {
        $this->keyService = new ApiKeyService();
    }

    /**
     * Call Anthropic Claude API
     */
    public function callClaude(string $systemPrompt, string $userMessage, float $temperature = 0.7, int $maxTokens = 4096): string
    {
        $keyInfo = $this->keyService->getKey('anthropic');
        if (!$keyInfo) {
            throw new \RuntimeException('No active Anthropic API key available');
        }

        try {
            $response = $this->httpPost('https://api.anthropic.com/v1/messages', [
                'model' => 'claude-sonnet-4-20250514',
                'max_tokens' => $maxTokens,
                'temperature' => $temperature,
                'system' => $systemPrompt,
                'messages' => [
                    ['role' => 'user', 'content' => $userMessage],
                ],
            ], [
                'x-api-key: ' . $keyInfo['api_key'],
                'anthropic-version: 2023-06-01',
                'Content-Type: application/json',
            ]);

            $this->keyService->recordUsage($keyInfo['key_id'], 'anthropic', '/v1/messages');

            $data = json_decode($response, true);
            return $data['content'][0]['text'] ?? '';
        } catch (\RuntimeException $e) {
            // On 429 (rate limit) or 403 (auth), report failure and try fallback key
            if (str_contains($e->getMessage(), 'HTTP 429') || str_contains($e->getMessage(), 'HTTP 403')) {
                $this->keyService->reportKeyFailure($keyInfo['key_id'], $e->getMessage());
                $this->keyService->recordUsage($keyInfo['key_id'], 'anthropic', '/v1/messages', 1, str_contains($e->getMessage(), '429') ? 429 : 403, $e->getMessage());

                // Try next available key
                $fallbackKey = $this->keyService->getKey('anthropic');
                if ($fallbackKey && $fallbackKey['key_id'] !== $keyInfo['key_id']) {
                    $fallbackResponse = $this->httpPost('https://api.anthropic.com/v1/messages', [
                        'model' => 'claude-sonnet-4-20250514',
                        'max_tokens' => $maxTokens,
                        'temperature' => $temperature,
                        'system' => $systemPrompt,
                        'messages' => [
                            ['role' => 'user', 'content' => $userMessage],
                        ],
                    ], [
                        'x-api-key: ' . $fallbackKey['api_key'],
                        'anthropic-version: 2023-06-01',
                        'Content-Type: application/json',
                    ]);

                    $this->keyService->recordUsage($fallbackKey['key_id'], 'anthropic', '/v1/messages');

                    $data = json_decode($fallbackResponse, true);
                    return $data['content'][0]['text'] ?? '';
                }
            }

            $this->keyService->recordUsage($keyInfo['key_id'], 'anthropic', '/v1/messages', 1, 500, $e->getMessage());
            throw $e;
        }
    }

    /**
     * Call OpenAI API (fallback / specific use cases)
     */
    public function callOpenAI(string $systemPrompt, string $userMessage, float $temperature = 0.7, int $maxTokens = 4096): string
    {
        $keyInfo = $this->keyService->getKey('openai');
        if (!$keyInfo) {
            throw new \RuntimeException('No active OpenAI API key available');
        }

        try {
            $response = $this->httpPost('https://api.openai.com/v1/chat/completions', [
                'model' => 'gpt-4o',
                'max_tokens' => $maxTokens,
                'temperature' => $temperature,
                'messages' => [
                    ['role' => 'system', 'content' => $systemPrompt],
                    ['role' => 'user', 'content' => $userMessage],
                ],
            ], [
                'Authorization: Bearer ' . $keyInfo['api_key'],
                'Content-Type: application/json',
            ]);

            $this->keyService->recordUsage($keyInfo['key_id'], 'openai', '/v1/chat/completions');

            $data = json_decode($response, true);
            return $data['choices'][0]['message']['content'] ?? '';
        } catch (\RuntimeException $e) {
            // On 429 (rate limit) or 403 (auth), report failure and try fallback key
            if (str_contains($e->getMessage(), 'HTTP 429') || str_contains($e->getMessage(), 'HTTP 403')) {
                $this->keyService->reportKeyFailure($keyInfo['key_id'], $e->getMessage());
                $this->keyService->recordUsage($keyInfo['key_id'], 'openai', '/v1/chat/completions', 1, str_contains($e->getMessage(), '429') ? 429 : 403, $e->getMessage());

                // Try next available key
                $fallbackKey = $this->keyService->getKey('openai');
                if ($fallbackKey && $fallbackKey['key_id'] !== $keyInfo['key_id']) {
                    $fallbackResponse = $this->httpPost('https://api.openai.com/v1/chat/completions', [
                        'model' => 'gpt-4o',
                        'max_tokens' => $maxTokens,
                        'temperature' => $temperature,
                        'messages' => [
                            ['role' => 'system', 'content' => $systemPrompt],
                            ['role' => 'user', 'content' => $userMessage],
                        ],
                    ], [
                        'Authorization: Bearer ' . $fallbackKey['api_key'],
                        'Content-Type: application/json',
                    ]);

                    $this->keyService->recordUsage($fallbackKey['key_id'], 'openai', '/v1/chat/completions');

                    $data = json_decode($fallbackResponse, true);
                    return $data['choices'][0]['message']['content'] ?? '';
                }
            }

            $this->keyService->recordUsage($keyInfo['key_id'], 'openai', '/v1/chat/completions', 1, 500, $e->getMessage());
            throw $e;
        }
    }

    /**
     * Call Google Gemini API (Flash/Pro).
     * Accepts optional explicit API key for BYOK.
     */
    public function callGemini(string $systemPrompt, string $userMessage, float $temperature = 0.7, int $maxTokens = 4096, ?string $apiKey = null): string
    {
        if (!$apiKey) {
            $keyInfo = $this->keyService->getKey('gemini');
            if (!$keyInfo) {
                throw new \RuntimeException('No active Gemini API key available');
            }
            $apiKey = $keyInfo['api_key'];
            $keyId = $keyInfo['key_id'];
        } else {
            $keyId = null;
        }

        try {
            $body = json_encode([
                'contents' => [
                    ['role' => 'user', 'parts' => [['text' => $userMessage]]],
                ],
                'systemInstruction' => ['parts' => [['text' => $systemPrompt]]],
                'generationConfig' => [
                    'temperature' => $temperature,
                    'maxOutputTokens' => $maxTokens,
                ],
            ]);

            $url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' . urlencode($apiKey);

            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_POST => true,
                CURLOPT_POSTFIELDS => $body,
                CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 120,
            ]);

            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if ($httpCode < 200 || $httpCode >= 300) {
                throw new \RuntimeException("Gemini API error: HTTP {$httpCode} — {$response}");
            }

            if ($keyId) {
                $this->keyService->recordUsage($keyId, 'gemini', '/v1beta/generateContent');
            }

            $data = json_decode($response, true);
            return $data['candidates'][0]['content']['parts'][0]['text'] ?? '';
        } catch (\RuntimeException $e) {
            if ($keyId) {
                $this->keyService->recordUsage($keyId, 'gemini', '/v1beta/generateContent', 1, 500, $e->getMessage());
            }
            throw $e;
        }
    }

    /**
     * Dispatch a text generation call to the correct service based on service name.
     * For BYOK, pass the resolved API key. For system API, key is resolved internally.
     */
    public function callForService(string $service, string $systemPrompt, string $userMessage, float $temperature = 0.7, int $maxTokens = 4096, ?string $apiKey = null): string
    {
        return match ($service) {
            'anthropic' => $apiKey ? $this->callClaudeWithKey($apiKey, $systemPrompt, $userMessage, $temperature, $maxTokens) : $this->callClaude($systemPrompt, $userMessage, $temperature, $maxTokens),
            'openai'    => $apiKey ? $this->callOpenAIWithKey($apiKey, $systemPrompt, $userMessage, $temperature, $maxTokens) : $this->callOpenAI($systemPrompt, $userMessage, $temperature, $maxTokens),
            'gemini'    => $this->callGemini($systemPrompt, $userMessage, $temperature, $maxTokens, $apiKey),
            default     => $this->callClaude($systemPrompt, $userMessage, $temperature, $maxTokens),
        };
    }

    /** Call Claude with an explicit API key (BYOK). */
    private function callClaudeWithKey(string $apiKey, string $systemPrompt, string $userMessage, float $temperature, int $maxTokens): string
    {
        $response = $this->httpPost('https://api.anthropic.com/v1/messages', [
            'model' => 'claude-sonnet-4-20250514',
            'max_tokens' => $maxTokens,
            'temperature' => $temperature,
            'system' => $systemPrompt,
            'messages' => [['role' => 'user', 'content' => $userMessage]],
        ], [
            'x-api-key: ' . $apiKey,
            'anthropic-version: 2023-06-01',
            'Content-Type: application/json',
        ]);

        $data = json_decode($response, true);
        return $data['content'][0]['text'] ?? '';
    }

    /** Call OpenAI with an explicit API key (BYOK). */
    private function callOpenAIWithKey(string $apiKey, string $systemPrompt, string $userMessage, float $temperature, int $maxTokens): string
    {
        $response = $this->httpPost('https://api.openai.com/v1/chat/completions', [
            'model' => 'gpt-4o',
            'max_tokens' => $maxTokens,
            'temperature' => $temperature,
            'messages' => [
                ['role' => 'system', 'content' => $systemPrompt],
                ['role' => 'user', 'content' => $userMessage],
            ],
        ], [
            'Authorization: Bearer ' . $apiKey,
            'Content-Type: application/json',
        ]);

        $data = json_decode($response, true);
        return $data['choices'][0]['message']['content'] ?? '';
    }

    /**
     * Generate content for a specific remix target platform.
     * Tier-aware: routes to the correct service based on tier + service.
     */
    public function generateRemix(string $platform, string $sourceText, string $customInstructions = '', string $brandVoice = '', ?string $service = null, ?string $apiKey = null): string
    {
        $systemPrompt = $this->getRemixSystemPrompt($platform, $brandVoice, $customInstructions);

        $userMessage = "Here is the source content to remix:\n\n{$sourceText}";

        // Platform-specific temperature + token limits
        $config = $this->getRemixConfig($platform);

        if ($service) {
            return $this->callForService($service, $systemPrompt, $userMessage, $config['temperature'], $config['max_tokens'], $apiKey);
        }

        return $this->callClaude($systemPrompt, $userMessage, $config['temperature'], $config['max_tokens']);
    }

    /**
     * Get the system prompt for a specific remix target.
     * Full prompts defined in docs/IMPLEMENTATION_SUPPLEMENT.md Section S3.
     */
    private function getRemixSystemPrompt(string $platform, string $brandVoice, string $customInstructions): string
    {
        // NOTE: Full prompts are in docs/IMPLEMENTATION_SUPPLEMENT.md Section S3.
        // Claude Code should copy them here during implementation.
        $prompts = [
            'twitter'     => 'You are a Twitter/X content specialist. Create engaging tweets from the source content. Max 280 characters per tweet, or a thread of 3-7 tweets. Hook-first. Max 3 hashtags.',
            'linkedin'    => 'You are a LinkedIn content strategist. Create a professional but human post from the source content. 1200-3000 characters. First 2 lines must hook. End with a question CTA.',
            'instagram'   => 'You are an Instagram caption writer. Create an engaging caption from the source content. 150-2200 characters. Use 5-10 emojis. Return JSON with caption and hashtags array.',
            'facebook'    => 'You are a Facebook content creator. Create a conversational, shareable post. 100-500 characters. End with a question. Max 1-2 hashtags.',
            'tiktok'      => 'You are a TikTok caption specialist. Create ultra-punchy caption. Max 150 characters. Include #fyp.',
            'threads'     => 'You are a Threads content writer. Create a personal, conversational post. Max 500 characters. No hashtags.',
            'blog'        => 'You are an SEO content strategist. Create a 1000-2000 word blog article. Return JSON with title, meta_description, content (markdown), and tags array.',
            'newsletter'  => 'You are an email marketing specialist. Create a 300-800 word newsletter. Return JSON with subject_lines (2 variants), preview_text, body, and cta.',
            'video_script' => 'You are a video script specialist. Create a scene-by-scene video script. Return JSON with scenes array, each having: narration, visual_prompt, duration (seconds).',
        ];

        $base = $prompts[$platform] ?? $prompts['twitter'];

        if ($brandVoice) $base .= "\n\nBrand voice: {$brandVoice}";
        if ($customInstructions) $base .= "\n\nAdditional instructions: {$customInstructions}";

        return $base;
    }

    private function getRemixConfig(string $platform): array
    {
        return match ($platform) {
            'blog', 'newsletter' => ['temperature' => 0.7, 'max_tokens' => 4096],
            'video_script'       => ['temperature' => 0.6, 'max_tokens' => 3000],
            'twitter', 'tiktok'  => ['temperature' => 0.85, 'max_tokens' => 1000],
            default              => ['temperature' => 0.75, 'max_tokens' => 2000],
        };
    }

    /**
     * HTTP POST helper with retry
     */
    private function httpPost(string $url, array $body, array $headers, int $retries = 3): string
    {
        $jsonBody = json_encode($body);

        for ($attempt = 0; $attempt <= $retries; $attempt++) {
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_POST => true,
                CURLOPT_POSTFIELDS => $jsonBody,
                CURLOPT_HTTPHEADER => $headers,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 120,
            ]);

            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if ($httpCode >= 200 && $httpCode < 300) {
                return $response;
            }

            // Retry on 5xx or timeout
            if (($httpCode >= 500 || $httpCode === 429) && $attempt < $retries) {
                $wait = (int) pow(2, $attempt);
                sleep($wait);
                continue;
            }

            throw new \RuntimeException("LLM API error: HTTP {$httpCode} — {$response}");
        }

        throw new \RuntimeException("LLM API max retries exceeded");
    }
}
