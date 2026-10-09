<?php

declare(strict_types=1);

namespace Contentine\Controllers;

use Contentine\Auth;
use Contentine\Database;

/** Handles scheduled posts CRUD, CTA templates, social accounts, and calendar view. */
class ScheduleController
{
    /** Valid publishing platforms. */
    private const VALID_PLATFORMS = ['youtube', 'tiktok', 'instagram', 'facebook', 'linkedin', 'threads', 'twitter'];

    /** Valid scheduled post statuses. */
    private const VALID_STATUSES = ['pending', 'publishing', 'published', 'failed'];

    // ──────────────────────────────────────────────
    // Scheduled Posts CRUD
    // ──────────────────────────────────────────────

    /** GET /api/schedule — List user's scheduled posts with filters + pagination. */
    public function index(array $params, array $body): void
    {
        $user = Auth::requireUser();
        $page = max(1, (int) ($_GET['page'] ?? 1));
        $limit = min(50, max(1, (int) ($_GET['limit'] ?? 20)));
        $offset = ($page - 1) * $limit;

        $where = 'v.user_id = ?';
        $bindings = [$user['id']];

        // Optional status filter
        if (!empty($_GET['status']) && in_array($_GET['status'], self::VALID_STATUSES, true)) {
            $where .= ' AND sp.status = ?';
            $bindings[] = $_GET['status'];
        }

        // Optional platform filter
        if (!empty($_GET['platform']) && in_array($_GET['platform'], self::VALID_PLATFORMS, true)) {
            $where .= ' AND sp.platform = ?';
            $bindings[] = $_GET['platform'];
        }

        // Optional date range filters
        if (!empty($_GET['date_from'])) {
            $where .= ' AND sp.scheduled_at >= ?';
            $bindings[] = $_GET['date_from'];
        }

        if (!empty($_GET['date_to'])) {
            $where .= ' AND sp.scheduled_at <= ?';
            $bindings[] = $_GET['date_to'];
        }

        $total = Database::fetch(
            "SELECT COUNT(*) as cnt FROM scheduled_posts sp
             JOIN videos v ON v.id = sp.video_id
             WHERE {$where}",
            $bindings
        )['cnt'];

        $posts = Database::fetchAll(
            "SELECT sp.*, v.title as video_title, v.thumbnail_path as video_thumbnail,
                    v.duration_seconds as video_duration, v.aspect_ratio as video_aspect_ratio,
                    v.type as video_type
             FROM scheduled_posts sp
             JOIN videos v ON v.id = sp.video_id
             WHERE {$where}
             ORDER BY sp.scheduled_at ASC
             LIMIT ? OFFSET ?",
            [...$bindings, $limit, $offset]
        );

        // Decode JSON fields
        foreach ($posts as &$post) {
            $post['tags'] = json_decode($post['tags'] ?? '[]', true);
            $post['hashtags'] = json_decode($post['hashtags'] ?? '[]', true);
        }

        echo json_encode([
            'posts' => $posts,
            'total' => (int) $total,
            'page' => $page,
            'limit' => $limit,
        ]);
    }

    /** POST /api/schedule — Create a new scheduled post. */
    public function store(array $params, array $body): void
    {
        $user = Auth::requireUser();

        // Validate required fields
        $videoId = (int) ($body['video_id'] ?? 0);
        $platform = $body['platform'] ?? '';
        $scheduledAt = $body['scheduled_at'] ?? '';

        if (!$videoId) {
            http_response_code(400);
            echo json_encode(['error' => 'video_id is required']);
            return;
        }

        if (!in_array($platform, self::VALID_PLATFORMS, true)) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid platform. Must be one of: ' . implode(', ', self::VALID_PLATFORMS)]);
            return;
        }

        if (!$scheduledAt) {
            http_response_code(400);
            echo json_encode(['error' => 'scheduled_at is required']);
            return;
        }

        // Validate scheduled_at is in the future
        $scheduledTime = strtotime($scheduledAt);
        if ($scheduledTime === false || $scheduledTime <= time()) {
            http_response_code(400);
            echo json_encode(['error' => 'scheduled_at must be a valid future date/time']);
            return;
        }

        // Validate video belongs to user
        $video = Database::fetch(
            'SELECT * FROM videos WHERE id = ? AND user_id = ?',
            [$videoId, $user['id']]
        );

        if (!$video) {
            http_response_code(404);
            echo json_encode(['error' => 'Video not found']);
            return;
        }

        // Validate CTA template if provided
        $ctaTemplateId = !empty($body['cta_template_id']) ? (int) $body['cta_template_id'] : null;
        if ($ctaTemplateId) {
            $template = Database::fetch(
                'SELECT id FROM cta_templates WHERE id = ? AND user_id = ?',
                [$ctaTemplateId, $user['id']]
            );
            if (!$template) {
                http_response_code(404);
                echo json_encode(['error' => 'CTA template not found']);
                return;
            }
        }

        // Check if user has connected social account for this platform
        $socialAccount = Database::fetch(
            'SELECT id FROM social_accounts WHERE user_id = ? AND platform = ?',
            [$user['id'], $platform]
        );

        if (!$socialAccount) {
            http_response_code(400);
            echo json_encode(['error' => "No connected {$platform} account. Connect your account first."]);
            return;
        }

        $id = Database::insert('scheduled_posts', [
            'video_id' => $videoId,
            'platform' => $platform,
            'scheduled_at' => date('Y-m-d H:i:s', $scheduledTime),
            'status' => 'pending',
            'cta_template_id' => $ctaTemplateId,
            'title' => $body['title'] ?? $video['title'],
            'description' => $body['description'] ?? null,
            'tags' => json_encode($body['tags'] ?? []),
            'hashtags' => json_encode($body['hashtags'] ?? []),
        ]);

        $post = Database::fetch(
            "SELECT sp.*, v.title as video_title, v.thumbnail_path as video_thumbnail, v.type as video_type
             FROM scheduled_posts sp
             JOIN videos v ON v.id = sp.video_id
             WHERE sp.id = ?",
            [$id]
        );

        $post['tags'] = json_decode($post['tags'] ?? '[]', true);
        $post['hashtags'] = json_decode($post['hashtags'] ?? '[]', true);

        http_response_code(201);
        echo json_encode(['post' => $post]);
    }

    /** GET /api/schedule/{id} — Get a single scheduled post with video details. */
    public function show(array $params, array $body): void
    {
        $user = Auth::requireUser();

        $post = Database::fetch(
            "SELECT sp.*, v.title as video_title, v.thumbnail_path as video_thumbnail,
                    v.duration_seconds as video_duration, v.mp4_path as video_path,
                    v.aspect_ratio as video_aspect_ratio, v.type as video_type,
                    ct.name as cta_name, ct.cta_text, ct.links as cta_links
             FROM scheduled_posts sp
             JOIN videos v ON v.id = sp.video_id
             LEFT JOIN cta_templates ct ON ct.id = sp.cta_template_id
             WHERE sp.id = ? AND v.user_id = ?",
            [$params['id'], $user['id']]
        );

        if (!$post) {
            http_response_code(404);
            echo json_encode(['error' => 'Scheduled post not found']);
            return;
        }

        $post['tags'] = json_decode($post['tags'] ?? '[]', true);
        $post['hashtags'] = json_decode($post['hashtags'] ?? '[]', true);
        $post['cta_links'] = json_decode($post['cta_links'] ?? '[]', true);

        echo json_encode(['post' => $post]);
    }

    /** PUT /api/schedule/{id} — Update a pending scheduled post. */
    public function update(array $params, array $body): void
    {
        $user = Auth::requireUser();

        $post = Database::fetch(
            "SELECT sp.* FROM scheduled_posts sp
             JOIN videos v ON v.id = sp.video_id
             WHERE sp.id = ? AND v.user_id = ?",
            [$params['id'], $user['id']]
        );

        if (!$post) {
            http_response_code(404);
            echo json_encode(['error' => 'Scheduled post not found']);
            return;
        }

        if ($post['status'] !== 'pending') {
            http_response_code(400);
            echo json_encode(['error' => 'Only pending posts can be updated']);
            return;
        }

        $data = [];

        // Update scheduled_at
        if (isset($body['scheduled_at'])) {
            $scheduledTime = strtotime($body['scheduled_at']);
            if ($scheduledTime === false || $scheduledTime <= time()) {
                http_response_code(400);
                echo json_encode(['error' => 'scheduled_at must be a valid future date/time']);
                return;
            }
            $data['scheduled_at'] = date('Y-m-d H:i:s', $scheduledTime);
        }

        // Update platform
        if (isset($body['platform'])) {
            if (!in_array($body['platform'], self::VALID_PLATFORMS, true)) {
                http_response_code(400);
                echo json_encode(['error' => 'Invalid platform']);
                return;
            }
            // Verify social account for new platform
            $socialAccount = Database::fetch(
                'SELECT id FROM social_accounts WHERE user_id = ? AND platform = ?',
                [$user['id'], $body['platform']]
            );
            if (!$socialAccount) {
                http_response_code(400);
                echo json_encode(['error' => "No connected {$body['platform']} account"]);
                return;
            }
            $data['platform'] = $body['platform'];
        }

        // Update text fields
        if (array_key_exists('title', $body)) {
            $data['title'] = $body['title'];
        }
        if (array_key_exists('description', $body)) {
            $data['description'] = $body['description'];
        }

        // Update JSON fields
        if (isset($body['tags'])) {
            $data['tags'] = json_encode($body['tags']);
        }
        if (isset($body['hashtags'])) {
            $data['hashtags'] = json_encode($body['hashtags']);
        }

        // Update CTA template
        if (array_key_exists('cta_template_id', $body)) {
            $ctaId = $body['cta_template_id'] ? (int) $body['cta_template_id'] : null;
            if ($ctaId) {
                $template = Database::fetch(
                    'SELECT id FROM cta_templates WHERE id = ? AND user_id = ?',
                    [$ctaId, $user['id']]
                );
                if (!$template) {
                    http_response_code(404);
                    echo json_encode(['error' => 'CTA template not found']);
                    return;
                }
            }
            $data['cta_template_id'] = $ctaId;
        }

        if (!empty($data)) {
            Database::update('scheduled_posts', $data, 'id = ?', [$params['id']]);
        }

        // Return updated post
        $post = Database::fetch(
            "SELECT sp.*, v.title as video_title, v.thumbnail_path as video_thumbnail, v.type as video_type
             FROM scheduled_posts sp
             JOIN videos v ON v.id = sp.video_id
             WHERE sp.id = ?",
            [$params['id']]
        );

        $post['tags'] = json_decode($post['tags'] ?? '[]', true);
        $post['hashtags'] = json_decode($post['hashtags'] ?? '[]', true);

        echo json_encode(['post' => $post]);
    }

    /** DELETE /api/schedule/{id} — Delete a pending scheduled post. */
    public function destroy(array $params, array $body): void
    {
        $user = Auth::requireUser();

        $post = Database::fetch(
            "SELECT sp.* FROM scheduled_posts sp
             JOIN videos v ON v.id = sp.video_id
             WHERE sp.id = ? AND v.user_id = ?",
            [$params['id'], $user['id']]
        );

        if (!$post) {
            http_response_code(404);
            echo json_encode(['error' => 'Scheduled post not found']);
            return;
        }

        if ($post['status'] !== 'pending') {
            http_response_code(400);
            echo json_encode(['error' => 'Only pending posts can be deleted']);
            return;
        }

        Database::delete('scheduled_posts', 'id = ?', [$params['id']]);

        echo json_encode(['success' => true]);
    }

    // ──────────────────────────────────────────────
    // Calendar View
    // ──────────────────────────────────────────────

    /** GET /api/schedule/calendar — Return scheduled posts grouped by date for calendar view. */
    public function calendar(array $params, array $body): void
    {
        $user = Auth::requireUser();

        // Default to current month if no range specified
        $from = $_GET['from'] ?? date('Y-m-01');
        $to = $_GET['to'] ?? date('Y-m-t');

        // Extend range by 1 week on each side for calendar overflow
        $fromDate = date('Y-m-d', strtotime($from . ' -7 days'));
        $toDate = date('Y-m-d 23:59:59', strtotime($to . ' +7 days'));

        $posts = Database::fetchAll(
            "SELECT sp.id, sp.video_id, sp.platform, sp.scheduled_at, sp.status,
                    sp.title, sp.published_url,
                    v.title as video_title, v.thumbnail_path as video_thumbnail,
                    v.type as video_type
             FROM scheduled_posts sp
             JOIN videos v ON v.id = sp.video_id
             WHERE v.user_id = ? AND sp.scheduled_at BETWEEN ? AND ?
             ORDER BY sp.scheduled_at ASC",
            [$user['id'], $fromDate, $toDate]
        );

        // Group by date (YYYY-MM-DD)
        $grouped = [];
        foreach ($posts as $post) {
            $date = substr($post['scheduled_at'], 0, 10);
            if (!isset($grouped[$date])) {
                $grouped[$date] = [];
            }
            $grouped[$date][] = $post;
        }

        // Also get counts per platform for the range
        $platformCounts = Database::fetchAll(
            "SELECT sp.platform, sp.status, COUNT(*) as cnt
             FROM scheduled_posts sp
             JOIN videos v ON v.id = sp.video_id
             WHERE v.user_id = ? AND sp.scheduled_at BETWEEN ? AND ?
             GROUP BY sp.platform, sp.status",
            [$user['id'], $fromDate, $toDate]
        );

        echo json_encode([
            'calendar' => $grouped,
            'platform_counts' => $platformCounts,
            'range' => ['from' => $fromDate, 'to' => $toDate],
        ]);
    }

    // ──────────────────────────────────────────────
    // Social Accounts
    // ──────────────────────────────────────────────

    /** GET /api/social-accounts — List user's connected social platform accounts. */
    public function socialAccounts(array $params, array $body): void
    {
        $user = Auth::requireUser();

        $accounts = Database::fetchAll(
            'SELECT id, platform, account_name, token_expires_at, created_at
             FROM social_accounts
             WHERE user_id = ?
             ORDER BY platform ASC',
            [$user['id']]
        );

        // Check token expiry status
        $now = time();
        foreach ($accounts as &$account) {
            $account['is_expired'] = false;
            if ($account['token_expires_at']) {
                $account['is_expired'] = strtotime($account['token_expires_at']) < $now;
            }
        }

        // Build a map of all platforms with connection status
        $platformMap = [];
        foreach (self::VALID_PLATFORMS as $platform) {
            $platformMap[$platform] = [
                'connected' => false,
                'account_name' => null,
                'is_expired' => false,
            ];
        }
        foreach ($accounts as $account) {
            $platformMap[$account['platform']] = [
                'id' => $account['id'],
                'connected' => true,
                'account_name' => $account['account_name'],
                'is_expired' => $account['is_expired'],
                'connected_at' => $account['created_at'],
            ];
        }

        echo json_encode([
            'accounts' => $accounts,
            'platforms' => $platformMap,
        ]);
    }

    /** DELETE /api/social-accounts/{id} — Disconnect a social platform account. */
    public function disconnectSocial(array $params, array $body): void
    {
        $user = Auth::requireUser();

        $account = Database::fetch(
            'SELECT * FROM social_accounts WHERE id = ? AND user_id = ?',
            [$params['id'], $user['id']]
        );

        if (!$account) {
            http_response_code(404);
            echo json_encode(['error' => 'Social account not found']);
            return;
        }

        // Check if there are pending posts for this platform
        $pendingCount = Database::fetch(
            "SELECT COUNT(*) as cnt FROM scheduled_posts sp
             JOIN videos v ON v.id = sp.video_id
             WHERE v.user_id = ? AND sp.platform = ? AND sp.status = 'pending'",
            [$user['id'], $account['platform']]
        )['cnt'];

        if ((int) $pendingCount > 0) {
            http_response_code(400);
            echo json_encode([
                'error' => "You have {$pendingCount} pending scheduled post(s) on {$account['platform']}. Cancel them before disconnecting.",
            ]);
            return;
        }

        Database::delete('social_accounts', 'id = ?', [$params['id']]);

        echo json_encode(['success' => true, 'platform' => $account['platform']]);
    }

    // ──────────────────────────────────────────────
    // CTA Templates CRUD
    // ──────────────────────────────────────────────

    /** GET /api/cta-templates — List user's CTA templates. */
    public function ctaTemplatesIndex(array $params, array $body): void
    {
        $user = Auth::requireUser();

        $templates = Database::fetchAll(
            'SELECT * FROM cta_templates WHERE user_id = ? ORDER BY is_default DESC, created_at DESC',
            [$user['id']]
        );

        // Decode JSON fields
        foreach ($templates as &$template) {
            $template['links'] = json_decode($template['links'] ?? '[]', true);
            $template['is_default'] = (bool) $template['is_default'];
        }

        echo json_encode(['templates' => $templates]);
    }

    /** POST /api/cta-templates — Create a new CTA template. */
    public function ctaTemplatesStore(array $params, array $body): void
    {
        $user = Auth::requireUser();

        $name = trim($body['name'] ?? '');
        $ctaText = trim($body['cta_text'] ?? '');

        if (!$name) {
            http_response_code(400);
            echo json_encode(['error' => 'Template name is required']);
            return;
        }

        if (!$ctaText) {
            http_response_code(400);
            echo json_encode(['error' => 'CTA text is required']);
            return;
        }

        $isDefault = (bool) ($body['is_default'] ?? false);

        // If this is marked as default, unset existing default
        if ($isDefault) {
            Database::update('cta_templates', ['is_default' => false], 'user_id = ? AND is_default = ?', [$user['id'], true]);
        }

        $id = Database::insert('cta_templates', [
            'user_id' => $user['id'],
            'name' => $name,
            'cta_text' => $ctaText,
            'links' => json_encode($body['links'] ?? []),
            'is_default' => $isDefault,
        ]);

        $template = Database::fetch('SELECT * FROM cta_templates WHERE id = ?', [$id]);
        $template['links'] = json_decode($template['links'] ?? '[]', true);
        $template['is_default'] = (bool) $template['is_default'];

        http_response_code(201);
        echo json_encode(['template' => $template]);
    }

    /** GET /api/cta-templates/{id} — Get a single CTA template. */
    public function ctaTemplatesShow(array $params, array $body): void
    {
        $user = Auth::requireUser();

        $template = Database::fetch(
            'SELECT * FROM cta_templates WHERE id = ? AND user_id = ?',
            [$params['id'], $user['id']]
        );

        if (!$template) {
            http_response_code(404);
            echo json_encode(['error' => 'CTA template not found']);
            return;
        }

        $template['links'] = json_decode($template['links'] ?? '[]', true);
        $template['is_default'] = (bool) $template['is_default'];

        echo json_encode(['template' => $template]);
    }

    /** PUT /api/cta-templates/{id} — Update a CTA template. */
    public function ctaTemplatesUpdate(array $params, array $body): void
    {
        $user = Auth::requireUser();

        $template = Database::fetch(
            'SELECT * FROM cta_templates WHERE id = ? AND user_id = ?',
            [$params['id'], $user['id']]
        );

        if (!$template) {
            http_response_code(404);
            echo json_encode(['error' => 'CTA template not found']);
            return;
        }

        $data = [];

        if (isset($body['name'])) {
            $name = trim($body['name']);
            if (!$name) {
                http_response_code(400);
                echo json_encode(['error' => 'Template name cannot be empty']);
                return;
            }
            $data['name'] = $name;
        }

        if (isset($body['cta_text'])) {
            $ctaText = trim($body['cta_text']);
            if (!$ctaText) {
                http_response_code(400);
                echo json_encode(['error' => 'CTA text cannot be empty']);
                return;
            }
            $data['cta_text'] = $ctaText;
        }

        if (isset($body['links'])) {
            $data['links'] = json_encode($body['links']);
        }

        if (isset($body['is_default'])) {
            $isDefault = (bool) $body['is_default'];
            // If setting as default, unset existing default
            if ($isDefault) {
                Database::update('cta_templates', ['is_default' => false], 'user_id = ? AND is_default = ?', [$user['id'], true]);
            }
            $data['is_default'] = $isDefault;
        }

        if (!empty($data)) {
            Database::update('cta_templates', $data, 'id = ?', [$params['id']]);
        }

        $template = Database::fetch('SELECT * FROM cta_templates WHERE id = ?', [$params['id']]);
        $template['links'] = json_decode($template['links'] ?? '[]', true);
        $template['is_default'] = (bool) $template['is_default'];

        echo json_encode(['template' => $template]);
    }

    /** DELETE /api/cta-templates/{id} — Delete a CTA template. */
    public function ctaTemplatesDestroy(array $params, array $body): void
    {
        $user = Auth::requireUser();

        $template = Database::fetch(
            'SELECT * FROM cta_templates WHERE id = ? AND user_id = ?',
            [$params['id'], $user['id']]
        );

        if (!$template) {
            http_response_code(404);
            echo json_encode(['error' => 'CTA template not found']);
            return;
        }

        // Null out references in scheduled_posts
        Database::update('scheduled_posts', ['cta_template_id' => null], 'cta_template_id = ?', [$params['id']]);

        Database::delete('cta_templates', 'id = ?', [$params['id']]);

        echo json_encode(['success' => true]);
    }

    // ──────────────────────────────────────────────
    // Bulk CSV fan-out (SA-09 / F-45 — bulk_jobs consumer)
    // ──────────────────────────────────────────────

    /** Maximum rows accepted in a single bulk schedule job. */
    private const MAX_BULK_ROWS = 500;

    /**
     * POST /api/schedule/bulk — Fan a CSV/batch of rows out into scheduled_posts.
     * Records the batch as a real bulk_jobs row (total_count / completed_count /
     * status) so the client can track genuine progress — this is the consumer the
     * previously-orphaned bulk_jobs table lacked. Per-row failures are collected
     * and returned rather than aborting the whole batch; nothing is fabricated.
     * Body: { rows: [{video_id, platform, scheduled_at, title?, description?, tags?, hashtags?, cta_template_id?}] }
     */
    public function bulkStore(array $params, array $body): void
    {
        // JWT/interactive sessions have full access; API keys must carry 'videos:write'.
        $user = Auth::requireScope('videos:write');

        $rows = $body['rows'] ?? [];
        if (!is_array($rows) || count($rows) === 0) {
            http_response_code(400);
            echo json_encode(['error' => 'rows must be a non-empty array']);
            return;
        }
        if (count($rows) > self::MAX_BULK_ROWS) {
            http_response_code(400);
            echo json_encode(['error' => 'A bulk batch may contain at most ' . self::MAX_BULK_ROWS . ' rows']);
            return;
        }

        // Open the bulk job (real progress tracker, consumes the bulk_jobs table).
        $jobId = Database::insert('bulk_jobs', [
            'user_id'         => $user['id'],
            'type'            => 'csv',
            'config_json'     => json_encode(['source' => 'scheduler_csv', 'row_count' => count($rows)]),
            'total_count'     => count($rows),
            'completed_count' => 0,
            'status'          => 'processing',
        ]);

        $created = [];
        $errors = [];
        $completed = 0;

        foreach ($rows as $index => $row) {
            $result = $this->insertScheduledRow($user['id'], is_array($row) ? $row : []);
            if ($result['ok']) {
                $created[] = $result['post'];
                $completed++;
                // Advance real progress as each row lands.
                Database::update('bulk_jobs', ['completed_count' => $completed], 'id = ?', [$jobId]);
            } else {
                $errors[] = ['row' => $index, 'error' => $result['error']];
            }
        }

        $finalStatus = $completed === 0 ? 'failed' : 'completed';
        Database::update('bulk_jobs', ['status' => $finalStatus], 'id = ?', [$jobId]);

        http_response_code($completed === 0 ? 422 : 201);
        echo json_encode([
            'job' => [
                'id'              => (int) $jobId,
                'total_count'     => count($rows),
                'completed_count' => $completed,
                'status'          => $finalStatus,
            ],
            'posts'  => $created,
            'errors' => $errors,
        ]);
    }

    /** GET /api/schedule/bulk/{id} — Progress of a bulk job (owner only). */
    public function bulkStatus(array $params, array $body): void
    {
        // Parity with bulkStore: a key that can create a bulk job can also poll it.
        $user = Auth::requireScope('videos:read');

        $job = Database::fetch(
            'SELECT id, type, total_count, completed_count, status, created_at
             FROM bulk_jobs WHERE id = ? AND user_id = ?',
            [(int) ($params['id'] ?? 0), $user['id']]
        );

        if (!$job) {
            http_response_code(404);
            echo json_encode(['error' => 'Bulk job not found']);
            return;
        }

        $job['id'] = (int) $job['id'];
        $job['total_count'] = (int) $job['total_count'];
        $job['completed_count'] = (int) $job['completed_count'];
        echo json_encode(['job' => $job]);
    }

    /**
     * Validate one bulk row and insert a scheduled_posts record for it.
     * Returns ['ok'=>bool, 'post'=>?array, 'error'=>?string]. Never echoes/exits —
     * bulk callers aggregate the outcomes.
     */
    private function insertScheduledRow(int $userId, array $row): array
    {
        $videoId = (int) ($row['video_id'] ?? 0);
        $platform = $row['platform'] ?? '';
        $scheduledAt = $row['scheduled_at'] ?? '';

        if (!$videoId) {
            return ['ok' => false, 'post' => null, 'error' => 'video_id is required'];
        }
        if (!in_array($platform, self::VALID_PLATFORMS, true)) {
            return ['ok' => false, 'post' => null, 'error' => "invalid platform: {$platform}"];
        }
        $scheduledTime = strtotime((string) $scheduledAt);
        if ($scheduledTime === false || $scheduledTime <= time()) {
            return ['ok' => false, 'post' => null, 'error' => 'scheduled_at must be a valid future date/time'];
        }

        $video = Database::fetch('SELECT id, title FROM videos WHERE id = ? AND user_id = ?', [$videoId, $userId]);
        if (!$video) {
            return ['ok' => false, 'post' => null, 'error' => "video {$videoId} not found"];
        }

        $ctaTemplateId = !empty($row['cta_template_id']) ? (int) $row['cta_template_id'] : null;
        if ($ctaTemplateId) {
            $template = Database::fetch('SELECT id FROM cta_templates WHERE id = ? AND user_id = ?', [$ctaTemplateId, $userId]);
            if (!$template) {
                return ['ok' => false, 'post' => null, 'error' => "cta_template {$ctaTemplateId} not found"];
            }
        }

        $socialAccount = Database::fetch('SELECT id FROM social_accounts WHERE user_id = ? AND platform = ?', [$userId, $platform]);
        if (!$socialAccount) {
            return ['ok' => false, 'post' => null, 'error' => "no connected {$platform} account"];
        }

        $id = Database::insert('scheduled_posts', [
            'video_id'        => $videoId,
            'platform'        => $platform,
            'scheduled_at'    => date('Y-m-d H:i:s', $scheduledTime),
            'status'          => 'pending',
            'cta_template_id' => $ctaTemplateId,
            'title'           => $row['title'] ?? $video['title'],
            'description'     => $row['description'] ?? null,
            'tags'            => json_encode($row['tags'] ?? []),
            'hashtags'        => json_encode($row['hashtags'] ?? []),
        ]);

        $post = Database::fetch(
            "SELECT sp.*, v.title as video_title, v.thumbnail_path as video_thumbnail, v.type as video_type
             FROM scheduled_posts sp
             JOIN videos v ON v.id = sp.video_id
             WHERE sp.id = ?",
            [$id]
        );
        $post['tags'] = json_decode($post['tags'] ?? '[]', true);
        $post['hashtags'] = json_decode($post['hashtags'] ?? '[]', true);

        return ['ok' => true, 'post' => $post, 'error' => null];
    }

}
