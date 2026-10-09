<?php

declare(strict_types=1);

namespace Contentine\Controllers;

use Contentine\Auth;
use Contentine\Database;
use Contentine\Services\ApiKeyService;

/** Handles AI thumbnail generation via DALL-E 3, listing, and deletion. */
class ThumbnailController
{
    /** Valid thumbnail sizes matching DALL-E 3 supported dimensions. */
    private const VALID_SIZES = ['1024x1024', '1792x1024', '1024x1792'];

    private ApiKeyService $keyService;

    public function __construct()
    {
        $this->keyService = new ApiKeyService();
    }

    // ──────────────────────────────────────────────
    // Generate
    // ──────────────────────────────────────────────

    /** POST /api/thumbnails/generate — Generate a thumbnail image via DALL-E 3 and store it. */
    public function generate(array $params, array $body): void
    {
        $user = Auth::requireUser();

        $prompt = trim($body['prompt'] ?? '');
        $videoId = isset($body['video_id']) ? (int) $body['video_id'] : null;
        $size = $body['size'] ?? '1024x1024';

        if (empty($prompt)) {
            http_response_code(400);
            echo json_encode(['error' => 'Prompt is required']);
            return;
        }

        if (!in_array($size, self::VALID_SIZES, true)) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid size. Must be one of: ' . implode(', ', self::VALID_SIZES)]);
            return;
        }

        // If video_id provided, verify ownership
        if ($videoId !== null) {
            $video = Database::fetch(
                'SELECT id FROM videos WHERE id = ? AND user_id = ?',
                [$videoId, $user['id']]
            );
            if (!$video) {
                http_response_code(404);
                echo json_encode(['error' => 'Video not found']);
                return;
            }
        }

        $keyInfo = $this->keyService->getKey('openai');
        if (!$keyInfo) {
            http_response_code(500);
            echo json_encode(['error' => 'Image generation is not configured. Add an OpenAI key in Admin → System Keys.']);
            return;
        }

        try {
            // Enhance the prompt for thumbnail-specific output
            $thumbnailPrompt = "Create a professional, eye-catching video thumbnail: {$prompt}. "
                . "The image should be bold, high-contrast, suitable for social media thumbnails, "
                . "with clear focal point and vibrant colors.";

            $imagePath = $this->callDALLE3($keyInfo, $thumbnailPrompt, $size);

            // Store in database
            $id = Database::insert('thumbnails', [
                'user_id'    => $user['id'],
                'video_id'   => $videoId,
                'prompt'     => $prompt,
                'image_path' => $imagePath,
            ]);

            $thumbnail = Database::fetch('SELECT * FROM thumbnails WHERE id = ?', [$id]);

            // If linked to a video, update the video's thumbnail_path
            if ($videoId !== null) {
                Database::update('videos', [
                    'thumbnail_path' => $imagePath,
                ], 'id = ? AND user_id = ?', [$videoId, $user['id']]);
            }

            http_response_code(201);
            echo json_encode([
                'id'         => (int) $thumbnail['id'],
                'image_path' => $thumbnail['image_path'],
                'prompt'     => $thumbnail['prompt'],
                'video_id'   => $thumbnail['video_id'] ? (int) $thumbnail['video_id'] : null,
                'created_at' => $thumbnail['created_at'],
            ]);
        } catch (\Exception $e) {
            error_log("Thumbnail generation error: " . $e->getMessage());
            http_response_code(500);
            echo json_encode(['error' => 'Thumbnail generation failed. Please try again.']);
        }
    }

    // ──────────────────────────────────────────────
    // List
    // ──────────────────────────────────────────────

    /** GET /api/thumbnails — List all thumbnails for the authenticated user, newest first. */
    public function index(array $params, array $body): void
    {
        $user = Auth::requireUser();

        $page = max(1, (int) ($_GET['page'] ?? 1));
        $limit = min(50, max(1, (int) ($_GET['limit'] ?? 20)));
        $offset = ($page - 1) * $limit;

        $total = Database::fetch(
            'SELECT COUNT(*) as cnt FROM thumbnails WHERE user_id = ?',
            [$user['id']]
        )['cnt'];

        $thumbnails = Database::fetchAll(
            'SELECT * FROM thumbnails WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
            [$user['id'], $limit, $offset]
        );

        // Cast types
        foreach ($thumbnails as &$thumb) {
            $thumb['id'] = (int) $thumb['id'];
            $thumb['user_id'] = (int) $thumb['user_id'];
            $thumb['video_id'] = $thumb['video_id'] ? (int) $thumb['video_id'] : null;
        }

        echo json_encode([
            'thumbnails' => $thumbnails,
            'total'      => (int) $total,
            'page'       => $page,
            'limit'      => $limit,
        ]);
    }

    // ──────────────────────────────────────────────
    // Delete
    // ──────────────────────────────────────────────

    /** DELETE /api/thumbnails/{id} — Delete a thumbnail (file + database record), scoped to user. */
    public function destroy(array $params, array $body): void
    {
        $user = Auth::requireUser();
        $thumbnailId = (int) $params['id'];

        $thumbnail = Database::fetch(
            'SELECT * FROM thumbnails WHERE id = ? AND user_id = ?',
            [$thumbnailId, $user['id']]
        );

        if (!$thumbnail) {
            http_response_code(404);
            echo json_encode(['error' => 'Thumbnail not found']);
            return;
        }

        // Delete the physical file
        $filePath = __DIR__ . '/../../' . ltrim($thumbnail['image_path'], '/');
        if (file_exists($filePath)) {
            unlink($filePath);
        }

        // Delete database record
        Database::delete('thumbnails', 'id = ? AND user_id = ?', [$thumbnailId, $user['id']]);

        echo json_encode(['success' => true]);
    }

    // ──────────────────────────────────────────────
    // Private Helpers
    // ──────────────────────────────────────────────

    /** Call OpenAI DALL-E 3 API and save the resulting image locally. */
    private function callDALLE3(string $apiKey, string $prompt, string $size): string
    {
        $payload = json_encode([
            'model'           => 'dall-e-3',
            'prompt'          => $prompt,
            'n'               => 1,
            'size'            => $size,
            'style'           => 'vivid',
            'quality'         => 'standard',
            'response_format' => 'url',
        ]);

        $ch = curl_init('https://api.openai.com/v1/images/generations');
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_HTTPHEADER     => [
                'Authorization: Bearer ' . $apiKey,
                'Content-Type: application/json',
            ],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 60,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($curlError) {
            throw new \RuntimeException("DALL-E 3 request failed: {$curlError}");
        }

        if ($httpCode !== 200) {
            $error = json_decode($response, true);
            throw new \RuntimeException(
                'DALL-E 3 API error: ' . ($error['error']['message'] ?? "HTTP {$httpCode}")
            );
        }

        $data = json_decode($response, true);
        $imageUrl = $data['data'][0]['url'] ?? null;

        if (!$imageUrl) {
            throw new \RuntimeException('No image URL in DALL-E 3 response');
        }

        return $this->saveImageLocally($imageUrl);
    }

    /** Download generated image and save to the thumbnails upload directory. */
    private function saveImageLocally(string $url): string
    {
        $imageData = file_get_contents($url);
        if (!$imageData) {
            throw new \RuntimeException('Failed to download generated thumbnail image');
        }

        $uploadDir = __DIR__ . '/../../uploads/thumbnails/' . date('Y/m');
        if (!is_dir($uploadDir)) {
            mkdir($uploadDir, 0755, true);
        }

        $filename = 'thumb_' . uniqid() . '.png';
        $filepath = $uploadDir . '/' . $filename;
        file_put_contents($filepath, $imageData);

        return '/uploads/thumbnails/' . date('Y/m') . '/' . $filename;
    }
}
