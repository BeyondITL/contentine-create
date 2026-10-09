<?php

declare(strict_types=1);

namespace Contentine\Controllers;

use Contentine\Auth;
use Contentine\Database;
use Contentine\Services\ApiKeyService;

/** Handles user profile, settings, onboarding, account deletion, and usage statistics. */
class UserController
{
    private ApiKeyService $keyService;

    public function __construct()
    {
        $this->keyService = new ApiKeyService();
    }

    // ──────────────────────────────────────────────
    // Profile
    // ──────────────────────────────────────────────

    /** GET /api/user/profile — Return authenticated user's profile and settings. */
    public function profile(array $params, array $body): void
    {
        $user = Auth::requireUser();

        // Parse onboarding_data JSON if present
        $onboardingData = null;
        if (!empty($user['onboarding_data'])) {
            $onboardingData = is_string($user['onboarding_data'])
                ? json_decode($user['onboarding_data'], true)
                : $user['onboarding_data'];
        }

        echo json_encode([
            'id'                      => (int) $user['id'],
            'name'                    => $user['name'],
            'email'                   => $user['email'],
            'plan_tier'               => $user['plan_tier'],
            'timezone'                => $user['timezone'] ?? 'UTC',
            'trial_ends_at'           => $user['trial_ends_at'],
            'onboarding_completed_at' => $user['onboarding_completed_at'],
            'onboarding_data'         => $onboardingData,
            'stripe_customer_id'      => $user['stripe_customer_id'] ?? null,
            'created_at'              => $user['created_at'],
        ]);
    }

    // ──────────────────────────────────────────────
    // Update Profile
    // ──────────────────────────────────────────────

    /** PUT /api/user/profile — Update user profile fields. */
    public function updateProfile(array $params, array $body): void
    {
        $user = Auth::requireUser();

        $data = [];

        if (isset($body['name'])) {
            $name = trim($body['name']);
            if (empty($name)) {
                http_response_code(400);
                echo json_encode(['error' => 'Name cannot be empty']);
                return;
            }
            if (mb_strlen($name) > 100) {
                http_response_code(400);
                echo json_encode(['error' => 'Name must be 100 characters or fewer']);
                return;
            }
            $data['name'] = $name;
        }

        if (isset($body['timezone'])) {
            $timezone = trim($body['timezone']);
            // Validate timezone string
            try {
                new \DateTimeZone($timezone);
                $data['timezone'] = $timezone;
            } catch (\Exception) {
                http_response_code(400);
                echo json_encode(['error' => 'Invalid timezone']);
                return;
            }
        }

        if (isset($body['preferences'])) {
            if (!is_array($body['preferences'])) {
                http_response_code(400);
                echo json_encode(['error' => 'Preferences must be an object']);
                return;
            }
            // Store preferences as part of onboarding_data JSON (merge with existing)
            $existingData = [];
            if (!empty($user['onboarding_data'])) {
                $existingData = is_string($user['onboarding_data'])
                    ? json_decode($user['onboarding_data'], true) ?? []
                    : $user['onboarding_data'];
            }
            $existingData['preferences'] = $body['preferences'];
            $data['onboarding_data'] = json_encode($existingData);
        }

        if (empty($data)) {
            http_response_code(400);
            echo json_encode(['error' => 'No valid fields to update']);
            return;
        }

        Database::update('users', $data, 'id = ?', [$user['id']]);

        // Return updated profile
        $updated = Database::fetch('SELECT * FROM users WHERE id = ?', [$user['id']]);
        unset($updated['password_hash']);

        $onboardingData = null;
        if (!empty($updated['onboarding_data'])) {
            $onboardingData = is_string($updated['onboarding_data'])
                ? json_decode($updated['onboarding_data'], true)
                : $updated['onboarding_data'];
        }

        echo json_encode([
            'id'                      => (int) $updated['id'],
            'name'                    => $updated['name'],
            'email'                   => $updated['email'],
            'plan_tier'               => $updated['plan_tier'],
            'timezone'                => $updated['timezone'] ?? 'UTC',
            'trial_ends_at'           => $updated['trial_ends_at'],
            'onboarding_completed_at' => $updated['onboarding_completed_at'],
            'onboarding_data'         => $onboardingData,
            'created_at'              => $updated['created_at'],
        ]);
    }

    // ──────────────────────────────────────────────
    // Onboarding
    // ──────────────────────────────────────────────

    /** POST /api/user/onboarding — Mark onboarding as completed and store onboarding choices. */
    public function completeOnboarding(array $params, array $body): void
    {
        $user = Auth::requireUser();

        $contentTypes = $body['content_types'] ?? [];
        $connectedPlatforms = $body['connected_platforms'] ?? [];
        $firstAction = $body['first_action'] ?? '';

        if (!is_array($contentTypes)) {
            http_response_code(400);
            echo json_encode(['error' => 'content_types must be an array']);
            return;
        }

        if (!is_array($connectedPlatforms)) {
            http_response_code(400);
            echo json_encode(['error' => 'connected_platforms must be an array']);
            return;
        }

        // Merge with any existing onboarding data (e.g., preferences)
        $existingData = [];
        if (!empty($user['onboarding_data'])) {
            $existingData = is_string($user['onboarding_data'])
                ? json_decode($user['onboarding_data'], true) ?? []
                : $user['onboarding_data'];
        }

        $onboardingData = array_merge($existingData, [
            'content_types'       => $contentTypes,
            'connected_platforms' => $connectedPlatforms,
            'first_action'        => $firstAction,
            'completed_at'        => date('Y-m-d H:i:s'),
        ]);

        Database::update('users', [
            'onboarding_completed_at' => date('Y-m-d H:i:s'),
            'onboarding_data'         => json_encode($onboardingData),
        ], 'id = ?', [$user['id']]);

        echo json_encode([
            'success'                 => true,
            'onboarding_completed_at' => date('Y-m-d H:i:s'),
            'onboarding_data'         => $onboardingData,
        ]);
    }

    // ──────────────────────────────────────────────
    // Delete Account
    // ──────────────────────────────────────────────

    /** DELETE /api/user/account — Permanently delete user account and all associated data. */
    public function deleteAccount(array $params, array $body): void
    {
        $user = Auth::requireUser();

        // Cancel Stripe subscription if it exists
        if (!empty($user['stripe_subscription_id'])) {
            $keyInfo = $this->keyService->getKey('stripe');
            if ($keyInfo) {
                try {
                    \Stripe\Stripe::setApiKey($keyInfo['api_key']);
                    $subscription = \Stripe\Subscription::retrieve($user['stripe_subscription_id']);
                    $subscription->cancel();
                } catch (\Exception $e) {
                    error_log("Failed to cancel Stripe subscription during account deletion: " . $e->getMessage());
                    // Continue with deletion even if Stripe cancellation fails
                }
            }
        }

        // CASCADE delete handles most related records (videos, notifications, etc.)
        // but we should clean up files first
        $this->cleanupUserFiles($user['id']);

        // Delete the user (CASCADE handles related table rows)
        Database::delete('users', 'id = ?', [$user['id']]);

        echo json_encode(['success' => true, 'message' => 'Account permanently deleted']);
    }

    // ──────────────────────────────────────────────
    // Usage Statistics
    // ──────────────────────────────────────────────

    /** GET /api/user/usage — Return usage statistics for the authenticated user. */
    public function usage(array $params, array $body): void
    {
        $user = Auth::requireUser();

        // Count videos created
        $videosCreated = Database::fetch(
            'SELECT COUNT(*) as cnt FROM videos WHERE user_id = ?',
            [$user['id']]
        )['cnt'];

        // Count posts scheduled
        $postsScheduled = Database::fetch(
            'SELECT COUNT(*) as cnt FROM scheduled_posts sp
             JOIN videos v ON v.id = sp.video_id
             WHERE v.user_id = ?',
            [$user['id']]
        )['cnt'];

        // Count posts published
        $postsPublished = Database::fetch(
            "SELECT COUNT(*) as cnt FROM scheduled_posts sp
             JOIN videos v ON v.id = sp.video_id
             WHERE v.user_id = ? AND sp.status = 'published'",
            [$user['id']]
        )['cnt'];

        // Storage used (from user record, in bytes → convert to MB)
        $storageUsedBytes = (int) ($user['storage_used_bytes'] ?? 0);
        $storageUsedMb = round($storageUsedBytes / (1024 * 1024), 2);

        // Trial videos used (videos created during trial period)
        $trialVideosUsed = 0;
        if (!empty($user['trial_ends_at'])) {
            $trialVideosUsed = (int) Database::fetch(
                'SELECT COUNT(*) as cnt FROM videos WHERE user_id = ? AND created_at <= ?',
                [$user['id'], $user['trial_ends_at']]
            )['cnt'];
        }

        // Remix projects count
        $remixProjects = Database::fetch(
            'SELECT COUNT(*) as cnt FROM remix_projects WHERE user_id = ?',
            [$user['id']]
        )['cnt'];

        // AI writer documents count
        $writerDocs = Database::fetch(
            'SELECT COUNT(*) as cnt FROM ai_writer_docs WHERE user_id = ?',
            [$user['id']]
        )['cnt'];

        // Thumbnails generated count
        $thumbnails = Database::fetch(
            'SELECT COUNT(*) as cnt FROM thumbnails WHERE user_id = ?',
            [$user['id']]
        )['cnt'];

        echo json_encode([
            'videos_created'    => (int) $videosCreated,
            'posts_scheduled'   => (int) $postsScheduled,
            'posts_published'   => (int) $postsPublished,
            'storage_used_mb'   => $storageUsedMb,
            'plan_tier'         => $user['plan_tier'],
            'trial_ends_at'     => $user['trial_ends_at'],
            'trial_videos_used' => $trialVideosUsed,
            'remix_projects'    => (int) $remixProjects,
            'writer_documents'  => (int) $writerDocs,
            'thumbnails'        => (int) $thumbnails,
        ]);
    }

    // ──────────────────────────────────────────────
    // Private Helpers
    // ──────────────────────────────────────────────

    /** Remove all uploaded files associated with a user before account deletion. */
    private function cleanupUserFiles(int $userId): void
    {
        // Clean up video files
        $videos = Database::fetchAll(
            'SELECT mp4_path, thumbnail_path FROM videos WHERE user_id = ?',
            [$userId]
        );
        foreach ($videos as $video) {
            $this->deleteFileIfExists($video['mp4_path']);
            $this->deleteFileIfExists($video['thumbnail_path']);
        }

        // Clean up thumbnail files
        $thumbnails = Database::fetchAll(
            'SELECT image_path FROM thumbnails WHERE user_id = ?',
            [$userId]
        );
        foreach ($thumbnails as $thumb) {
            $this->deleteFileIfExists($thumb['image_path']);
        }

        // Clean up asset library files
        $assets = Database::fetchAll(
            'SELECT file_path FROM asset_library WHERE user_id = ?',
            [$userId]
        );
        foreach ($assets as $asset) {
            $this->deleteFileIfExists($asset['file_path']);
        }

        // Clean up character anchor photos
        $characters = Database::fetchAll(
            'SELECT photo_path FROM character_anchors WHERE user_id = ?',
            [$userId]
        );
        foreach ($characters as $char) {
            $this->deleteFileIfExists($char['photo_path']);
        }
    }

    /** Delete a file from the uploads directory if it exists. */
    private function deleteFileIfExists(?string $relativePath): void
    {
        if (empty($relativePath)) {
            return;
        }
        $fullPath = __DIR__ . '/../../' . ltrim($relativePath, '/');
        if (file_exists($fullPath)) {
            unlink($fullPath);
        }
    }
}
