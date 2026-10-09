<?php

declare(strict_types=1);

namespace Contentine\Controllers;

use Contentine\Auth;
use Contentine\Database;

/** Handles analytics dashboards, alert CRUD, and data export for video performance metrics. */
class AnalyticsController
{
    /** Valid analytics range shortcuts. */
    private const VALID_RANGES = ['7d', '30d', '90d', 'custom'];

    /** Valid alert metric types. */
    private const VALID_METRICS = ['views', 'likes', 'comments', 'shares', 'ctr'];

    /** Valid export formats. */
    // Export is CSV or an HTML report — there is no PDF generation (F-37 honest
    // labeling). 'pdf' is accepted as a legacy alias that maps to the HTML report.
    private const VALID_FORMATS = ['csv', 'html'];

    // ──────────────────────────────────────────────
    // Analytics Dashboard
    // ──────────────────────────────────────────────

    /** GET /api/analytics — Aggregated analytics with summary, daily, per-video, and platform breakdowns. */
    public function index(array $params, array $body): void
    {
        $user = Auth::requireScope('analytics:read');

        $range = $_GET['range'] ?? '30d';
        $platform = $_GET['platform'] ?? 'all';

        if (!in_array($range, self::VALID_RANGES, true)) {
            $range = '30d';
        }

        // Calculate date range
        [$startDate, $endDate] = $this->resolveDateRange($range, $_GET['start'] ?? null, $_GET['end'] ?? null);

        // Build platform filter
        $platformWhere = '';
        $platformBindings = [];
        if ($platform !== 'all') {
            $platformWhere = ' AND a.platform = ?';
            $platformBindings = [$platform];
        }

        $baseWhere = 'a.video_id IN (SELECT id FROM videos WHERE user_id = ?) AND a.snapshot_date BETWEEN ? AND ?';
        $baseBindings = [$user['id'], $startDate, $endDate];

        // Summary aggregation
        $summary = Database::fetch(
            "SELECT
                COALESCE(SUM(a.views), 0) as total_views,
                COALESCE(SUM(a.likes), 0) as total_likes,
                COALESCE(SUM(a.comments), 0) as total_comments,
                COALESCE(SUM(a.shares), 0) as total_shares,
                COALESCE(AVG(a.ctr), 0) as avg_ctr
             FROM analytics_snapshots a
             WHERE {$baseWhere}{$platformWhere}",
            [...$baseBindings, ...$platformBindings]
        );

        // Top platform (by views)
        $topPlatform = Database::fetch(
            "SELECT a.platform, SUM(a.views) as total
             FROM analytics_snapshots a
             WHERE {$baseWhere}
             GROUP BY a.platform
             ORDER BY total DESC
             LIMIT 1",
            $baseBindings
        );

        // Best performing video (by views)
        $bestVideo = Database::fetch(
            "SELECT a.video_id, SUM(a.views) as total
             FROM analytics_snapshots a
             WHERE {$baseWhere}{$platformWhere}
             GROUP BY a.video_id
             ORDER BY total DESC
             LIMIT 1",
            [...$baseBindings, ...$platformBindings]
        );

        $summaryData = [
            'total_views'    => (int) $summary['total_views'],
            'total_likes'    => (int) $summary['total_likes'],
            'total_comments' => (int) $summary['total_comments'],
            'total_shares'   => (int) $summary['total_shares'],
            'avg_ctr'        => round((float) $summary['avg_ctr'], 2),
            'top_platform'   => $topPlatform['platform'] ?? null,
            'best_video_id'  => $bestVideo ? (int) $bestVideo['video_id'] : null,
        ];

        // Daily breakdown
        $daily = Database::fetchAll(
            "SELECT
                a.snapshot_date as date,
                SUM(a.views) as views,
                SUM(a.likes) as likes,
                SUM(a.comments) as comments,
                SUM(a.shares) as shares
             FROM analytics_snapshots a
             WHERE {$baseWhere}{$platformWhere}
             GROUP BY a.snapshot_date
             ORDER BY a.snapshot_date ASC",
            [...$baseBindings, ...$platformBindings]
        );

        // Cast numeric fields
        foreach ($daily as &$row) {
            $row['views'] = (int) $row['views'];
            $row['likes'] = (int) $row['likes'];
            $row['comments'] = (int) $row['comments'];
            $row['shares'] = (int) $row['shares'];
        }

        // Per-video breakdown
        $perVideo = Database::fetchAll(
            "SELECT
                a.video_id,
                v.title,
                a.platform,
                SUM(a.views) as views,
                SUM(a.likes) as likes,
                SUM(a.comments) as comments,
                SUM(a.shares) as shares,
                AVG(a.ctr) as ctr
             FROM analytics_snapshots a
             JOIN videos v ON v.id = a.video_id
             WHERE {$baseWhere}{$platformWhere}
             GROUP BY a.video_id, a.platform
             ORDER BY SUM(a.views) DESC",
            [...$baseBindings, ...$platformBindings]
        );

        foreach ($perVideo as &$row) {
            $row['video_id'] = (int) $row['video_id'];
            $row['views'] = (int) $row['views'];
            $row['likes'] = (int) $row['likes'];
            $row['comments'] = (int) $row['comments'];
            $row['shares'] = (int) $row['shares'];
            $row['ctr'] = round((float) $row['ctr'], 2);
        }

        // Platform breakdown
        $platformBreakdown = Database::fetchAll(
            "SELECT
                a.platform,
                SUM(a.views) as views,
                SUM(a.likes) as likes,
                SUM(a.comments) as comments,
                SUM(a.shares) as shares
             FROM analytics_snapshots a
             WHERE {$baseWhere}{$platformWhere}
             GROUP BY a.platform",
            [...$baseBindings, ...$platformBindings]
        );

        foreach ($platformBreakdown as &$row) {
            $row['views'] = (int) $row['views'];
            $row['likes'] = (int) $row['likes'];
            $row['comments'] = (int) $row['comments'];
            $row['shares'] = (int) $row['shares'];
        }

        echo json_encode([
            'summary'            => $summaryData,
            'daily'              => $daily,
            'per_video'          => $perVideo,
            'platform_breakdown' => $platformBreakdown,
            'range'              => ['start' => $startDate, 'end' => $endDate],
        ]);
    }

    // ──────────────────────────────────────────────
    // Analytics Alerts CRUD
    // ──────────────────────────────────────────────

    /** GET /api/analytics/alerts — List all analytics alerts for the authenticated user. */
    public function alertsIndex(array $params, array $body): void
    {
        $user = Auth::requireUser();

        $alerts = Database::fetchAll(
            'SELECT * FROM analytics_alerts WHERE user_id = ? ORDER BY created_at DESC',
            [$user['id']]
        );

        // Cast types
        foreach ($alerts as &$alert) {
            $alert['threshold'] = (int) $alert['threshold'];
            $alert['is_active'] = (bool) $alert['is_active'];
        }

        echo json_encode(['alerts' => $alerts]);
    }

    /** POST /api/analytics/alerts — Create a new analytics alert. */
    public function alertsStore(array $params, array $body): void
    {
        $user = Auth::requireUser();

        $metric = $body['metric'] ?? '';
        $threshold = isset($body['threshold']) ? (int) $body['threshold'] : 0;

        if (!in_array($metric, self::VALID_METRICS, true)) {
            http_response_code(400);
            echo json_encode(['error' => 'metric must be one of: ' . implode(', ', self::VALID_METRICS)]);
            return;
        }

        if ($threshold <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'threshold must be a positive integer']);
            return;
        }

        $id = Database::insert('analytics_alerts', [
            'user_id'   => $user['id'],
            'metric'    => $metric,
            'threshold' => $threshold,
            'is_active' => true,
        ]);

        $alert = Database::fetch('SELECT * FROM analytics_alerts WHERE id = ?', [$id]);
        $alert['threshold'] = (int) $alert['threshold'];
        $alert['is_active'] = (bool) $alert['is_active'];

        http_response_code(201);
        echo json_encode(['alert' => $alert]);
    }

    /** GET /api/analytics/alerts/{id} — Show a single analytics alert. */
    public function alertsShow(array $params, array $body): void
    {
        $user = Auth::requireUser();

        $alert = Database::fetch(
            'SELECT * FROM analytics_alerts WHERE id = ? AND user_id = ?',
            [$params['id'], $user['id']]
        );

        if (!$alert) {
            http_response_code(404);
            echo json_encode(['error' => 'Alert not found']);
            return;
        }

        $alert['threshold'] = (int) $alert['threshold'];
        $alert['is_active'] = (bool) $alert['is_active'];

        echo json_encode(['alert' => $alert]);
    }

    /** PUT /api/analytics/alerts/{id} — Update an existing analytics alert. */
    public function alertsUpdate(array $params, array $body): void
    {
        $user = Auth::requireUser();

        $alert = Database::fetch(
            'SELECT * FROM analytics_alerts WHERE id = ? AND user_id = ?',
            [$params['id'], $user['id']]
        );

        if (!$alert) {
            http_response_code(404);
            echo json_encode(['error' => 'Alert not found']);
            return;
        }

        $data = [];

        if (isset($body['threshold'])) {
            $threshold = (int) $body['threshold'];
            if ($threshold <= 0) {
                http_response_code(400);
                echo json_encode(['error' => 'threshold must be a positive integer']);
                return;
            }
            $data['threshold'] = $threshold;
        }

        if (isset($body['is_active'])) {
            $data['is_active'] = (bool) $body['is_active'];
        }

        if (isset($body['metric'])) {
            if (!in_array($body['metric'], self::VALID_METRICS, true)) {
                http_response_code(400);
                echo json_encode(['error' => 'metric must be one of: ' . implode(', ', self::VALID_METRICS)]);
                return;
            }
            $data['metric'] = $body['metric'];
        }

        if (!empty($data)) {
            Database::update('analytics_alerts', $data, 'id = ?', [$params['id']]);
        }

        $alert = Database::fetch('SELECT * FROM analytics_alerts WHERE id = ?', [$params['id']]);
        $alert['threshold'] = (int) $alert['threshold'];
        $alert['is_active'] = (bool) $alert['is_active'];

        echo json_encode(['alert' => $alert]);
    }

    /** DELETE /api/analytics/alerts/{id} — Delete an analytics alert. */
    public function alertsDestroy(array $params, array $body): void
    {
        $user = Auth::requireUser();

        $deleted = Database::delete(
            'analytics_alerts',
            'id = ? AND user_id = ?',
            [$params['id'], $user['id']]
        );

        if ($deleted === 0) {
            http_response_code(404);
            echo json_encode(['error' => 'Alert not found']);
            return;
        }

        echo json_encode(['success' => true]);
    }

    // ──────────────────────────────────────────────
    // Data Export
    // ──────────────────────────────────────────────

    /** GET /api/analytics/export — Export analytics data as CSV or a simple HTML report. */
    public function export(array $params, array $body): void
    {
        $user = Auth::requireScope('analytics:read');

        $format = $_GET['format'] ?? 'csv';
        $range = $_GET['range'] ?? '30d';
        $platform = $_GET['platform'] ?? 'all';

        // Legacy alias: the "pdf" export was always an HTML report — honour it honestly.
        if ($format === 'pdf') {
            $format = 'html';
        }
        if (!in_array($format, self::VALID_FORMATS, true)) {
            $format = 'csv';
        }

        if (!in_array($range, self::VALID_RANGES, true)) {
            $range = '30d';
        }

        [$startDate, $endDate] = $this->resolveDateRange($range, $_GET['start'] ?? null, $_GET['end'] ?? null);

        // Build platform filter
        $platformWhere = '';
        $platformBindings = [];
        if ($platform !== 'all') {
            $platformWhere = ' AND a.platform = ?';
            $platformBindings = [$platform];
        }

        $baseWhere = 'a.video_id IN (SELECT id FROM videos WHERE user_id = ?) AND a.snapshot_date BETWEEN ? AND ?';
        $baseBindings = [$user['id'], $startDate, $endDate];

        // Fetch export data: per-video daily snapshots
        $rows = Database::fetchAll(
            "SELECT
                a.snapshot_date as date,
                v.title as video_title,
                a.platform,
                a.views,
                a.likes,
                a.comments,
                a.shares,
                a.ctr
             FROM analytics_snapshots a
             JOIN videos v ON v.id = a.video_id
             WHERE {$baseWhere}{$platformWhere}
             ORDER BY a.snapshot_date ASC, v.title ASC",
            [...$baseBindings, ...$platformBindings]
        );

        if ($format === 'csv') {
            $this->exportCsv($rows, $startDate, $endDate);
        } else {
            $this->exportHtmlReport($rows, $startDate, $endDate, $user);
        }
    }

    // ──────────────────────────────────────────────
    // Publishing Consistency
    // ──────────────────────────────────────────────

    /** GET /api/analytics/consistency — Publishing consistency heatmap with streak calculations. */
    public function consistency(array $params, array $body): void
    {
        $user = Auth::requireScope('analytics:read');

        $year = isset($_GET['year']) ? (int) $_GET['year'] : (int) date('Y');

        $startDate = "{$year}-01-01";
        $endDate = "{$year}-12-31";

        // Fetch daily published counts grouped by date
        $rows = Database::fetchAll(
            "SELECT DATE(published_at) as publish_date, COUNT(*) as count
             FROM scheduled_posts
             WHERE user_id = ? AND status = 'published' AND DATE(published_at) BETWEEN ? AND ?
             GROUP BY DATE(published_at)
             ORDER BY publish_date ASC",
            [$user['id'], $startDate, $endDate]
        );

        // Build date => count map
        $data = [];
        $totalPublished = 0;
        foreach ($rows as $row) {
            $data[$row['publish_date']] = (int) $row['count'];
            $totalPublished += (int) $row['count'];
        }

        // Calculate streaks
        $today = date('Y-m-d');
        $currentStreak = 0;
        $bestStreak = 0;
        $tempStreak = 0;

        // Walk every day of the year up to today (or Dec 31 if viewing a past year)
        $walkEnd = ($year < (int) date('Y')) ? $endDate : min($today, $endDate);
        $cursor = new \DateTime($startDate);
        $limit = new \DateTime($walkEnd);

        while ($cursor <= $limit) {
            $dateStr = $cursor->format('Y-m-d');

            if (isset($data[$dateStr])) {
                $tempStreak++;
                if ($tempStreak > $bestStreak) {
                    $bestStreak = $tempStreak;
                }
            } else {
                $tempStreak = 0;
            }

            $cursor->modify('+1 day');
        }

        // Current streak: consecutive days ending on today (only meaningful if year includes today)
        if ($year === (int) date('Y')) {
            $dayCursor = new \DateTime($today);
            while (isset($data[$dayCursor->format('Y-m-d')])) {
                $currentStreak++;
                $dayCursor->modify('-1 day');
            }
        }

        echo json_encode([
            'data'            => $data,
            'current_streak'  => $currentStreak,
            'best_streak'     => $bestStreak,
            'total_published' => $totalPublished,
            'year'            => $year,
        ]);
    }

    // ──────────────────────────────────────────────
    // Private Helpers
    // ──────────────────────────────────────────────

    /** Resolve start/end dates from range shortcut or explicit dates. */
    private function resolveDateRange(string $range, ?string $start, ?string $end): array
    {
        $endDate = date('Y-m-d');

        if ($range === 'custom' && $start && $end) {
            $startDate = date('Y-m-d', strtotime($start));
            $endDate = date('Y-m-d', strtotime($end));
        } else {
            $days = match ($range) {
                '7d'  => 7,
                '90d' => 90,
                default => 30,
            };
            $startDate = date('Y-m-d', strtotime("-{$days} days"));
        }

        return [$startDate, $endDate];
    }

    /** Generate CSV output with proper headers. */
    private function exportCsv(array $rows, string $startDate, string $endDate): void
    {
        $filename = "contentine_analytics_{$startDate}_to_{$endDate}.csv";

        header('Content-Type: text/csv; charset=utf-8');
        header("Content-Disposition: attachment; filename=\"{$filename}\"");

        $output = fopen('php://output', 'w');

        // CSV header row
        fputcsv($output, ['Date', 'Video Title', 'Platform', 'Views', 'Likes', 'Comments', 'Shares', 'CTR (%)']);

        foreach ($rows as $row) {
            fputcsv($output, [
                $row['date'],
                $row['video_title'],
                $row['platform'],
                $row['views'],
                $row['likes'],
                $row['comments'],
                $row['shares'],
                $row['ctr'],
            ]);
        }

        fclose($output);
    }

    /** Generate a simple HTML summary report (real PDF would require a library like DOMPDF). */
    private function exportHtmlReport(array $rows, string $startDate, string $endDate, array $user): void
    {
        $filename = "contentine_analytics_{$startDate}_to_{$endDate}.html";

        header('Content-Type: text/html; charset=utf-8');
        header("Content-Disposition: attachment; filename=\"{$filename}\"");

        $totalViews = $totalLikes = $totalComments = $totalShares = 0;
        foreach ($rows as $row) {
            $totalViews += (int) $row['views'];
            $totalLikes += (int) $row['likes'];
            $totalComments += (int) $row['comments'];
            $totalShares += (int) $row['shares'];
        }

        $rowCount = count($rows);
        $userName = htmlspecialchars($user['name'] ?? 'User');
        $dateGenerated = date('Y-m-d H:i:s');

        $tableRows = '';
        foreach ($rows as $row) {
            $tableRows .= '<tr>'
                . '<td>' . htmlspecialchars($row['date']) . '</td>'
                . '<td>' . htmlspecialchars($row['video_title']) . '</td>'
                . '<td>' . htmlspecialchars($row['platform']) . '</td>'
                . '<td>' . (int) $row['views'] . '</td>'
                . '<td>' . (int) $row['likes'] . '</td>'
                . '<td>' . (int) $row['comments'] . '</td>'
                . '<td>' . (int) $row['shares'] . '</td>'
                . '<td>' . round((float) $row['ctr'], 2) . '%</td>'
                . '</tr>';
        }

        echo <<<HTML
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Contentine Create Analytics Report</title>
<style>
  body { font-family: Inter, system-ui, sans-serif; margin: 2rem; color: #171717; }
  h1 { color: #00C3FF; }
  .summary { display: flex; gap: 2rem; margin: 1.5rem 0; }
  .stat { background: #E5F8FF; border-radius: 8px; padding: 1rem 1.5rem; }
  .stat strong { display: block; font-size: 1.5rem; color: #00A8DB; }
  table { border-collapse: collapse; width: 100%; margin-top: 1.5rem; }
  th, td { border: 1px solid #D0D7DE; padding: 8px 12px; text-align: left; }
  th { background: #F6F8FA; font-weight: 600; }
  .footer { margin-top: 2rem; font-size: 0.85rem; color: #666; }
</style>
</head>
<body>
  <h1>Contentine Create &mdash; Analytics Report</h1>
  <p>Period: <strong>{$startDate}</strong> to <strong>{$endDate}</strong> &bull; Generated for <strong>{$userName}</strong> on {$dateGenerated}</p>
  <div class="summary">
    <div class="stat"><strong>{$totalViews}</strong> Total Views</div>
    <div class="stat"><strong>{$totalLikes}</strong> Total Likes</div>
    <div class="stat"><strong>{$totalComments}</strong> Total Comments</div>
    <div class="stat"><strong>{$totalShares}</strong> Total Shares</div>
  </div>
  <table>
    <thead>
      <tr><th>Date</th><th>Video</th><th>Platform</th><th>Views</th><th>Likes</th><th>Comments</th><th>Shares</th><th>CTR</th></tr>
    </thead>
    <tbody>
      {$tableRows}
    </tbody>
  </table>
  <p class="footer">Report contains {$rowCount} data point(s). Exported from Contentine Create.</p>
</body>
</html>
HTML;
    }
}
