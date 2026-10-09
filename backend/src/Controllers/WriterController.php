<?php

declare(strict_types=1);

namespace Contentine\Controllers;

use Contentine\Auth;
use Contentine\Database;
use Contentine\Middleware\InputValidator;
use Contentine\Services\LLMService;
use Contentine\Services\AiProviderService;
use Contentine\Services\CreditService;

/** Handles AI-powered content writing for 6 content types. */
class WriterController
{
    /** Valid content types for AI generation. */
    private const VALID_TYPES = ['blog', 'caption', 'email', 'description', 'ad', 'summary'];

    /** System prompts keyed by content type. */
    private const PROMPTS = [
        'blog' => "You are an expert content writer. Write a well-structured blog post about the given topic.\n\nRules:\n- Use markdown with H2 headings\n- Include an engaging introduction and conclusion\n- SEO-friendly: use the topic keywords naturally\n- Include actionable insights\n- Tone: {tone}\n- Length: {length_guide}\n\nOutput ONLY the article content in markdown. No meta commentary.",

        'caption' => "You are a social media expert. Write an engaging social media caption about the given topic.\n\nRules:\n- Hook in the first line (stop-the-scroll)\n- Include relevant emojis (2-4 max)\n- End with a call to action\n- Include 3-5 relevant hashtags at the end\n- Tone: {tone}\n- Length: {length_guide}\n\nOutput ONLY the caption text. No meta commentary.",

        'email' => "You are an email marketing specialist. Write a compelling email/newsletter about the given topic.\n\nRules:\n- Start with 'Subject: [compelling subject line]'\n- Engaging opening that creates curiosity\n- Clear value proposition in the body\n- Single clear CTA\n- Professional sign-off\n- Tone: {tone}\n- Length: {length_guide}\n\nOutput the complete email. No meta commentary.",

        'description' => "You are a copywriter specializing in product and video descriptions. Write a compelling description about the given topic.\n\nRules:\n- Lead with the primary benefit\n- Use bullet points for features\n- Include relevant keywords for discoverability\n- End with a call to action\n- Tone: {tone}\n- Length: {length_guide}\n\nOutput ONLY the description. No meta commentary.",

        'ad' => "You are an advertising copywriter. Write persuasive ad copy about the given topic.\n\nRules:\n- Create 3 variants (Variant A, B, C)\n- Each variant: Headline (max 30 chars) + Body (max 90 chars) + CTA (max 15 chars)\n- Use power words and urgency\n- Focus on benefits, not features\n- Tone: {tone}\n\nOutput all 3 variants clearly labeled. No meta commentary.",

        'summary' => "You are an expert summarizer. Create a concise summary of content about the given topic.\n\nRules:\n- Start with a one-sentence TLDR\n- List 3-5 key takeaways as bullet points\n- Include a brief context paragraph\n- Highlight any actionable insights\n- Tone: {tone}\n- Length: {length_guide}\n\nOutput ONLY the summary. No meta commentary.",
    ];

    /** Length guide descriptions mapped to short/medium/long keys. */
    private const LENGTH_GUIDES = [
        'short'  => 'Keep it brief, under 200 words',
        'medium' => 'Moderate length, 300-500 words',
        'long'   => 'Comprehensive, 800-1500 words',
    ];

    /**
     * POST /api/writer/generate — Generate AI content for a given type and topic.
     */
    public function generate(array $params, array $body): void
    {
        $user = Auth::requireScope('writer:generate');

        // First-pass sanitization: strip tags, enforce types and lengths
        $clean = InputValidator::sanitize($body, [
            'type'                   => 'required|string|max:50|in:blog,caption,email,description,ad,summary',
            'topic'                  => 'required|string|max:500|min:1',
            'tone'                   => 'string|max:50',
            'length'                 => 'string|max:20|in:short,medium,long',
            'additional_instructions' => 'string|max:1000|nullable',
            'tier'                    => 'string|max:20',
            'service'                 => 'string|max:50',
        ]);

        $type = $clean['type'];
        $topic = $clean['topic'];
        $tone = $clean['tone'] ?? 'professional';
        $length = $clean['length'] ?? 'medium';
        $additionalInstructions = $clean['additional_instructions'] ?? '';

        // Build the system prompt with tone and length substitutions
        $lengthGuide = self::LENGTH_GUIDES[$length] ?? self::LENGTH_GUIDES['medium'];
        $systemPrompt = str_replace(
            ['{tone}', '{length_guide}'],
            [$tone, $lengthGuide],
            self::PROMPTS[$type]
        );

        // Build user message
        $userMessage = "Topic: {$topic}";
        if ($additionalInstructions !== '') {
            $userMessage .= "\n\n{$additionalInstructions}";
        }

        // Determine max tokens based on length
        $maxTokens = match ($length) {
            'short'  => 1024,
            'long'   => 4096,
            default  => 2048,
        };

        try {
            $tier = $clean['tier'] ?? 'browser';
            $service = $clean['service'] ?? 'anthropic';

            // Resolve API key for non-browser tiers
            $apiKey = null;
            if ($tier !== 'browser') {
                $providerSvc = new AiProviderService();
                $apiKey = $providerSvc->resolveApiKey((int)$user['id'], $service, $tier);
            }

            // Deduct credits (tier-aware)
            $featureKey = 'writer_' . $type;
            $creditSvc = new CreditService();
            $deduction = $creditSvc->deductForFeature((int)$user['id'], $featureKey, $tier);
            if (isset($deduction['deducted']) && !$deduction['deducted']) {
                http_response_code(402);
                echo json_encode(['error' => 'Insufficient credits', 'shortfall' => $deduction['shortfall'] ?? 0]);
                return;
            }

            $llm = new LLMService();
            $content = ($tier === 'browser')
                ? $llm->callClaude($systemPrompt, $userMessage, 0.7, $maxTokens)
                : $llm->callForService($service, $systemPrompt, $userMessage, 0.7, $maxTokens, $apiKey);

            if (empty($content)) {
                http_response_code(500);
                echo json_encode(['error' => 'AI generation returned empty content. Please try again.']);
                return;
            }

            // Extract title: use first markdown heading, or first line, or fallback to topic
            $title = $this->extractTitle($content, $topic);

            // Count words
            $wordCount = str_word_count(strip_tags($content));

            // Save to database
            $id = Database::insert('ai_writer_docs', [
                'user_id' => $user['id'],
                'type'    => $type,
                'title'   => $title,
                'content' => $content,
            ]);

            echo json_encode([
                'id'         => $id,
                'title'      => $title,
                'content'    => $content,
                'type'       => $type,
                'word_count' => $wordCount,
            ]);
        } catch (\Throwable $e) {
            error_log("Writer generation error: " . $e->getMessage());
            http_response_code(500);
            echo json_encode(['error' => 'Content generation failed. Please try again.']);
        }
    }

    /**
     * GET /api/writer/documents — List the user's saved AI-generated documents.
     */
    public function index(array $params, array $body): void
    {
        $user = Auth::requireUser();

        $documents = Database::fetchAll(
            'SELECT id, type, title, LEFT(content, 200) AS content_preview, created_at FROM ai_writer_docs WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
            [$user['id']]
        );

        echo json_encode(['documents' => $documents]);
    }

    /**
     * GET /api/writer/documents/{id} — Retrieve a single document by ID.
     */
    public function show(array $params, array $body): void
    {
        $user = Auth::requireUser();
        $id = (int) ($params['id'] ?? 0);

        if ($id <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid document ID']);
            return;
        }

        $doc = Database::fetch(
            'SELECT * FROM ai_writer_docs WHERE id = ? AND user_id = ?',
            [$id, $user['id']]
        );

        if (!$doc) {
            http_response_code(404);
            echo json_encode(['error' => 'Document not found']);
            return;
        }

        echo json_encode($doc);
    }

    /**
     * DELETE /api/writer/documents/{id} — Delete a saved document.
     */
    public function destroy(array $params, array $body): void
    {
        $user = Auth::requireUser();
        $id = (int) ($params['id'] ?? 0);

        if ($id <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid document ID']);
            return;
        }

        $deleted = Database::delete(
            'ai_writer_docs',
            'id = ? AND user_id = ?',
            [$id, $user['id']]
        );

        if ($deleted === 0) {
            http_response_code(404);
            echo json_encode(['error' => 'Document not found']);
            return;
        }

        echo json_encode(['success' => true]);
    }

    // ──────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────

    /**
     * Extract a title from AI-generated content.
     * Looks for markdown headings first, then uses the first non-empty line, then falls back to the topic.
     */
    private function extractTitle(string $content, string $fallback): string
    {
        // Try markdown heading (# or ##)
        if (preg_match('/^#{1,2}\s+(.+)$/m', $content, $matches)) {
            return trim($matches[1]);
        }

        // Try "Subject:" line (for email type)
        if (preg_match('/^Subject:\s*(.+)$/mi', $content, $matches)) {
            return trim($matches[1]);
        }

        // Use first non-empty line (trimmed to 120 chars)
        $lines = explode("\n", $content);
        foreach ($lines as $line) {
            $line = trim($line);
            if ($line !== '' && !str_starts_with($line, '#')) {
                return mb_strlen($line) > 120 ? mb_substr($line, 0, 117) . '...' : $line;
            }
        }

        // Fallback to topic
        return $fallback;
    }
}
