<?php

declare(strict_types=1);

namespace Contentine\Controllers;

use Contentine\Auth;
use Contentine\Services\ApiKeyService;
use Contentine\Services\AiProviderService;
use Contentine\Services\CreditService;

/** Proxies image generation requests to DALL-E 3 via OpenAI API. */
class ImageController
{
    private ApiKeyService $keyService;

    public function __construct()
    {
        $this->keyService = new ApiKeyService();
    }

    /** POST /api/images/generate — generate an image from a visual prompt (tier-aware). */
    public function generate(array $params, array $body): void
    {
        $user = Auth::requireScope('images:generate');

        $prompt = $body['prompt'] ?? '';
        $aspectRatio = $body['aspect_ratio'] ?? '9:16';
        $style = $body['style'] ?? 'vivid';
        $tier = $body['tier'] ?? 'browser';
        $service = $body['service'] ?? 'openai';

        if (empty($prompt)) {
            http_response_code(400);
            echo json_encode(['error' => 'Prompt is required']);
            return;
        }

        // Deduct credits (tier-aware)
        $creditSvc = new CreditService();
        $deduction = $creditSvc->deductForFeature((int)$user['id'], 'image_generate', $tier);
        if (isset($deduction['deducted']) && !$deduction['deducted']) {
            http_response_code(402);
            echo json_encode(['error' => 'Insufficient credits', 'shortfall' => $deduction['shortfall'] ?? 0]);
            return;
        }

        $size = match ($aspectRatio) {
            '9:16' => '1024x1792',
            '16:9' => '1792x1024',
            '1:1' => '1024x1024',
            default => '1024x1792',
        };

        // Resolve API key based on tier
        $apiKey = null;
        if ($tier === 'byok') {
            $providerSvc = new AiProviderService();
            $apiKey = $providerSvc->resolveApiKey((int)$user['id'], $service, 'byok');
        } elseif ($tier === 'api') {
            $keyInfo = $this->keyService->getKey($service);
            $apiKey = $keyInfo ? $keyInfo['api_key'] : null;
        } else {
            // Browser tier — image gen handled client-side (SD Turbo), but fallback to system key
            $keyInfo = $this->keyService->getKey('openai');
            $apiKey = $keyInfo ? $keyInfo['api_key'] : null;
        }

        if (!$apiKey) {
            http_response_code(500);
            echo json_encode(['error' => 'Image generation not configured for this provider']);
            return;
        }

        try {
            $url = $this->callDALLE3($apiKey, $prompt, $size, $style);
            if (isset($keyInfo)) {
                $this->keyService->recordUsage($keyInfo['key_id'], 'openai', '/v1/images/generations');
            }
            echo json_encode(['url' => $url]);
        } catch (\Exception $e) {
            if (isset($keyInfo)) {
                $this->keyService->reportKeyFailure($keyInfo['key_id'], $e->getMessage());
                $this->keyService->recordUsage($keyInfo['key_id'], 'openai', '/v1/images/generations', 1, 500, $e->getMessage());
            }
            error_log("Image generation error: " . $e->getMessage());
            http_response_code(500);
            echo json_encode(['error' => 'Image generation failed. Please try again.']);
        }
    }

    /** Call OpenAI DALL-E 3 API and return locally-saved image path. */
    private function callDALLE3(string $apiKey, string $prompt, string $size, string $style): string
    {
        $payload = json_encode([
            'model' => 'dall-e-3',
            'prompt' => $prompt,
            'n' => 1,
            'size' => $size,
            'style' => $style,
            'quality' => 'standard',
            'response_format' => 'url',
        ]);

        $ch = curl_init('https://api.openai.com/v1/images/generations');
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $payload,
            CURLOPT_HTTPHEADER => [
                'Authorization: Bearer ' . $apiKey,
                'Content-Type: application/json',
            ],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 60,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

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

    /** Download generated image and save to uploads directory to avoid URL expiration. */
    private function saveImageLocally(string $url): string
    {
        $imageData = file_get_contents($url);
        if (!$imageData) {
            throw new \RuntimeException('Failed to download generated image');
        }

        $uploadDir = __DIR__ . '/../../uploads/generated-images/' . date('Y/m');
        if (!is_dir($uploadDir)) {
            mkdir($uploadDir, 0755, true);
        }

        $filename = uniqid('img_') . '.png';
        $filepath = $uploadDir . '/' . $filename;
        file_put_contents($filepath, $imageData);

        return '/uploads/generated-images/' . date('Y/m') . '/' . $filename;
    }
}
