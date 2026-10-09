<?php
declare(strict_types=1);

namespace Contentine\Controllers;

use Contentine\Auth;
use Contentine\Database;
use Contentine\Services\EncryptionService;
use Contentine\Middleware\InputValidator;

/** BYOK — Users manage their own API keys for cloud AI providers. */
class UserKeyController
{
    /** GET /api/user/keys — list services the user has keys for (never returns decrypted key). */
    public function list(): void
    {
        $user = Auth::requireUser();
        $userId = (int) $user['id'];

        $keys = Database::fetchAll(
            "SELECT service, label, is_active, last_used_at, last_error, created_at FROM user_api_keys WHERE user_id = ? ORDER BY service",
            [$userId]
        );

        echo json_encode(['keys' => $keys]);
    }

    /** POST /api/user/keys — add or update a BYOK key. Encrypts before storage. */
    public function add(array $params, array $body): void
    {
        $user = Auth::requireUser();
        $userId = (int) $user['id'];

        $clean = InputValidator::sanitize($body, [
            'service' => 'required|string|max:50',
            'api_key' => 'required|string|max:500',
            'label'   => 'string|max:100',
        ]);

        $service = $clean['service'];
        $apiKey = $clean['api_key'];
        $label = $clean['label'] ?? 'My Key';

        // Validate service is one of the supported providers
        $validServices = ['anthropic', 'gemini', 'openai'];
        if (!in_array($service, $validServices, true)) {
            http_response_code(400);
            echo json_encode(['error' => 'Unsupported service. Valid: ' . implode(', ', $validServices)]);
            return;
        }

        // Validate key format (basic check)
        if (strlen($apiKey) < 10) {
            http_response_code(400);
            echo json_encode(['error' => 'API key is too short.']);
            return;
        }

        // Test the key with a minimal API call
        $testResult = $this->testKey($service, $apiKey);
        if (!$testResult['success']) {
            http_response_code(400);
            echo json_encode(['error' => 'Key validation failed: ' . $testResult['message']]);
            return;
        }

        // Encrypt the key
        $crypto = new EncryptionService();
        $encrypted = $crypto->encrypt($apiKey);

        // Upsert (one key per service per user)
        $existing = Database::fetch(
            "SELECT id FROM user_api_keys WHERE user_id = ? AND service = ?",
            [$userId, $service]
        );

        if ($existing) {
            Database::query(
                "UPDATE user_api_keys SET encrypted_key = ?, encryption_iv = ?, encryption_tag = ?, label = ?, is_active = 1, last_error = NULL, updated_at = NOW() WHERE user_id = ? AND service = ?",
                [$encrypted['encrypted'], $encrypted['iv'], $encrypted['tag'], $label, $userId, $service]
            );
        } else {
            Database::query(
                "INSERT INTO user_api_keys (user_id, service, label, encrypted_key, encryption_iv, encryption_tag) VALUES (?, ?, ?, ?, ?, ?)",
                [$userId, $service, $label, $encrypted['encrypted'], $encrypted['iv'], $encrypted['tag']]
            );
        }

        echo json_encode([
            'success' => true,
            'service' => $service,
            'label' => $label,
            'masked' => $this->maskKey($apiKey),
        ]);
    }

    /** DELETE /api/user/keys/{service} — remove user's key for a service. */
    public function remove(array $params): void
    {
        $user = Auth::requireUser();
        $userId = (int) $user['id'];
        $service = $params['service'] ?? '';

        Database::query(
            "DELETE FROM user_api_keys WHERE user_id = ? AND service = ?",
            [$userId, $service]
        );

        echo json_encode(['success' => true]);
    }

    /** GET /api/user/keys/test/{service} — test if user's stored key still works. */
    public function test(array $params): void
    {
        $user = Auth::requireUser();
        $userId = (int) $user['id'];
        $service = $params['service'] ?? '';

        $keyRow = Database::fetch(
            "SELECT encrypted_key, encryption_iv, encryption_tag FROM user_api_keys WHERE user_id = ? AND service = ? AND is_active = 1",
            [$userId, $service]
        );

        if (!$keyRow) {
            http_response_code(404);
            echo json_encode(['error' => 'No key found for this service.']);
            return;
        }

        $crypto = new EncryptionService();
        $apiKey = $crypto->decrypt($keyRow['encrypted_key'], $keyRow['encryption_iv'], $keyRow['encryption_tag']);

        $result = $this->testKey($service, $apiKey);

        if (!$result['success']) {
            Database::query(
                "UPDATE user_api_keys SET last_error = ? WHERE user_id = ? AND service = ?",
                [$result['message'], $userId, $service]
            );
        } else {
            Database::query(
                "UPDATE user_api_keys SET last_error = NULL, last_used_at = NOW() WHERE user_id = ? AND service = ?",
                [$userId, $service]
            );
        }

        echo json_encode($result);
    }

    /** Test an API key by making a minimal API call. */
    private function testKey(string $service, string $apiKey): array
    {
        try {
            $ch = null;
            switch ($service) {
                case 'anthropic':
                    $ch = curl_init('https://api.anthropic.com/v1/messages');
                    curl_setopt_array($ch, [
                        CURLOPT_POST => true,
                        CURLOPT_POSTFIELDS => json_encode([
                            'model' => 'claude-sonnet-4-20250514',
                            'max_tokens' => 10,
                            'messages' => [['role' => 'user', 'content' => 'Hi']],
                        ]),
                        CURLOPT_HTTPHEADER => [
                            'x-api-key: ' . $apiKey,
                            'anthropic-version: 2023-06-01',
                            'Content-Type: application/json',
                        ],
                        CURLOPT_RETURNTRANSFER => true,
                        CURLOPT_TIMEOUT => 15,
                    ]);
                    break;

                case 'openai':
                    $ch = curl_init('https://api.openai.com/v1/models');
                    curl_setopt_array($ch, [
                        CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $apiKey],
                        CURLOPT_RETURNTRANSFER => true,
                        CURLOPT_TIMEOUT => 15,
                    ]);
                    break;

                case 'gemini':
                    $ch = curl_init('https://generativelanguage.googleapis.com/v1/models?key=' . urlencode($apiKey));
                    curl_setopt_array($ch, [
                        CURLOPT_RETURNTRANSFER => true,
                        CURLOPT_TIMEOUT => 15,
                    ]);
                    break;

                default:
                    return ['success' => false, 'message' => 'Unknown service'];
            }

            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if ($httpCode >= 200 && $httpCode < 300) {
                return ['success' => true, 'message' => 'Key is valid'];
            }
            if ($httpCode === 401 || $httpCode === 403) {
                return ['success' => false, 'message' => 'Invalid or expired API key'];
            }
            return ['success' => false, 'message' => "API returned HTTP {$httpCode}"];
        } catch (\Exception $e) {
            return ['success' => false, 'message' => $e->getMessage()];
        }
    }

    /** Mask an API key for display. */
    private function maskKey(string $key): string
    {
        if (strlen($key) <= 8) return '****';
        return substr($key, 0, 7) . '...' . substr($key, -4);
    }
}
