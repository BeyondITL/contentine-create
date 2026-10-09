<?php

declare(strict_types=1);

/**
 * Cron: deliver queued webhook deliveries (SA-04 / F-29).
 * Run every minute via crontab. Picks up due pending deliveries from
 * webhook_deliveries and POSTs them with an HMAC signature, applying D-47 retry
 * discipline. Idempotent: safe to run concurrently-ish because each row's
 * next_attempt_at gates re-selection.
 */

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../src/Database.php';
require_once __DIR__ . '/../src/Services/WebhookDispatcher.php';

use Contentine\Services\WebhookDispatcher;

$now = date('Y-m-d H:i:s');
$stats = WebhookDispatcher::deliverDue(50);

echo "[{$now}] Webhook deliveries — delivered: {$stats['delivered']}, retried: {$stats['retried']}, failed: {$stats['failed']}\n";
