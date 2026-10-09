<?php

declare(strict_types=1);

namespace Contentine\Controllers;

use Contentine\Auth;
use Contentine\Database;

/** Handles notification listing, read-state management, and long-polling for real-time updates. */
class NotificationController
{
    // ──────────────────────────────────────────────
    // Notification Listing
    // ──────────────────────────────────────────────

    /** GET /api/notifications — Paginated notifications with optional unread-only filter. */
    public function index(array $params, array $body): void
    {
        $user = Auth::requireUser();

        $page = max(1, (int) ($_GET['page'] ?? 1));
        $limit = min(50, max(1, (int) ($_GET['limit'] ?? 20)));
        $offset = ($page - 1) * $limit;
        $unreadOnly = filter_var($_GET['unread_only'] ?? 'false', FILTER_VALIDATE_BOOLEAN);

        $where = 'user_id = ?';
        $bindings = [$user['id']];

        if ($unreadOnly) {
            $where .= ' AND is_read = FALSE';
        }

        $total = Database::fetch(
            "SELECT COUNT(*) as cnt FROM notifications WHERE {$where}",
            $bindings
        )['cnt'];

        $notifications = Database::fetchAll(
            "SELECT * FROM notifications WHERE {$where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
            [...$bindings, $limit, $offset]
        );

        // Cast booleans
        foreach ($notifications as &$n) {
            $n['is_read'] = (bool) $n['is_read'];
        }

        // Always include global unread count
        $unreadCount = Database::fetch(
            'SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND is_read = FALSE',
            [$user['id']]
        )['cnt'];

        echo json_encode([
            'notifications' => $notifications,
            'unread_count'  => (int) $unreadCount,
            'total'         => (int) $total,
            'page'          => $page,
            'limit'         => $limit,
        ]);
    }

    // ──────────────────────────────────────────────
    // Read-state Management
    // ──────────────────────────────────────────────

    /** PUT /api/notifications/{id} — Mark a single notification as read. */
    public function markRead(array $params, array $body): void
    {
        $user = Auth::requireUser();

        $updated = Database::update(
            'notifications',
            ['is_read' => true],
            'id = ? AND user_id = ?',
            [$params['id'], $user['id']]
        );

        if ($updated === 0) {
            http_response_code(404);
            echo json_encode(['error' => 'Notification not found']);
            return;
        }

        // Return updated unread count
        $unreadCount = Database::fetch(
            'SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND is_read = FALSE',
            [$user['id']]
        )['cnt'];

        echo json_encode([
            'success'      => true,
            'unread_count' => (int) $unreadCount,
        ]);
    }

    /** PUT /api/notifications/mark-all-read — Mark all unread notifications as read. */
    public function markAllRead(array $params, array $body): void
    {
        $user = Auth::requireUser();

        $updated = Database::update(
            'notifications',
            ['is_read' => true],
            'user_id = ? AND is_read = FALSE',
            [$user['id']]
        );

        echo json_encode([
            'success'      => true,
            'marked_count' => $updated,
            'unread_count' => 0,
        ]);
    }

    // ──────────────────────────────────────────────
    // Polling
    // ──────────────────────────────────────────────

    /** GET /api/notifications/poll — Return new notifications since a given timestamp for lightweight polling. */
    public function poll(array $params, array $body): void
    {
        $user = Auth::requireUser();

        $since = $_GET['since'] ?? null;

        if (!$since) {
            // Default: notifications from the last 5 minutes
            $since = date('Y-m-d H:i:s', strtotime('-5 minutes'));
        } else {
            // Support both ISO timestamps and Unix timestamps
            if (is_numeric($since)) {
                $since = date('Y-m-d H:i:s', (int) $since);
            } else {
                $parsed = strtotime($since);
                if ($parsed === false) {
                    http_response_code(400);
                    echo json_encode(['error' => 'Invalid since timestamp']);
                    return;
                }
                $since = date('Y-m-d H:i:s', $parsed);
            }
        }

        $notifications = Database::fetchAll(
            'SELECT * FROM notifications WHERE user_id = ? AND created_at > ? ORDER BY created_at DESC',
            [$user['id'], $since]
        );

        foreach ($notifications as &$n) {
            $n['is_read'] = (bool) $n['is_read'];
        }

        $unreadCount = Database::fetch(
            'SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND is_read = FALSE',
            [$user['id']]
        )['cnt'];

        echo json_encode([
            'notifications' => $notifications,
            'unread_count'  => (int) $unreadCount,
        ]);
    }
}
