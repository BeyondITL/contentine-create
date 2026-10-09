<?php

declare(strict_types=1);

/**
 * Cron: Collect daily analytics snapshots and evaluate alert thresholds.
 * Run once daily: 0 2 * * * php /path/to/backend/cron/analytics.php
 */

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../src/Database.php';

use Contentine\Database;

$now = date('Y-m-d H:i:s');
$today = date('Y-m-d');
$snapshotCount = 0;
$alertsTriggered = 0;

echo "[{$now}] Analytics cron starting...\n";

// ──────────────────────────────────────────────
// Phase 1: Collect Analytics Snapshots
// ──────────────────────────────────────────────

// Get all users who have published videos with connected social accounts
$users = Database::fetchAll(
    'SELECT DISTINCT u.id as user_id
     FROM users u
     JOIN videos v ON v.user_id = u.id
     JOIN social_accounts sa ON sa.user_id = u.id
     WHERE v.status = "published"'
);

echo "[{$now}] Found " . count($users) . " user(s) with published videos and social accounts.\n";

foreach ($users as $userRow) {
    $userId = (int) $userRow['user_id'];

    // Get this user's published videos
    $videos = Database::fetchAll(
        'SELECT id, title FROM videos WHERE user_id = ? AND status = "published"',
        [$userId]
    );

    // Get this user's connected platforms
    $platforms = Database::fetchAll(
        'SELECT DISTINCT platform FROM social_accounts WHERE user_id = ?',
        [$userId]
    );

    foreach ($videos as $video) {
        $videoId = (int) $video['id'];

        foreach ($platforms as $platformRow) {
            $platform = $platformRow['platform'];

            // Check if we already have a snapshot for today
            $existing = Database::fetch(
                'SELECT id FROM analytics_snapshots WHERE video_id = ? AND platform = ? AND snapshot_date = ?',
                [$videoId, $platform, $today]
            );

            if ($existing) {
                // Update existing snapshot with fresh data
                $data = generateSnapshotData($videoId, $platform, $today);
                Database::update('analytics_snapshots', $data, 'id = ?', [$existing['id']]);
            } else {
                // Create new snapshot
                $data = generateSnapshotData($videoId, $platform, $today);
                $data['video_id'] = $videoId;
                $data['platform'] = $platform;
                $data['snapshot_date'] = $today;
                Database::insert('analytics_snapshots', $data);
            }

            $snapshotCount++;
        }
    }
}

echo "[{$now}] Created/updated {$snapshotCount} analytics snapshot(s).\n";

// ──────────────────────────────────────────────
// Phase 2: Evaluate Alert Thresholds
// ──────────────────────────────────────────────

$activeAlerts = Database::fetchAll(
    'SELECT aa.*, u.name as user_name
     FROM analytics_alerts aa
     JOIN users u ON u.id = aa.user_id
     WHERE aa.is_active = TRUE'
);

echo "[{$now}] Evaluating " . count($activeAlerts) . " active alert(s).\n";

foreach ($activeAlerts as $alert) {
    $alertId = (int) $alert['id'];
    $userId = (int) $alert['user_id'];
    $metric = $alert['metric'];
    $threshold = (int) $alert['threshold'];

    // Skip if already triggered in the last 24 hours
    if (!empty($alert['last_triggered_at'])) {
        $lastTriggered = strtotime($alert['last_triggered_at']);
        if ($lastTriggered && (time() - $lastTriggered) < 86400) {
            continue;
        }
    }

    // Sum the metric across all user's videos for today's snapshots
    $metricColumn = match ($metric) {
        'views'    => 'views',
        'likes'    => 'likes',
        'comments' => 'comments',
        'shares'   => 'shares',
        'ctr'      => 'ctr',
        default    => null,
    };

    if (!$metricColumn) {
        continue;
    }

    // For CTR we use AVG, for everything else SUM
    $aggregation = $metric === 'ctr' ? 'AVG' : 'SUM';

    $result = Database::fetch(
        "SELECT {$aggregation}(a.{$metricColumn}) as metric_value
         FROM analytics_snapshots a
         WHERE a.video_id IN (SELECT id FROM videos WHERE user_id = ?)
           AND a.snapshot_date = ?",
        [$userId, $today]
    );

    $currentValue = (float) ($result['metric_value'] ?? 0);

    if ($currentValue >= $threshold) {
        // Threshold exceeded — trigger alert
        $formattedValue = $metric === 'ctr' ? round($currentValue, 2) . '%' : number_format($currentValue);

        // Create notification
        try {
            Database::insert('notifications', [
                'user_id'    => $userId,
                'type'       => 'analytics_alert',
                'title'      => "Analytics alert: {$metric} threshold reached",
                'body'       => "Your {$metric} reached {$formattedValue} today, exceeding your threshold of {$threshold}.",
                'action_url' => '/analytics',
            ]);
        } catch (\Throwable $e) {
            error_log("[CRON] Failed to create alert notification for user {$userId}: " . $e->getMessage());
        }

        // Update last_triggered_at
        Database::update('analytics_alerts', [
            'last_triggered_at' => $now,
        ], 'id = ?', [$alertId]);

        echo "[{$now}] Alert {$alertId} triggered for user {$userId}: {$metric} = {$formattedValue} >= {$threshold}\n";
        $alertsTriggered++;
    }
}

echo "[{$now}] Done. Snapshots: {$snapshotCount}, Alerts triggered: {$alertsTriggered}\n";

// ──────────────────────────────────────────────
// Helper Functions
// ──────────────────────────────────────────────

/**
 * Generate realistic-looking analytics data for a video/platform/date combination.
 * In production, this would call platform APIs (YouTube Analytics, TikTok Business, etc.).
 * For now, generates plausible stub data with day-over-day variation.
 */
function generateSnapshotData(int $videoId, string $platform, string $date): array
{
    // Use video ID + platform + date as seed for reproducible but varied data
    $seed = crc32("{$videoId}-{$platform}-{$date}");
    mt_srand($seed);

    // Base metrics vary by platform (YouTube/TikTok tend higher than LinkedIn)
    $multiplier = match ($platform) {
        'youtube'   => 1.0,
        'tiktok'    => 1.2,
        'instagram' => 0.8,
        'facebook'  => 0.6,
        'twitter'   => 0.5,
        'linkedin'  => 0.3,
        'threads'   => 0.4,
        default     => 0.5,
    };

    // Generate base views (100-5000 range, scaled by platform)
    $baseViews = mt_rand(100, 5000);
    $views = (int) round($baseViews * $multiplier);

    // Other metrics as ratios of views (realistic engagement rates)
    $likeRate = mt_rand(20, 80) / 1000;       // 2-8% like rate
    $commentRate = mt_rand(5, 30) / 1000;      // 0.5-3% comment rate
    $shareRate = mt_rand(2, 15) / 1000;        // 0.2-1.5% share rate
    $ctr = mt_rand(20, 120) / 10;              // 2-12% CTR

    $likes = max(0, (int) round($views * $likeRate));
    $comments = max(0, (int) round($views * $commentRate));
    $shares = max(0, (int) round($views * $shareRate));

    // Reset the random seed so it doesn't affect the rest of the script
    mt_srand();

    return [
        'views'    => $views,
        'likes'    => $likes,
        'comments' => $comments,
        'shares'   => $shares,
        'ctr'      => round($ctr, 2),
    ];
}
