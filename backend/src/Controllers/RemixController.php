<?php

declare(strict_types=1);

namespace Contentine\Controllers;

use Contentine\Auth;
use Contentine\Database;
use Contentine\Middleware\InputValidator;
use Contentine\Services\ContentExtractor;
use Contentine\Services\LLMService;
use Contentine\Services\AiProviderService;
use Contentine\Services\CreditService;

/** Handles Content Remix Hub: extract sources, generate remixes, CRUD projects. */
class RemixController
{
    /** POST /api/remix/extract — Extract text from a URL, YouTube video, or TikTok. */
    public function extract(array $params, array $body): void
    {
        Auth::requireScope('remix:write');

        $clean = InputValidator::sanitize($body, [
            'type'  => 'required|string|max:50|in:text,url,youtube,tiktok,pdf',
            'url'   => 'string|max:2000|nullable',
            'title' => 'string|max:300|nullable',
            'text'  => 'string|max:50000|nullable',
        ]);

        $type = $clean['type'];
        $url = $clean['url'] ?? '';

        // Text type doesn't need extraction
        if ($type === 'text') {
            echo json_encode([
                'title' => $clean['title'] ?? 'Pasted Text',
                'text' => $clean['text'] ?? '',
            ]);
            return;
        }

        if (!$url) {
            http_response_code(400);
            echo json_encode(['error' => 'URL is required for this source type']);
            return;
        }

        try {
            $extractor = new ContentExtractor();
            $result = $extractor->extract($type, $url);
            echo json_encode($result);
        } catch (\Exception $e) {
            http_response_code(422);
            echo json_encode(['error' => 'Extraction failed: ' . $e->getMessage()]);
        }
    }

    /** POST /api/remix/generate — Generate remixed content for selected platforms. */
    public function generate(array $params, array $body): void
    {
        $user = Auth::requireScope('remix:write');

        $clean = InputValidator::sanitize($body, [
            'project_id'          => 'required|int|min:1',
            'sources'             => 'array|nullable',
            'targets'             => 'required|array',
            'custom_instructions' => 'string|max:2000|nullable',
            'tier'                => 'string|max:20',
            'service'             => 'string|max:50',
        ]);

        $projectId = (int) $clean['project_id'];
        $sources = $clean['sources'] ?? [];
        $targets = $clean['targets'] ?? [];
        $instructions = $clean['custom_instructions'] ?? '';

        // Verify project ownership
        $project = Database::fetch(
            'SELECT * FROM remix_projects WHERE id = ? AND user_id = ?',
            [$projectId, $user['id']]
        );

        if (!$project) {
            http_response_code(404);
            echo json_encode(['error' => 'Project not found']);
            return;
        }

        if (empty($targets)) {
            http_response_code(400);
            echo json_encode(['error' => 'At least one target platform is required']);
            return;
        }

        // Combine all source texts
        $combinedText = '';
        if (!empty($sources)) {
            $combinedText = implode("\n\n---\n\n", array_filter($sources));
        } else {
            // Fall back to project's stored sources
            $storedSources = Database::fetchAll(
                'SELECT extracted_text FROM remix_sources WHERE remix_project_id = ? ORDER BY sort_order',
                [$projectId]
            );
            $combinedText = implode("\n\n---\n\n", array_column($storedSources, 'extracted_text'));
        }

        if (strlen(trim($combinedText)) < 10) {
            http_response_code(400);
            echo json_encode(['error' => 'Not enough source content to generate remixes']);
            return;
        }

        // Truncate source text to ~15k characters to stay within context limits
        if (strlen($combinedText) > 15000) {
            $combinedText = substr($combinedText, 0, 15000) . "\n\n[Content truncated for processing]";
        }

        $tier = $clean['tier'] ?? 'browser';
        $service = $clean['service'] ?? 'anthropic';

        // Resolve API key for non-browser tiers
        $apiKey = null;
        if ($tier !== 'browser') {
            $providerSvc = new AiProviderService();
            $apiKey = $providerSvc->resolveApiKey((int)$user['id'], $service, $tier);
        }

        // Deduct credits (tier-aware)
        $creditSvc = new CreditService();
        $deduction = $creditSvc->deductForFeature((int)$user['id'], 'remix_generate', $tier);
        if (isset($deduction['deducted']) && !$deduction['deducted']) {
            http_response_code(402);
            echo json_encode(['error' => 'Insufficient credits', 'shortfall' => $deduction['shortfall'] ?? 0]);
            return;
        }

        $llm = new LLMService();

        // Delete only the outputs for the target platforms being regenerated (not all outputs)
        $placeholders = implode(',', array_fill(0, count($targets), '?'));
        Database::query(
            "DELETE FROM remix_outputs WHERE remix_project_id = ? AND target_platform IN ({$placeholders})",
            [$projectId, ...$targets]
        );

        // Generate content for each target platform
        $outputs = [];
        foreach ($targets as $platform) {
            try {
                $generated = $llm->generateRemix($platform, $combinedText, $instructions, '', $service, $apiKey);

                // For blog, newsletter, and video_script, try to parse as JSON
                $generatedJson = null;
                if (in_array($platform, ['blog', 'newsletter', 'video_script'])) {
                    // Try to extract JSON from the response
                    $jsonMatch = null;
                    if (preg_match('/\{[\s\S]*\}/m', $generated, $jsonMatch)) {
                        $parsed = json_decode($jsonMatch[0], true);
                        if ($parsed) {
                            $generatedJson = $parsed;
                        }
                    }
                }

                $outputId = Database::insert('remix_outputs', [
                    'remix_project_id' => $projectId,
                    'target_platform' => $platform,
                    'generated_text' => $generated,
                    'generated_json' => $generatedJson ? json_encode($generatedJson) : null,
                    'status' => 'generated',
                ]);

                $outputs[] = Database::fetch('SELECT * FROM remix_outputs WHERE id = ?', [$outputId]);
            } catch (\Exception $e) {
                // Log error but continue with other platforms
                error_log("Remix generation failed for {$platform}: " . $e->getMessage());

                $outputId = Database::insert('remix_outputs', [
                    'remix_project_id' => $projectId,
                    'target_platform' => $platform,
                    'generated_text' => "Generation failed: {$e->getMessage()}. Click Regenerate to try again.",
                    'generated_json' => null,
                    'status' => 'generated',
                ]);

                $outputs[] = Database::fetch('SELECT * FROM remix_outputs WHERE id = ?', [$outputId]);
            }
        }

        // Update project status and target_platforms
        Database::update('remix_projects', [
            'status' => 'generated',
            'target_platforms' => json_encode($targets),
            'custom_instructions' => $instructions ?: null,
        ], 'id = ?', [$projectId]);

        // Return full project with sources and outputs
        $project = Database::fetch('SELECT * FROM remix_projects WHERE id = ?', [$projectId]);
        $project['sources'] = Database::fetchAll(
            'SELECT * FROM remix_sources WHERE remix_project_id = ? ORDER BY sort_order',
            [$projectId]
        );
        $project['outputs'] = $outputs;
        $project['target_platforms'] = json_decode($project['target_platforms'] ?? '[]', true);

        echo json_encode(['project' => $project]);
    }

    /** GET /api/remix/projects — List user's remix projects. */
    public function index(array $params, array $body): void
    {
        $user = Auth::requireScope('remix:read');
        $page = max(1, (int) ($_GET['page'] ?? 1));
        $limit = min(50, max(1, (int) ($_GET['limit'] ?? 20)));
        $offset = ($page - 1) * $limit;

        $total = Database::fetch(
            'SELECT COUNT(*) as cnt FROM remix_projects WHERE user_id = ?',
            [$user['id']]
        )['cnt'];

        $projects = Database::fetchAll(
            'SELECT * FROM remix_projects WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
            [$user['id'], $limit, $offset]
        );

        // Decode JSON fields
        foreach ($projects as &$p) {
            $p['target_platforms'] = json_decode($p['target_platforms'] ?? '[]', true);
        }

        echo json_encode([
            'projects' => $projects,
            'total' => (int) $total,
            'page' => $page,
            'limit' => $limit,
        ]);
    }

    /** POST /api/remix/projects — Create a new remix project. */
    public function store(array $params, array $body): void
    {
        $user = Auth::requireScope('remix:write');

        $clean = InputValidator::sanitize($body, [
            'name'                => 'string|max:200|nullable',
            'custom_instructions' => 'string|max:2000|nullable',
            'target_platforms'    => 'array|nullable',
            'sources'             => 'array|nullable',
        ]);

        $id = Database::insert('remix_projects', [
            'user_id' => $user['id'],
            'name' => $clean['name'] ?? 'Untitled Remix',
            'custom_instructions' => $clean['custom_instructions'] ?? null,
            'target_platforms' => json_encode($clean['target_platforms'] ?? []),
            'status' => 'draft',
        ]);

        // If sources were provided, insert them
        if (!empty($clean['sources'])) {
            foreach ($clean['sources'] as $i => $source) {
                Database::insert('remix_sources', [
                    'remix_project_id' => $id,
                    'source_type' => $source['source_type'] ?? 'text',
                    'source_url' => $source['source_url'] ?? null,
                    'source_title' => $source['source_title'] ?? null,
                    'extracted_text' => $source['extracted_text'] ?? null,
                    'sort_order' => $i,
                ]);
            }
        }

        $project = Database::fetch('SELECT * FROM remix_projects WHERE id = ?', [$id]);
        $project['target_platforms'] = json_decode($project['target_platforms'] ?? '[]', true);
        $project['sources'] = Database::fetchAll(
            'SELECT * FROM remix_sources WHERE remix_project_id = ?',
            [$id]
        );
        $project['outputs'] = [];

        http_response_code(201);
        echo json_encode(['project' => $project]);
    }

    /** GET /api/remix/projects/{id} — Get a single remix project with sources and outputs. */
    public function show(array $params, array $body): void
    {
        $user = Auth::requireScope('remix:read');
        $project = Database::fetch(
            'SELECT * FROM remix_projects WHERE id = ? AND user_id = ?',
            [$params['id'], $user['id']]
        );

        if (!$project) {
            http_response_code(404);
            echo json_encode(['error' => 'Project not found']);
            return;
        }

        $project['target_platforms'] = json_decode($project['target_platforms'] ?? '[]', true);
        $project['sources'] = Database::fetchAll(
            'SELECT * FROM remix_sources WHERE remix_project_id = ? ORDER BY sort_order',
            [$project['id']]
        );
        $project['outputs'] = Database::fetchAll(
            'SELECT * FROM remix_outputs WHERE remix_project_id = ?',
            [$project['id']]
        );

        // Decode generated_json for each output
        foreach ($project['outputs'] as &$output) {
            if ($output['generated_json']) {
                $output['generated_json'] = json_decode($output['generated_json'], true);
            }
        }

        echo json_encode(['project' => $project]);
    }

    /** PUT /api/remix/projects/{id} — Update remix project or its outputs. */
    public function update(array $params, array $body): void
    {
        $user = Auth::requireScope('remix:write');

        $clean = InputValidator::sanitize($body, [
            'name'                => 'string|max:200|nullable',
            'custom_instructions' => 'string|max:2000|nullable',
            'status'              => 'string|max:30|in:draft,generated,published|nullable',
            'target_platforms'    => 'array|nullable',
            'outputs'             => 'array|nullable',
        ]);

        $project = Database::fetch(
            'SELECT * FROM remix_projects WHERE id = ? AND user_id = ?',
            [$params['id'], $user['id']]
        );

        if (!$project) {
            http_response_code(404);
            echo json_encode(['error' => 'Project not found']);
            return;
        }

        $allowed = ['name', 'custom_instructions', 'status'];
        $data = [];
        foreach ($allowed as $field) {
            if (array_key_exists($field, $clean)) {
                $data[$field] = $clean[$field];
            }
        }

        if (isset($clean['target_platforms'])) {
            $data['target_platforms'] = json_encode($clean['target_platforms']);
        }

        if (!empty($data)) {
            Database::update('remix_projects', $data, 'id = ?', [$params['id']]);
        }

        // Update individual outputs if provided
        if (!empty($clean['outputs'])) {
            foreach ($clean['outputs'] as $outputUpdate) {
                if (!isset($outputUpdate['id'])) continue;

                $outputData = [];
                if (isset($outputUpdate['generated_text'])) {
                    $outputData['generated_text'] = $outputUpdate['generated_text'];
                    $outputData['is_edited'] = true;
                }
                if (isset($outputUpdate['status'])) {
                    $outputData['status'] = $outputUpdate['status'];
                }

                if (!empty($outputData)) {
                    Database::update('remix_outputs', $outputData,
                        'id = ? AND remix_project_id = ?',
                        [$outputUpdate['id'], $params['id']]
                    );
                }
            }
        }

        // Return updated project
        $project = Database::fetch('SELECT * FROM remix_projects WHERE id = ?', [$params['id']]);
        $project['target_platforms'] = json_decode($project['target_platforms'] ?? '[]', true);
        $project['sources'] = Database::fetchAll(
            'SELECT * FROM remix_sources WHERE remix_project_id = ? ORDER BY sort_order',
            [$project['id']]
        );
        $project['outputs'] = Database::fetchAll(
            'SELECT * FROM remix_outputs WHERE remix_project_id = ?',
            [$project['id']]
        );

        foreach ($project['outputs'] as &$output) {
            if ($output['generated_json']) {
                $output['generated_json'] = json_decode($output['generated_json'], true);
            }
        }

        echo json_encode(['project' => $project]);
    }

    /** DELETE /api/remix/projects/{id} — Delete a remix project and all its data. */
    public function destroy(array $params, array $body): void
    {
        $user = Auth::requireScope('remix:write');
        $project = Database::fetch(
            'SELECT * FROM remix_projects WHERE id = ? AND user_id = ?',
            [$params['id'], $user['id']]
        );

        if (!$project) {
            http_response_code(404);
            echo json_encode(['error' => 'Project not found']);
            return;
        }

        // CASCADE will handle remix_sources and remix_outputs
        Database::delete('remix_projects', 'id = ?', [$params['id']]);

        echo json_encode(['success' => true]);
    }

    /** POST /api/remix/projects/{id}/to-video — Send video_script output to the video pipeline. */
    public function toVideo(array $params, array $body): void
    {
        $user = Auth::requireScope('remix:write');

        $clean = InputValidator::sanitize($body, [
            'aspect_ratio' => 'string|max:10|in:9:16,16:9,1:1|nullable',
        ]);

        $project = Database::fetch(
            'SELECT * FROM remix_projects WHERE id = ? AND user_id = ?',
            [$params['id'], $user['id']]
        );

        if (!$project) {
            http_response_code(404);
            echo json_encode(['error' => 'Project not found']);
            return;
        }

        // Find the video_script output
        $output = Database::fetch(
            "SELECT * FROM remix_outputs WHERE remix_project_id = ? AND target_platform = 'video_script'",
            [$params['id']]
        );

        if (!$output) {
            http_response_code(400);
            echo json_encode(['error' => 'No video script output found. Generate one first.']);
            return;
        }

        // Parse the video script into a canonical {scenes:[...]} structure. Handles the
        // server LLM's JSON output and the browser LLM's "SCENE N:" text output alike.
        $scriptJson = $this->parseVideoScript($output);

        if ($scriptJson === null || empty($scriptJson['scenes'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Video script is not in the expected format. Regenerate and try again.']);
            return;
        }

        // Create a video record
        $videoId = Database::insert('videos', [
            'user_id' => $user['id'],
            'title' => $project['name'] ?? 'Remixed Video',
            'type' => 'faceless',
            'style_mode' => 'ai_visuals',
            'script_json' => json_encode($scriptJson),
            'aspect_ratio' => $clean['aspect_ratio'] ?? '9:16',
            'status' => 'draft',
            'folder_path' => "videos/{$user['id']}/" . uniqid(),
        ]);

        // Link the output to the video
        Database::update('remix_outputs', [
            'video_id' => $videoId,
        ], 'id = ?', [$output['id']]);

        $video = Database::fetch('SELECT * FROM videos WHERE id = ?', [$videoId]);

        echo json_encode(['video' => $video, 'redirect_to' => "/video/create?videoId={$videoId}"]);
    }

    /** POST /api/remix/projects/{id}/publish — Mark an output as published. */
    public function publish(array $params, array $body): void
    {
        $user = Auth::requireScope('remix:write');

        $clean = InputValidator::sanitize($body, [
            'output_id' => 'required|int|min:1',
        ]);

        $project = Database::fetch(
            'SELECT * FROM remix_projects WHERE id = ? AND user_id = ?',
            [$params['id'], $user['id']]
        );

        if (!$project) {
            http_response_code(404);
            echo json_encode(['error' => 'Project not found']);
            return;
        }

        $outputId = (int) $clean['output_id'];

        $output = Database::fetch(
            'SELECT * FROM remix_outputs WHERE id = ? AND remix_project_id = ?',
            [$outputId, $params['id']]
        );

        if (!$output) {
            http_response_code(404);
            echo json_encode(['error' => 'Output not found']);
            return;
        }

        Database::update('remix_outputs', [
            'status' => 'published',
        ], 'id = ?', [$outputId]);

        // Check if all outputs are published → update project status
        $remaining = Database::fetch(
            "SELECT COUNT(*) as cnt FROM remix_outputs WHERE remix_project_id = ? AND status != 'published'",
            [$params['id']]
        )['cnt'];

        if ((int) $remaining === 0) {
            Database::update('remix_projects', ['status' => 'published'], 'id = ?', [$params['id']]);
        }

        echo json_encode(['success' => true]);
    }

    /**
     * Parse a video_script remix output into a canonical {scenes:[...]} structure,
     * accepting stored JSON, JSON embedded in text, or "SCENE N:" plain text.
     */
    private function parseVideoScript(array $output): ?array
    {
        // 1) JSON stored in the generated_json column.
        if (!empty($output['generated_json'])) {
            $decoded = is_array($output['generated_json'])
                ? $output['generated_json']
                : json_decode($output['generated_json'], true);
            if (is_array($decoded) && !empty($decoded['scenes'])) {
                return ['scenes' => $this->normalizeScenes($decoded['scenes'])];
            }
        }

        $text = (string) ($output['generated_text'] ?? '');
        if (trim($text) === '') {
            return null;
        }

        // 2) JSON embedded in the generated text.
        if (preg_match('/\{[\s\S]*\}/m', $text, $m)) {
            $decoded = json_decode($m[0], true);
            if (is_array($decoded) && !empty($decoded['scenes'])) {
                return ['scenes' => $this->normalizeScenes($decoded['scenes'])];
            }
        }

        // 3) Plain "SCENE N: visual\nnarration\n---" text (browser-native LLM format).
        $scenes = $this->parseSceneText($text);
        if (!empty($scenes)) {
            return ['scenes' => $scenes];
        }

        return null;
    }

    /** Turn the "SCENE N:" text format into canonical scene rows. */
    private function parseSceneText(string $text): array
    {
        $blocks = preg_split('/(?:^|\n)---\s*(?:\n|$)/', $text);
        $chunks = [];
        foreach ($blocks as $block) {
            foreach (preg_split('/(?=SCENE\s+\d+\s*:)/i', $block) as $part) {
                $part = trim($part);
                if ($part !== '') {
                    $chunks[] = $part;
                }
            }
        }

        $scenes = [];
        foreach ($chunks as $chunk) {
            $cleaned = trim(preg_replace('/^SCENE\s+\d+\s*:\s*/i', '', $chunk));
            if ($cleaned === '') {
                continue;
            }
            $lines = array_values(array_filter(array_map('trim', explode("\n", $cleaned)), 'strlen'));
            if (empty($lines)) {
                continue;
            }
            if (count($lines) > 1) {
                $visual = trim($lines[0], "[] ");
                $narration = implode(' ', array_slice($lines, 1));
            } else {
                $visual = '';
                $narration = $lines[0];
            }
            $scenes[] = ['narration' => $narration, 'visual_prompt' => $visual];
        }

        return $this->normalizeScenes($scenes);
    }

    /** Ensure every scene has id, narration, visual_prompt, duration, transition. */
    private function normalizeScenes(array $scenes): array
    {
        $out = [];
        $i = 0;
        foreach ($scenes as $scene) {
            if (!is_array($scene)) {
                continue;
            }
            $i++;
            $narration = trim((string) ($scene['narration'] ?? ''));
            $visual = trim((string) ($scene['visual_prompt'] ?? ''));

            if (isset($scene['duration']) && (int) $scene['duration'] > 0) {
                $duration = (int) $scene['duration'];
            } else {
                $words = $narration === ''
                    ? 0
                    : count(preg_split('/\s+/', $narration, -1, PREG_SPLIT_NO_EMPTY));
                $duration = max(3, (int) round(($words / 150) * 60));
            }

            $out[] = [
                'id'            => $scene['id'] ?? ('scene_' . $i),
                'narration'     => $narration,
                'visual_prompt' => $visual !== '' ? $visual : ('Visual for scene ' . $i),
                'duration'      => $duration,
                'transition'    => $scene['transition'] ?? 'crossfade',
            ];
        }
        return $out;
    }
}
