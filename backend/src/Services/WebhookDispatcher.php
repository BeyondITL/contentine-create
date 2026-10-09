<?php

declare(strict_types=1);

namespace Contentine\Services;

use Contentine\Database;

/**
 * Event-driven webhook dispatcher (SA-04 / F-29).
 *
 * Producers call WebhookDispatcher::emit($userId, $event, $data) at real event
 * points (a video published, a scheduled post delivered, etc.). emit() fans the
 * event out to every active webhook subscribed to it and QUEUES a delivery row in
 * webhook_deliveries — it never blocks the producing request on network I/O.
 *
 * A cron (backend/cron/webhooks.php) then calls deliverDue(), which POSTs each due
 * delivery with an HMAC-SHA256 signature over the exact body, and applies Law D-47
 * retry discipline: up to max_attempts tries, exponential backoff, honour
 * Retry-After, and NEVER retry a 4xx other than 429. Every attempt is recorded, so
 * the delivery log is a real audit trail, not a status string.
 */
class WebhookDispatcher
{
    /** Events a webhook may subscribe to (mirrors WebhookController::VALID_EVENTS). */
    public const VALID_EVENTS = [
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

    private const MAX_ATTEMPTS = 5;
    private const DELIVERY_TIMEOUT = 15;

    /**
     * Fan an event out to the user's subscribed webhooks by queueing delivery rows.
     * Returns the number of deliveries queued. Best-effort and non-throwing so it can
     * be called safely from inside a producing request's happy path.
     */
    public static function emit(int $userId, string $event, array $data): int
    {
        if (!in_array($event, self::VALID_EVENTS, true)) {
            return 0;
        }

        try {
            $webhooks = Database::fetchAll(
                'SELECT id, events FROM webhooks WHERE user_id = ? AND is_active = 1',
                [$userId]
            );
        } catch (\Throwable $e) {
            error_log('WebhookDispatcher::emit lookup failed: ' . $e->getMessage());
            return 0;
        }

        $queued = 0;
        $timestamp = time();

        foreach ($webhooks as $wh) {
            $events = json_decode($wh['events'] ?? '[]', true);
            if (!is_array($events) || !in_array($event, $events, true)) {
                continue;
            }

            $payload = json_encode([
                'event'     => $event,
                'timestamp' => $timestamp,
                'data'      => $data,
            ]);

            try {
                Database::insert('webhook_deliveries', [
                    'webhook_id'      => (int) $wh['id'],
                    'user_id'         => $userId,
                    'event'           => $event,
                    'payload'         => $payload,
                    'status'          => 'pending',
                    'attempts'        => 0,
                    'max_attempts'    => self::MAX_ATTEMPTS,
                    'next_attempt_at' => date('Y-m-d H:i:s'),
                ]);
                $queued++;
            } catch (\Throwable $e) {
                error_log('WebhookDispatcher::emit enqueue failed: ' . $e->getMessage());
            }
        }

        return $queued;
    }

    /**
     * Deliver all due pending deliveries (called by cron). Returns
     * ['delivered' => int, 'retried' => int, 'failed' => int].
     */
    public static function deliverDue(int $limit = 50): array
    {
        $due = Database::fetchAll(
            "SELECT d.*, w.url AS webhook_url, w.secret AS webhook_secret, w.is_active AS webhook_active
             FROM webhook_deliveries d
             JOIN webhooks w ON w.id = d.webhook_id
             WHERE d.status = 'pending' AND d.next_attempt_at <= NOW()
             ORDER BY d.next_attempt_at ASC
             LIMIT {$limit}",
            []
        );

        $stats = ['delivered' => 0, 'retried' => 0, 'failed' => 0];

        foreach ($due as $delivery) {
            // Drop deliveries whose webhook was deactivated after queueing.
            if (!$delivery['webhook_active']) {
                Database::update('webhook_deliveries', [
                    'status'     => 'failed',
                    'last_error' => 'Webhook was deactivated before delivery',
                ], 'id = ?', [$delivery['id']]);
                $stats['failed']++;
                continue;
            }

            $result = self::deliverOne(
                $delivery['webhook_url'],
                $delivery['webhook_secret'],
                $delivery['event'],
                $delivery['payload']
            );

            $attempts = (int) $delivery['attempts'] + 1;
            $maxAttempts = (int) $delivery['max_attempts'];

            if ($result['success']) {
                Database::update('webhook_deliveries', [
                    'status'        => 'delivered',
                    'attempts'      => $attempts,
                    'response_code' => $result['status'],
                    'last_error'    => null,
                    'delivered_at'  => date('Y-m-d H:i:s'),
                ], 'id = ?', [$delivery['id']]);
                Database::update('webhooks', [
                    'last_triggered_at' => date('Y-m-d H:i:s'),
                    'last_status_code'  => $result['status'],
                    'failure_count'     => 0,
                ], 'id = ?', [$delivery['webhook_id']]);
                $stats['delivered']++;
                continue;
            }

            // Non-retryable 4xx (except 429): give up immediately.
            $nonRetryable = $result['status'] >= 400 && $result['status'] < 500 && $result['status'] !== 429;
            if ($nonRetryable || $attempts >= $maxAttempts) {
                Database::update('webhook_deliveries', [
                    'status'        => 'failed',
                    'attempts'      => $attempts,
                    'response_code' => $result['status'] ?: null,
                    'last_error'    => $result['error'],
                ], 'id = ?', [$delivery['id']]);
                Database::query(
                    'UPDATE webhooks SET failure_count = failure_count + 1, last_status_code = ? WHERE id = ?',
                    [$result['status'] ?: null, $delivery['webhook_id']]
                );
                $stats['failed']++;
                continue;
            }

            // Retry with exponential backoff, honouring Retry-After.
            $backoffSeconds = $result['retry_after'] ?? (int) pow(2, $attempts) * 30; // 60s, 120s, 240s, ...
            $nextAttempt = date('Y-m-d H:i:s', time() + min($backoffSeconds, 3600));
            Database::update('webhook_deliveries', [
                'attempts'        => $attempts,
                'response_code'   => $result['status'] ?: null,
                'last_error'      => $result['error'],
                'next_attempt_at' => $nextAttempt,
            ], 'id = ?', [$delivery['id']]);
            $stats['retried']++;
        }

        return $stats;
    }

    /**
     * Deliver a single payload to a URL with an HMAC signature.
     * Returns ['success'=>bool,'status'=>int,'error'=>?string,'retry_after'=>?int].
     */
    private static function deliverOne(string $url, string $secret, string $event, string $payload): array
    {
        $timestamp = time();
        // Sign timestamp.payload so replay windows can be enforced by the receiver.
        $signature = hash_hmac('sha256', $timestamp . '.' . $payload, $secret);

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HEADER         => true,
            CURLOPT_TIMEOUT        => self::DELIVERY_TIMEOUT,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'X-Contentine-Signature: sha256=' . $signature,
                'X-Contentine-Timestamp: ' . $timestamp,
                'X-Contentine-Event: ' . $event,
                'User-Agent: ContentineCreate-Webhook/1.0',
            ],
        ]);

        $response = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $headerSize = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE);
        $curlErr = curl_error($ch);
        curl_close($ch);

        if ($response === false) {
            return ['success' => false, 'status' => 0, 'error' => 'Transport error: ' . $curlErr, 'retry_after' => null];
        }

        $rawHeaders = substr($response, 0, $headerSize);
        $retryAfter = null;
        if ($status === 429 && preg_match('/Retry-After:\s*(\d+)/i', $rawHeaders, $m)) {
            $retryAfter = (int) $m[1];
        }

        $success = $status >= 200 && $status < 300;
        return [
            'success'     => $success,
            'status'      => $status,
            'error'       => $success ? null : "Receiver returned HTTP {$status}",
            'retry_after' => $retryAfter,
        ];
    }
}
