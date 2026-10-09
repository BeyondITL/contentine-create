<?php

declare(strict_types=1);

namespace Contentine\Controllers;

use Contentine\Auth;
use Contentine\Database;
use Contentine\Middleware\AdminMiddleware;

/**
 * Admin user directory (SA-06 / F-17). Real, paginated listing from the users
 * table — replaces the previously hardcoded single admin row in the UI.
 */
class AdminUserController
{
    private const DEFAULT_PER_PAGE = 25;
    private const MAX_PER_PAGE = 100;

    /**
     * GET /api/admin/users?page=&per_page=&search= — Paginated user list.
     * Never returns password hashes or Stripe secrets.
     */
    public function index(array $params, array $body): void
    {
        Auth::requireUser();
        AdminMiddleware::verify();

        $page = max(1, (int) ($_GET['page'] ?? 1));
        $perPage = (int) ($_GET['per_page'] ?? self::DEFAULT_PER_PAGE);
        $perPage = max(1, min(self::MAX_PER_PAGE, $perPage));
        $offset = ($page - 1) * $perPage;

        $search = trim((string) ($_GET['search'] ?? ''));

        // Build an optional search filter over name/email.
        $where = '';
        $args = [];
        if ($search !== '') {
            $where = 'WHERE u.name LIKE ? OR u.email LIKE ?';
            $like = '%' . $search . '%';
            $args = [$like, $like];
        }

        $total = (int) (Database::fetch("SELECT COUNT(*) AS cnt FROM users u {$where}", $args)['cnt'] ?? 0);

        // Enrich with a real per-user video count. LIMIT/OFFSET are integers we
        // control, so they are inlined safely; user input stays parameterised.
        $rows = Database::fetchAll(
            "SELECT u.id, u.email, u.name, u.plan_tier, u.role, u.trial_ends_at,
                    u.onboarding_completed_at, u.created_at,
                    (SELECT COUNT(*) FROM videos v WHERE v.user_id = u.id) AS video_count
             FROM users u
             {$where}
             ORDER BY u.created_at DESC
             LIMIT {$perPage} OFFSET {$offset}",
            $args
        );

        $users = array_map(static function (array $u): array {
            return [
                'id'                      => (int) $u['id'],
                'email'                   => $u['email'],
                'name'                    => $u['name'],
                'plan_tier'               => $u['plan_tier'],
                'role'                    => $u['role'] ?? 'owner',
                'trial_ends_at'           => $u['trial_ends_at'],
                'onboarding_completed_at' => $u['onboarding_completed_at'],
                'video_count'             => (int) $u['video_count'],
                'created_at'              => $u['created_at'],
            ];
        }, $rows);

        echo json_encode([
            'users' => $users,
            'pagination' => [
                'page'        => $page,
                'per_page'    => $perPage,
                'total'       => $total,
                'total_pages' => (int) ceil($total / $perPage),
            ],
        ]);
    }
}
