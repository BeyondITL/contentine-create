<?php

declare(strict_types=1);

/**
 * Cron: Publish scheduled posts via SocialPublisher service.
 * Run every 5 minutes via crontab (5-minute interval).
 */

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../src/Database.php';
require_once __DIR__ . '/../src/Services/EncryptionService.php';
require_once __DIR__ . '/../src/Services/SocialPublisher.php';
require_once __DIR__ . '/../src/Services/WebhookDispatcher.php';

use Contentine\Database;
use Contentine\Services\SocialPublisher;
use Contentine\Services\EncryptionService;
use Contentine\Services\WebhookDispatcher;

$encryption = new EncryptionService();

/** Decrypt an AES-256-GCM token triple, or null if any part is missing/undecryptable. */
function decryptToken(EncryptionService $enc, ?string $encrypted, ?string $iv, ?string $tag): ?string
{
    if (!$encrypted || !$iv || !$tag) {
        return null;
    }
    try {
        return $enc->decrypt($encrypted, $iv, $tag);
    } catch (\Throwable $e) {
        error_log('[CRON] token decrypt failed: ' . $e->getMessage());
        return null;
    }
}

$now = date('Y-m-d H:i:s');
$publisher = new SocialPublisher();
$publishedCount = 0;
$failedCount = 0;

// Get posts due for publishing (limit 10 per run to avoid timeouts)
$posts = Database::fetchAll(
    'SELECT sp.*, v.mp4_path, v.title as video_title, v.user_id,
            sa.encrypted_access_token, sa.access_token_iv, sa.access_token_tag,
            sa.encrypted_refresh_token, sa.refresh_token_iv, sa.refresh_token_tag,
            sa.oauth_token, sa.refresh_token, sa.account_name, sa.display_name, sa.token_expires_at,
            ct.cta_text, ct.links as cta_links
     FROM scheduled_posts sp
     JOIN videos v ON v.id = sp.video_id
     LEFT JOIN social_accounts sa ON sa.user_id = v.user_id AND sa.platform = sp.platform
     LEFT JOIN cta_templates ct ON ct.id = sp.cta_template_id
     WHERE sp.status = ? AND sp.scheduled_at <= ?
     ORDER BY sp.scheduled_at ASC
     LIMIT 10',
    ['pending', $now]
);

echo "[{$now}] Found " . count($posts) . " posts due for publishing.\n";

foreach ($posts as $post) {
    $postId = $post['id'];
    $platform = $post['platform'];

    echo "[{$now}] Processing post {$postId} for {$platform}...\n";

    // Mark as publishing
    Database::update('scheduled_posts', ['status' => 'publishing'], 'id = ?', [$postId]);

    // Decrypt the stored OAuth tokens (AuthController stores them AES-256-GCM encrypted;
    // the legacy plaintext oauth_token column is not populated by the OAuth flow).
    $accessToken = decryptToken($encryption, $post['encrypted_access_token'], $post['access_token_iv'], $post['access_token_tag'])
        ?? ($post['oauth_token'] ?? null);
    $refreshToken = decryptToken($encryption, $post['encrypted_refresh_token'], $post['refresh_token_iv'], $post['refresh_token_tag'])
        ?? ($post['refresh_token'] ?? null);

    // Validate social account exists and token is not expired
    if (!$accessToken) {
        $errorMsg = "No connected {$platform} account found for user {$post['user_id']}";
        Database::update('scheduled_posts', [
            'status' => 'failed',
            'error_message' => $errorMsg,
        ], 'id = ?', [$postId]);

        createCronNotification($post['user_id'], 'publish_failed',
            "Scheduled publish to {$platform} failed",
            "Your video \"{$post['video_title']}\" could not be published: {$errorMsg}"
        );

        error_log("[CRON] Post {$postId}: {$errorMsg}");
        $failedCount++;
        continue;
    }

    // Check token expiry
    if ($post['token_expires_at'] && strtotime($post['token_expires_at']) < time()) {
        $errorMsg = "{$platform} access token has expired. Please reconnect your account.";
        Database::update('scheduled_posts', [
            'status' => 'failed',
            'error_message' => $errorMsg,
        ], 'id = ?', [$postId]);

        createCronNotification($post['user_id'], 'publish_failed',
            "Scheduled publish to {$platform} failed",
            "Your video \"{$post['video_title']}\" could not be published: {$errorMsg}"
        );

        error_log("[CRON] Post {$postId}: {$errorMsg}");
        $failedCount++;
        continue;
    }

    // Build publish data
    $publishData = [
        'video_path'    => $post['mp4_path'],
        'title'         => $post['title'] ?? $post['video_title'],
        'description'   => $post['description'] ?? '',
        'tags'          => json_decode($post['tags'] ?? '[]', true),
        'hashtags'      => json_decode($post['hashtags'] ?? '[]', true),
        'cta_text'      => $post['cta_text'] ?? '',
        'cta_links'     => json_decode($post['cta_links'] ?? '[]', true),
        'oauth_token'   => $accessToken,
        'refresh_token' => $refreshToken,
        'account_name'  => $post['account_name'] ?? $post['display_name'] ?? '',
    ];

    try {
        $result = $publisher->publish($platform, $publishData);

        if ($result['success']) {
            Database::update('scheduled_posts', [
                'status' => 'published',
                'published_url' => $result['published_url'] ?? null,
                'error_message' => null,
            ], 'id = ?', [$postId]);

            createCronNotification($post['user_id'], 'publish_success',
                "Video published to {$platform}",
                "Your video \"{$post['video_title']}\" is now live on {$platform}.",
                $result['published_url'] ?? null
            );

            WebhookDispatcher::emit((int) $post['user_id'], 'schedule.published', [
                'post_id'       => (int) $postId,
                'video_id'      => (int) $post['video_id'],
                'platform'      => $platform,
                'published_url' => $result['published_url'] ?? null,
                'title'         => $post['video_title'],
            ]);

            echo "[{$now}] Published post {$postId} to {$platform} — URL: {$result['published_url']}\n";
            $publishedCount++;
        } else {
            $errorMsg = $result['error'] ?? 'Unknown publishing error';
            Database::update('scheduled_posts', [
                'status' => 'failed',
                'error_message' => $errorMsg,
            ], 'id = ?', [$postId]);

            createCronNotification($post['user_id'], 'publish_failed',
                "Scheduled publish to {$platform} failed",
                "Your video \"{$post['video_title']}\" could not be published: {$errorMsg}"
            );

            WebhookDispatcher::emit((int) $post['user_id'], 'schedule.failed', [
                'post_id'  => (int) $postId,
                'video_id' => (int) $post['video_id'],
                'platform' => $platform,
                'error'    => $errorMsg,
            ]);

            error_log("[CRON] Post {$postId} failed: {$errorMsg}");
            $failedCount++;
        }
    } catch (\Throwable $e) {
        $errorMsg = $e->getMessage();
        Database::update('scheduled_posts', [
            'status' => 'failed',
            'error_message' => $errorMsg,
        ], 'id = ?', [$postId]);

        createCronNotification($post['user_id'], 'publish_failed',
            "Scheduled publish to {$platform} failed",
            "Your video \"{$post['video_title']}\" could not be published: {$errorMsg}"
        );

        error_log("[CRON] Post {$postId} exception: {$errorMsg}");
        $failedCount++;
    }
}

echo "[{$now}] Done. Published: {$publishedCount}, Failed: {$failedCount}, Total processed: " . count($posts) . "\n";

/**
 * Create a notification record for a user from the cron context.
 */
function createCronNotification(int $userId, string $type, string $title, string $body, ?string $actionUrl = null): void
{
    try {
        Database::insert('notifications', [
            'user_id'    => $userId,
            'type'       => $type,
            'title'      => $title,
            'body'       => $body,
            'action_url' => $actionUrl,
        ]);
    } catch (\Throwable $e) {
        // Non-critical — log and continue
        error_log("[CRON] Failed to create notification for user {$userId}: {$e->getMessage()}");
    }
}
