<?php

declare(strict_types=1);

namespace Contentine\Controllers;

use Contentine\Auth;
use Contentine\Database;
use Contentine\Middleware\AdminMiddleware;
use Contentine\Middleware\InputValidator;

/**
 * Admin review queue for Real Clone Studio requests (SA-12/F-35, Professional tier D-24).
 * Sellers submit clone requests with recorded consent (L7) via AvatarController@realClone;
 * this controller lets an admin review, approve, reject, and track the build.
 */
class RealCloneController
{
    private const VALID_STATUSES = ['pending', 'approved', 'building', 'complete', 'rejected'];

    /** GET /api/admin/real-clone — List clone requests (optionally filtered by status). */
    public function queue(array $params, array $body): void
    {
        Auth::requireUser();
        AdminMiddleware::verify();

        $where = '1=1';
        $bindings = [];
        if (!empty($_GET['status'])) {
            $status = $_GET['status'];
            if (!in_array($status, self::VALID_STATUSES, true)) {
                http_response_code(400);
                echo json_encode(['error' => 'Invalid status filter']);
                return;
            }
            $where .= ' AND rcr.status = ?';
            $bindings[] = $status;
        }

        $requests = Database::fetchAll(
            "SELECT rcr.*, u.name AS user_name, u.email AS user_email, u.plan_tier AS user_plan
             FROM real_clone_requests rcr
             JOIN users u ON u.id = rcr.user_id
             WHERE {$where}
             ORDER BY FIELD(rcr.status, 'pending','approved','building','complete','rejected'), rcr.created_at DESC",
            $bindings
        );

        // Counts per status for the queue header.
        $counts = Database::fetchAll(
            'SELECT status, COUNT(*) AS cnt FROM real_clone_requests GROUP BY status'
        );
        $byStatus = [];
        foreach ($counts as $row) {
            $byStatus[$row['status']] = (int) $row['cnt'];
        }

        echo json_encode(['requests' => $requests, 'counts' => $byStatus]);
    }

    /** POST /api/admin/real-clone/{id}/status — Move a request through the review lifecycle. */
    public function updateStatus(array $params, array $body): void
    {
        Auth::requireUser();
        AdminMiddleware::verify();

        $id = (int) ($params['id'] ?? 0);
        $data = InputValidator::sanitize($body, [
            'status'   => 'required|string|max:20',
            'notes'    => 'nullable|string|max:2000',
            'avatar_id' => 'nullable|int',
        ]);

        $status = $data['status'];
        if (!in_array($status, self::VALID_STATUSES, true)) {
            http_response_code(400);
            echo json_encode(['error' => 'status must be one of: ' . implode(', ', self::VALID_STATUSES)]);
            return;
        }

        $request = Database::fetch('SELECT * FROM real_clone_requests WHERE id = ?', [$id]);
        if (!$request) {
            http_response_code(404);
            echo json_encode(['error' => 'Clone request not found']);
            return;
        }

        // Admin review notes go to admin_notes — never overwrite `notes`, which holds the
        // durable L7 consent affirmation JSON written at submission time (WS-5).
        $update = ['status' => $status];
        if (array_key_exists('notes', $data) && $data['notes'] !== null) {
            $update['admin_notes'] = $data['notes'];
        }
        if (!empty($data['avatar_id'])) {
            $update['avatar_id'] = (int) $data['avatar_id'];
        }

        Database::update('real_clone_requests', $update, 'id = ?', [$id]);

        // Notify the requesting user of the decision.
        $notifyTitle = match ($status) {
            'approved' => 'Your Real Clone request was approved',
            'building' => 'Your Real Clone avatar is being built',
            'complete' => 'Your Real Clone avatar is ready',
            'rejected' => 'Your Real Clone request needs attention',
            default    => null,
        };
        if ($notifyTitle !== null) {
            Database::insert('notifications', [
                'user_id'      => (int) $request['user_id'],
                'type'         => 'system',
                'title'        => $notifyTitle,
                'body'         => $data['notes'] ?? 'Check Real Clone Studio for details.',
                'is_read'      => false,
                'related_type' => 'real_clone',
                'related_id'   => $id,
            ]);
        }

        $updated = Database::fetch('SELECT * FROM real_clone_requests WHERE id = ?', [$id]);
        echo json_encode(['request' => $updated]);
    }
}
