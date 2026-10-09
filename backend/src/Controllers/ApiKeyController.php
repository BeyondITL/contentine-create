<?php

declare(strict_types=1);

namespace Contentine\Controllers;

use Contentine\Auth;
use Contentine\Database;

/** Manages user API keys for programmatic access to the Contentine Create API. */
class ApiKeyController
{
    /** Maximum number of active API keys per user. */
    private const MAX_KEYS_PER_USER = 10;

    /** Valid scope values that can be assigned to an API key. */
    private const VALID_SCOPES = [
        'videos:read',
        'videos:write',
        'scripts:generate',
        'images:generate',
        'remix:read',
        'remix:write',
        'publish',
        'analytics:read',
        'stock:search',
        'writer:generate',
    ];

    // ──────────────────────────────────────────────
    // List Keys
    // ──────────────────────────────────────────────

    /** GET /api/keys — List the authenticated user's API keys (prefix and metadata only). */
    public function index(array $params, array $body): void
    {
        $user = Auth::requireUser();

        $keys = Database::fetchAll(
            'SELECT id, name, key_prefix, scopes, last_used_at, created_at
             FROM api_keys
             WHERE user_id = ? AND revoked_at IS NULL
             ORDER BY created_at DESC',
            [$user['id']]
        );

        // Decode scopes JSON for each key
        foreach ($keys as &$key) {
            $key['scopes'] = json_decode($key['scopes'] ?? '[]', true);
        }

        echo json_encode(['keys' => $keys]);
    }

    // ──────────────────────────────────────────────
    // Create Key
    // ──────────────────────────────────────────────

    /** POST /api/keys — Generate a new API key. Returns the full key exactly once. */
    public function store(array $params, array $body): void
    {
        $user = Auth::requireUser();

        // Validate name
        $name = trim($body['name'] ?? '');
        if ($name === '') {
            http_response_code(400);
            echo json_encode(['error' => 'API key name is required']);
            return;
        }

        if (mb_strlen($name) > 100) {
            http_response_code(400);
            echo json_encode(['error' => 'API key name must be 100 characters or fewer']);
            return;
        }

        // Validate scopes
        $scopes = $body['scopes'] ?? [];
        if (!is_array($scopes) || empty($scopes)) {
            http_response_code(400);
            echo json_encode([
                'error'        => 'At least one scope is required',
                'valid_scopes' => self::VALID_SCOPES,
            ]);
            return;
        }

        $invalidScopes = array_diff($scopes, self::VALID_SCOPES);
        if (!empty($invalidScopes)) {
            http_response_code(400);
            echo json_encode([
                'error'          => 'Invalid scopes: ' . implode(', ', $invalidScopes),
                'valid_scopes'   => self::VALID_SCOPES,
            ]);
            return;
        }

        // Enforce key limit
        $existingCount = Database::fetch(
            'SELECT COUNT(*) as cnt FROM api_keys WHERE user_id = ? AND revoked_at IS NULL',
            [$user['id']]
        )['cnt'];

        if ((int) $existingCount >= self::MAX_KEYS_PER_USER) {
            http_response_code(400);
            echo json_encode(['error' => 'Maximum of ' . self::MAX_KEYS_PER_USER . ' active API keys allowed. Revoke an existing key first.']);
            return;
        }

        // Generate a cryptographically secure 64-character hex key
        $rawKey = bin2hex(random_bytes(32));
        $keyPrefix = substr($rawKey, 0, 10);
        $keyHash = password_hash($rawKey, PASSWORD_BCRYPT);

        $id = Database::insert('api_keys', [
            'user_id'    => $user['id'],
            'name'       => $name,
            'key_hash'   => $keyHash,
            'key_prefix' => $keyPrefix,
            'scopes'     => json_encode(array_values($scopes)),
        ]);

        http_response_code(201);
        echo json_encode([
            'key' => [
                'id'         => $id,
                'name'       => $name,
                'key_prefix' => $keyPrefix,
                'scopes'     => array_values($scopes),
                'created_at' => date('Y-m-d H:i:s'),
            ],
            'secret' => $rawKey,
            'warning' => 'Store this key securely. It will not be shown again.',
        ]);
    }

    // ──────────────────────────────────────────────
    // Revoke Key
    // ──────────────────────────────────────────────

    /** DELETE /api/keys/{id} — Revoke an API key (soft delete). Must belong to the authenticated user. */
    public function destroy(array $params, array $body): void
    {
        $user = Auth::requireUser();

        $key = Database::fetch(
            'SELECT id, name FROM api_keys WHERE id = ? AND user_id = ? AND revoked_at IS NULL',
            [$params['id'], $user['id']]
        );

        if (!$key) {
            http_response_code(404);
            echo json_encode(['error' => 'API key not found']);
            return;
        }

        Database::update(
            'api_keys',
            ['revoked_at' => date('Y-m-d H:i:s')],
            'id = ?',
            [$params['id']]
        );

        echo json_encode(['success' => true, 'message' => "API key \"{$key['name']}\" has been revoked"]);
    }
}
