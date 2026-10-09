<?php

declare(strict_types=1);

namespace Contentine\Controllers;

use Contentine\Auth;
use Contentine\Database;
use Contentine\Services\SocialPublisher;
use Contentine\Services\EncryptionService;
use Contentine\Services\WebhookDispatcher;

/** Handles immediate publishing of videos to social platforms. */
class PublishController
{
    /** POST /api/publish/{platform} — Publish a video to a social platform. */
    public function publish(array $params, array $body): void
    {
        // JWT/interactive sessions have full access; API keys must carry 'publish'.
        // requireScope() is the only entry that admits an API key (deny-by-default).
        $user = Auth::requireScope('publish');
        $platform = $params['platform'] ?? '';

        $validPlatforms = ['youtube', 'tiktok', 'instagram', 'facebook', 'linkedin', 'threads', 'twitter'];
        if (!in_array($platform, $validPlatforms, true)) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid platform. Must be one of: ' . implode(', ', $validPlatforms)]);
            return;
        }

        $videoId = (int) ($body['video_id'] ?? 0);
        if (!$videoId) {
            http_response_code(400);
            echo json_encode(['error' => 'video_id is required']);
            return;
        }

        // Validate video belongs to user and is completed
        $video = Database::fetch(
            'SELECT * FROM videos WHERE id = ? AND user_id = ?',
            [$videoId, $user['id']]
        );

        if (!$video) {
            http_response_code(404);
            echo json_encode(['error' => 'Video not found']);
            return;
        }

        if ($video['status'] !== 'completed') {
            http_response_code(400);
            echo json_encode(['error' => 'Video must be fully rendered before publishing']);
            return;
        }

        if (!$video['mp4_path']) {
            http_response_code(400);
            echo json_encode(['error' => 'Video has no MP4 file. Render it first.']);
            return;
        }

        // Validate user has connected social account for this platform
        $socialAccount = Database::fetch(
            'SELECT * FROM social_accounts WHERE user_id = ? AND platform = ?',
            [$user['id'], $platform]
        );

        if (!$socialAccount) {
            http_response_code(400);
            echo json_encode(['error' => "No connected {$platform} account. Connect your account in Settings."]);
            return;
        }

        // Check token expiry
        if ($socialAccount['token_expires_at'] && strtotime($socialAccount['token_expires_at']) < time()) {
            http_response_code(400);
            echo json_encode(['error' => "Your {$platform} connection has expired. Please reconnect."]);
            return;
        }

        // Resolve CTA template if provided
        $ctaText = '';
        $ctaLinks = [];
        if (!empty($body['cta_template_id'])) {
            $ctaTemplate = Database::fetch(
                'SELECT * FROM cta_templates WHERE id = ? AND user_id = ?',
                [(int) $body['cta_template_id'], $user['id']]
            );
            if ($ctaTemplate) {
                $ctaText = $ctaTemplate['cta_text'];
                $ctaLinks = json_decode($ctaTemplate['links'] ?? '[]', true);
            }
        }

        // Decrypt the stored OAuth token. AuthController stores tokens AES-256-GCM
        // encrypted in encrypted_access_token/_iv/_tag — the legacy plaintext
        // oauth_token column is not populated by the OAuth flow, so decrypt here.
        $accessToken = $this->decryptStoredToken(
            $socialAccount['encrypted_access_token'] ?? null,
            $socialAccount['access_token_iv'] ?? null,
            $socialAccount['access_token_tag'] ?? null
        ) ?? ($socialAccount['oauth_token'] ?? null);

        if (!$accessToken) {
            http_response_code(400);
            echo json_encode(['error' => "Your {$platform} connection is missing an access token. Please reconnect."]);
            return;
        }

        $refreshToken = $this->decryptStoredToken(
            $socialAccount['encrypted_refresh_token'] ?? null,
            $socialAccount['refresh_token_iv'] ?? null,
            $socialAccount['refresh_token_tag'] ?? null
        ) ?? ($socialAccount['refresh_token'] ?? null);

        // Build publish payload
        $publishData = [
            'video_path' => $video['mp4_path'],
            'title' => $body['title'] ?? $video['title'],
            'description' => $body['description'] ?? '',
            'tags' => $body['tags'] ?? [],
            'hashtags' => $body['hashtags'] ?? [],
            'cta_text' => $ctaText,
            'cta_links' => $ctaLinks,
            'oauth_token' => $accessToken,
            'refresh_token' => $refreshToken,
            'account_name' => $socialAccount['account_name'] ?? $socialAccount['display_name'] ?? '',
        ];

        // Create or find existing scheduled_posts record for tracking
        $existingPost = Database::fetch(
            "SELECT id FROM scheduled_posts WHERE video_id = ? AND platform = ? AND status IN ('pending', 'publishing')",
            [$videoId, $platform]
        );

        $postId = null;
        if ($existingPost) {
            $postId = $existingPost['id'];
            Database::update('scheduled_posts', ['status' => 'publishing'], 'id = ?', [$postId]);
        } else {
            $postId = Database::insert('scheduled_posts', [
                'video_id' => $videoId,
                'platform' => $platform,
                'scheduled_at' => date('Y-m-d H:i:s'),
                'status' => 'publishing',
                'title' => $publishData['title'],
                'description' => $publishData['description'],
                'tags' => json_encode($publishData['tags']),
                'hashtags' => json_encode($publishData['hashtags']),
                'cta_template_id' => !empty($body['cta_template_id']) ? (int) $body['cta_template_id'] : null,
            ]);
        }

        // Publish via SocialPublisher service
        try {
            $publisher = new SocialPublisher();
            $result = $publisher->publish($platform, $publishData);

            if ($result['success']) {
                Database::update('scheduled_posts', [
                    'status' => 'published',
                    'published_url' => $result['published_url'] ?? null,
                    'error_message' => null,
                ], 'id = ?', [$postId]);

                // Create success notification
                $this->createNotification(
                    $user['id'],
                    'publish_success',
                    "Your video was published to {$platform}",
                    "\"" . ($publishData['title'] ?: 'Untitled') . "\" is now live on {$platform}.",
                    $result['published_url'] ?? null
                );

                // Fire the video.published event to any subscribed webhooks.
                WebhookDispatcher::emit($user['id'], 'video.published', [
                    'video_id'      => $videoId,
                    'platform'      => $platform,
                    'published_url' => $result['published_url'] ?? null,
                    'title'         => $publishData['title'],
                    'post_id'       => $postId,
                ]);

                // Fetch the full post record with video join to match store's expected shape
                $post = Database::fetch(
                    'SELECT sp.*, v.title as video_title, v.thumbnail_path as video_thumbnail, v.type as video_type
                     FROM scheduled_posts sp
                     JOIN videos v ON v.id = sp.video_id
                     WHERE sp.id = ?',
                    [$postId]
                );
                // Decode JSON fields
                if ($post['tags']) $post['tags'] = json_decode($post['tags'], true);
                if ($post['hashtags']) $post['hashtags'] = json_decode($post['hashtags'], true);

                echo json_encode(['post' => $post, 'published_url' => $result['published_url'] ?? null]);
            } elseif (!empty($result['not_configured'])) {
                // Honest gating (Law L1): the operator has not provisioned this
                // platform's developer app. This is NOT a failure to spam the user
                // with — mark the post gated and return 503 so the UI can show a
                // "not available yet" banner instead of a red error.
                Database::update('scheduled_posts', [
                    'status' => 'failed',
                    'error_message' => $result['error'] ?? 'Platform not configured',
                ], 'id = ?', [$postId]);

                http_response_code(503);
                echo json_encode([
                    'error' => $result['error'] ?? 'Platform not configured',
                    'platform' => $platform,
                    'platform_not_configured' => true,
                    'post_id' => $postId,
                ]);
            } else {
                Database::update('scheduled_posts', [
                    'status' => 'failed',
                    'error_message' => $result['error'] ?? 'Unknown publishing error',
                ], 'id = ?', [$postId]);

                http_response_code(502);
                echo json_encode([
                    'error' => $result['error'] ?? 'Publishing failed',
                    'platform' => $platform,
                    'post_id' => $postId,
                ]);
            }
        } catch (\Throwable $e) {
            Database::update('scheduled_posts', [
                'status' => 'failed',
                'error_message' => $e->getMessage(),
            ], 'id = ?', [$postId]);

            // Create failure notification
            $this->createNotification(
                $user['id'],
                'publish_failed',
                "Publishing to {$platform} failed",
                "\"" . ($publishData['title'] ?: 'Untitled') . "\" could not be published: {$e->getMessage()}",
                null
            );

            http_response_code(502);
            echo json_encode([
                'error' => 'Publishing failed: ' . $e->getMessage(),
                'platform' => $platform,
                'post_id' => $postId,
            ]);
        }
    }

    /** Decrypt a stored AES-256-GCM token triple, or null if any part is missing/undecryptable. */
    private function decryptStoredToken(?string $encrypted, ?string $iv, ?string $tag): ?string
    {
        if (!$encrypted || !$iv || !$tag) {
            return null;
        }
        try {
            return (new EncryptionService())->decrypt($encrypted, $iv, $tag);
        } catch (\Throwable $e) {
            error_log('Failed to decrypt social token: ' . $e->getMessage());
            return null;
        }
    }

    /** Insert a notification record for the user. */
    private function createNotification(int $userId, string $type, string $title, string $body, ?string $actionUrl): void
    {
        try {
            Database::insert('notifications', [
                'user_id' => $userId,
                'type' => $type,
                'title' => $title,
                'body' => $body,
                'action_url' => $actionUrl,
            ]);
        } catch (\Throwable $e) {
            // Non-critical — log and continue
            error_log("Failed to create notification: {$e->getMessage()}");
        }
    }
}
