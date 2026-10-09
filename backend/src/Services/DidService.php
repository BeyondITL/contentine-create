<?php
declare(strict_types=1);

namespace Contentine\Services;

/**
 * D-ID API service for photorealistic talking-head video generation (Tier 3 Pro Avatar).
 * This is OPTIONAL — the platform works 100% without it.
 */
class DidService
{
    private EncryptionService $encryption;
    private ApiKeyService $keyService;

    public function __construct()
    {
        $this->encryption = new EncryptionService();
        $this->keyService = new ApiKeyService();
    }

    /** Check if D-ID API is configured (admin has added a key). */
    public function isAvailable(): bool
    {
        $key = $this->keyService->getKey('did');
        return $key !== null;
    }

    /**
     * Create a talking-head video via D-ID API.
     * @param string $imageUrl - Face photo URL or base64 data URI.
     * @param string $audioUrl - Audio file URL or base64 data URI.
     * @return array{id: string, status: string}
     */
    public function createTalkingHead(string $imageUrl, string $audioUrl): array
    {
        $apiKey = $this->getApiKey();

        $response = $this->httpPost('https://api.d-id.com/talks', [
            'source_url' => $imageUrl,
            'script' => [
                'type' => 'audio',
                'audio_url' => $audioUrl,
            ],
            'config' => [
                'result_format' => 'mp4',
            ],
        ], [
            'Authorization: Basic ' . $apiKey,
            'Content-Type: application/json',
        ]);

        $data = json_decode($response, true);
        if (empty($data['id'])) {
            throw new \RuntimeException('D-ID API failed to create talk: ' . ($data['description'] ?? 'Unknown error'));
        }

        return [
            'id' => $data['id'],
            'status' => $data['status'] ?? 'created',
        ];
    }

    /**
     * Poll D-ID for talk completion status.
     * @return array{status: string, result_url?: string}
     */
    public function getStatus(string $talkId): array
    {
        $apiKey = $this->getApiKey();

        $ch = curl_init("https://api.d-id.com/talks/{$talkId}");
        curl_setopt_array($ch, [
            CURLOPT_HTTPHEADER => [
                'Authorization: Basic ' . $apiKey,
                'Content-Type: application/json',
            ],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 30,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode >= 400) {
            throw new \RuntimeException("D-ID status check failed (HTTP {$httpCode})");
        }

        $data = json_decode($response, true);
        return [
            'status' => $data['status'] ?? 'unknown',
            'result_url' => $data['result_url'] ?? null,
        ];
    }

    /** Get decrypted D-ID API key from system keys. */
    private function getApiKey(): string
    {
        $keyInfo = $this->keyService->getKey('did');
        if (!$keyInfo) {
            throw new \RuntimeException('D-ID API not configured. Use browser-native avatars (Tier 1/2) instead.');
        }
        return $keyInfo['api_key'];
    }

    /** POST JSON to D-ID API. */
    private function httpPost(string $url, array $body, array $headers): string
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode($body),
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 60,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode >= 400) {
            throw new \RuntimeException("D-ID API error (HTTP {$httpCode}): {$response}");
        }

        return $response;
    }
}
