<?php

declare(strict_types=1);

namespace Contentine\Controllers;

use Contentine\Auth;
use Contentine\Database;

/** Manages user-configured webhooks for event-driven integrations. */
class WebhookController
{
    /** Maximum number of webhooks per user. */
    private const MAX_WEBHOOKS_PER_USER = 20;

    /** Valid event types a webhook can subscribe to. */
    private const VALID_EVENTS = [
        'video.completed',
        'video.failed',
        'video.published',
        'remix.generated',
        'remix.published',
        'schedule.published',
        'schedule.failed',
        'render.started',
        'render.completed',
        'export.ready',
    ];

    /** Timeout for test webhook delivery in seconds. */
    private const TEST_TIMEOUT = 10;

    // ──────────────────────────────────────────────
    // List Webhooks
    // ──────────────────────────────────────────────

    /** GET /api/webhooks — List all webhooks for the authenticated user. */
    public function index(array $params, array $body): void
    {
        $user = Auth::requireUser();

        $webhooks = Database::fetchAll(
            'SELECT id, url, events, is_active, last_triggered_at, last_status_code, created_at, updated_at
             FROM webhooks
             WHERE user_id = ?
             ORDER BY created_at DESC',
            [$user['id']]
        );

        // Decode JSON fields and cast booleans
        foreach ($webhooks as &$wh) {
            $wh['events'] = json_decode($wh['events'] ?? '[]', true);
            $wh['is_active'] = (bool) $wh['is_active'];
        }

        echo json_encode([
            'webhooks'     => $webhooks,
            'valid_events' => self::VALID_EVENTS,
        ]);
    }

    // ──────────────────────────────────────────────
    // Create Webhook
    // ──────────────────────────────────────────────

    /** POST /api/webhooks — Create a new webhook with auto-generated HMAC secret. */
    public function store(array $params, array $body): void
    {
        $user = Auth::requireUser();

        // Validate URL
        $url = trim($body['url'] ?? '');
        if ($url === '' || !filter_var($url, FILTER_VALIDATE_URL)) {
            http_response_code(400);
            echo json_encode(['error' => 'A valid HTTPS URL is required']);
            return;
        }

        if (!str_starts_with($url, 'https://')) {
            http_response_code(400);
            echo json_encode(['error' => 'Webhook URL must use HTTPS']);
            return;
        }

        if (mb_strlen($url) > 2000) {
            http_response_code(400);
            echo json_encode(['error' => 'URL must be 2000 characters or fewer']);
            return;
        }

        // Validate events
        $events = $body['events'] ?? [];
        if (!is_array($events) || empty($events)) {
            http_response_code(400);
            echo json_encode([
                'error'        => 'At least one event is required',
                'valid_events' => self::VALID_EVENTS,
            ]);
            return;
        }

        $invalidEvents = array_diff($events, self::VALID_EVENTS);
        if (!empty($invalidEvents)) {
            http_response_code(400);
            echo json_encode([
                'error'        => 'Invalid events: ' . implode(', ', $invalidEvents),
                'valid_events' => self::VALID_EVENTS,
            ]);
            return;
        }

        // Enforce webhook limit
        $existingCount = Database::fetch(
            'SELECT COUNT(*) as cnt FROM webhooks WHERE user_id = ?',
            [$user['id']]
        )['cnt'];

        if ((int) $existingCount >= self::MAX_WEBHOOKS_PER_USER) {
            http_response_code(400);
            echo json_encode(['error' => 'Maximum of ' . self::MAX_WEBHOOKS_PER_USER . ' webhooks allowed. Delete an existing webhook first.']);
            return;
        }

        // Generate HMAC signing secret
        $secret = 'whsec_' . bin2hex(random_bytes(24));

        $id = Database::insert('webhooks', [
            'user_id' => $user['id'],
            'url'     => $url,
            'events'  => json_encode(array_values($events)),
            'secret'  => $secret,
        ]);

        http_response_code(201);
        echo json_encode([
            'webhook' => [
                'id'        => $id,
                'url'       => $url,
                'events'    => array_values($events),
                'is_active' => true,
                'created_at' => date('Y-m-d H:i:s'),
            ],
            'secret'  => $secret,
            'warning' => 'Store this signing secret securely. It will not be shown again.',
        ]);
    }

    // ──────────────────────────────────────────────
    // Update Webhook
    // ──────────────────────────────────────────────

    /** PUT /api/webhooks/{id} — Update an existing webhook's URL, events, or active state. */
    public function update(array $params, array $body): void
    {
        $user = Auth::requireUser();

        $webhook = Database::fetch(
            'SELECT * FROM webhooks WHERE id = ? AND user_id = ?',
            [$params['id'], $user['id']]
        );

        if (!$webhook) {
            http_response_code(404);
            echo json_encode(['error' => 'Webhook not found']);
            return;
        }

        $data = [];

        // Update URL if provided
        if (isset($body['url'])) {
            $url = trim($body['url']);
            if ($url === '' || !filter_var($url, FILTER_VALIDATE_URL)) {
                http_response_code(400);
                echo json_encode(['error' => 'A valid HTTPS URL is required']);
                return;
            }
            if (!str_starts_with($url, 'https://')) {
                http_response_code(400);
                echo json_encode(['error' => 'Webhook URL must use HTTPS']);
                return;
            }
            if (mb_strlen($url) > 2000) {
                http_response_code(400);
                echo json_encode(['error' => 'URL must be 2000 characters or fewer']);
                return;
            }
            $data['url'] = $url;
        }

        // Update events if provided
        if (isset($body['events'])) {
            $events = $body['events'];
            if (!is_array($events) || empty($events)) {
                http_response_code(400);
                echo json_encode([
                    'error'        => 'At least one event is required',
                    'valid_events' => self::VALID_EVENTS,
                ]);
                return;
            }
            $invalidEvents = array_diff($events, self::VALID_EVENTS);
            if (!empty($invalidEvents)) {
                http_response_code(400);
                echo json_encode([
                    'error'        => 'Invalid events: ' . implode(', ', $invalidEvents),
                    'valid_events' => self::VALID_EVENTS,
                ]);
                return;
            }
            $data['events'] = json_encode(array_values($events));
        }

        // Update active state if provided
        if (isset($body['is_active'])) {
            $data['is_active'] = $body['is_active'] ? 1 : 0;
        }

        if (empty($data)) {
            http_response_code(400);
            echo json_encode(['error' => 'No fields to update. Provide url, events, or is_active.']);
            return;
        }

        Database::update('webhooks', $data, 'id = ?', [$params['id']]);

        $webhook = Database::fetch(
            'SELECT id, url, events, is_active, last_triggered_at, last_status_code, created_at, updated_at
             FROM webhooks WHERE id = ?',
            [$params['id']]
        );
        $webhook['events'] = json_decode($webhook['events'] ?? '[]', true);
        $webhook['is_active'] = (bool) $webhook['is_active'];

        echo json_encode(['webhook' => $webhook]);
    }

    // ──────────────────────────────────────────────
    // Delete Webhook
    // ──────────────────────────────────────────────

    /** DELETE /api/webhooks/{id} — Permanently delete a webhook. */
    public function destroy(array $params, array $body): void
    {
        $user = Auth::requireUser();

        $webhook = Database::fetch(
            'SELECT id FROM webhooks WHERE id = ? AND user_id = ?',
            [$params['id'], $user['id']]
        );

        if (!$webhook) {
            http_response_code(404);
            echo json_encode(['error' => 'Webhook not found']);
            return;
        }

        Database::delete('webhooks', 'id = ?', [$params['id']]);

        echo json_encode(['success' => true]);
    }

    // ──────────────────────────────────────────────
    // Test Webhook
    // ──────────────────────────────────────────────

    /** POST /api/webhooks/{id}/test — Send a test payload to the webhook URL and record the result. */
    public function test(array $params, array $body): void
    {
        $user = Auth::requireUser();

        $webhook = Database::fetch(
            'SELECT * FROM webhooks WHERE id = ? AND user_id = ?',
            [$params['id'], $user['id']]
        );

        if (!$webhook) {
            http_response_code(404);
            echo json_encode(['error' => 'Webhook not found']);
            return;
        }

        // Build test payload
        $timestamp = time();
        $payload = json_encode([
            'event'     => 'test.ping',
            'timestamp' => $timestamp,
            'data'      => [
                'message'    => 'This is a test webhook delivery from Contentine Create.',
                'webhook_id' => (int) $webhook['id'],
            ],
        ]);

        // Compute HMAC signature
        $signature = hash_hmac('sha256', $payload, $webhook['secret']);

        // Deliver via cURL
        $ch = curl_init($webhook['url']);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => self::TEST_TIMEOUT,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'X-Contentine-Signature: sha256=' . $signature,
                'X-Contentine-Timestamp: ' . $timestamp,
                'X-Contentine-Event: test.ping',
                'User-Agent: ContentineCreate-Webhook/1.0',
            ],
        ]);

        $responseBody = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $totalTime = round(curl_getinfo($ch, CURLINFO_TOTAL_TIME) * 1000);
        $curlError = curl_error($ch);
        curl_close($ch);

        $success = $responseBody !== false && $httpCode >= 200 && $httpCode < 300;

        // Update webhook with delivery result
        Database::update('webhooks', [
            'last_triggered_at' => date('Y-m-d H:i:s'),
            'last_status_code'  => $httpCode ?: null,
        ], 'id = ?', [$params['id']]);

        echo json_encode([
            'success'       => $success,
            'status_code'   => $httpCode ?: null,
            'response_time' => $totalTime,
            'error'         => $curlError ?: null,
        ]);
    }

    // ──────────────────────────────────────────────
    // Delivery Log
    // ──────────────────────────────────────────────

    /**
     * GET /api/webhooks/{id}/deliveries — Recent delivery attempts for a webhook.
     * Real audit trail from the webhook_deliveries table populated by the dispatcher.
     */
    public function deliveries(array $params, array $body): void
    {
        $user = Auth::requireUser();

        $webhook = Database::fetch(
            'SELECT id FROM webhooks WHERE id = ? AND user_id = ?',
            [$params['id'], $user['id']]
        );

        if (!$webhook) {
            http_response_code(404);
            echo json_encode(['error' => 'Webhook not found']);
            return;
        }

        $deliveries = Database::fetchAll(
            'SELECT id, event, status, attempts, max_attempts, response_code, last_error,
                    next_attempt_at, delivered_at, created_at
             FROM webhook_deliveries
             WHERE webhook_id = ?
             ORDER BY created_at DESC
             LIMIT 100',
            [$webhook['id']]
        );

        echo json_encode(['deliveries' => $deliveries]);
    }
}
