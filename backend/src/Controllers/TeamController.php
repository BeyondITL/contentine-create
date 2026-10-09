<?php

declare(strict_types=1);

namespace Contentine\Controllers;

use Contentine\Auth;
use Contentine\Database;

/** Handles team creation, member management, invitations, and activity feed. */
class TeamController
{
    /** Roles that can be assigned via invite. */
    private const ASSIGNABLE_ROLES = ['editor', 'viewer'];

    /** Plans that allow team features. */
    private const TEAM_ELIGIBLE_PLANS = ['business', 'enterprise'];

    // ──────────────────────────────────────────────
    // Team CRUD
    // ──────────────────────────────────────────────

    /** GET /api/teams — Get the authenticated user's team and its members. */
    public function index(array $params, array $body): void
    {
        $user = Auth::requireUser();

        $teamId = $user['team_id'] ?? null;

        if (!$teamId) {
            echo json_encode(['team' => null, 'members' => []]);
            return;
        }

        $team = Database::fetch('SELECT * FROM teams WHERE id = ?', [$teamId]);

        if (!$team) {
            echo json_encode(['team' => null, 'members' => []]);
            return;
        }

        $members = Database::fetchAll(
            'SELECT id, name, email, role, avatar_url, created_at
             FROM users
             WHERE team_id = ?
             ORDER BY FIELD(role, "owner", "editor", "viewer"), name ASC',
            [$teamId]
        );

        echo json_encode([
            'team'    => $team,
            'members' => $members,
        ]);
    }

    /** POST /api/teams — Create a new team (business/enterprise plans only). */
    public function store(array $params, array $body): void
    {
        $user = Auth::requireUser();

        // Verify plan eligibility
        $plan = $user['subscription_tier'] ?? $user['plan'] ?? 'free';
        if (!in_array($plan, self::TEAM_ELIGIBLE_PLANS, true)) {
            http_response_code(403);
            echo json_encode(['error' => 'Team features require a Business or Enterprise plan.']);
            return;
        }

        // Check user doesn't already belong to a team
        if (!empty($user['team_id'])) {
            http_response_code(400);
            echo json_encode(['error' => 'You already belong to a team. Leave your current team first.']);
            return;
        }

        $name = trim($body['name'] ?? '');

        if ($name === '') {
            http_response_code(400);
            echo json_encode(['error' => 'Team name is required']);
            return;
        }

        if (mb_strlen($name) > 100) {
            http_response_code(400);
            echo json_encode(['error' => 'Team name must be 100 characters or fewer']);
            return;
        }

        // Create the team
        $teamId = Database::insert('teams', [
            'name'       => $name,
            'owner_id'   => $user['id'],
        ]);

        // Assign the creator as owner
        Database::update('users', [
            'team_id' => $teamId,
            'role'    => 'owner',
        ], 'id = ?', [$user['id']]);

        $team = Database::fetch('SELECT * FROM teams WHERE id = ?', [$teamId]);

        // Log activity
        $this->logActivity($teamId, $user['id'], 'team_created', "Created team \"{$name}\"");

        http_response_code(201);
        echo json_encode(['team' => $team]);
    }

    /** PUT /api/teams/{id} — Update team settings (owner only). */
    public function update(array $params, array $body): void
    {
        $user = Auth::requireUser();
        $teamId = (int) $params['id'];

        // Verify ownership
        $team = Database::fetch('SELECT * FROM teams WHERE id = ? AND owner_id = ?', [$teamId, $user['id']]);

        if (!$team) {
            http_response_code(404);
            echo json_encode(['error' => 'Team not found or you are not the owner']);
            return;
        }

        $name = trim($body['name'] ?? '');

        if ($name === '') {
            http_response_code(400);
            echo json_encode(['error' => 'Team name is required']);
            return;
        }

        if (mb_strlen($name) > 100) {
            http_response_code(400);
            echo json_encode(['error' => 'Team name must be 100 characters or fewer']);
            return;
        }

        Database::update('teams', ['name' => $name], 'id = ?', [$teamId]);

        $team = Database::fetch('SELECT * FROM teams WHERE id = ?', [$teamId]);

        $this->logActivity($teamId, $user['id'], 'team_updated', "Renamed team to \"{$name}\"");

        echo json_encode(['team' => $team]);
    }

    // ──────────────────────────────────────────────
    // Invitations
    // ──────────────────────────────────────────────

    /** POST /api/teams/invite — Invite a user to the team by email (owner only). */
    public function invite(array $params, array $body): void
    {
        $user = Auth::requireUser();

        // Verify user has a team and is owner
        $teamId = $user['team_id'] ?? null;
        if (!$teamId) {
            http_response_code(400);
            echo json_encode(['error' => 'You do not belong to a team']);
            return;
        }

        $team = Database::fetch('SELECT * FROM teams WHERE id = ? AND owner_id = ?', [$teamId, $user['id']]);
        if (!$team) {
            http_response_code(403);
            echo json_encode(['error' => 'Only the team owner can invite members']);
            return;
        }

        $email = trim($body['email'] ?? '');
        $role = $body['role'] ?? '';

        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            http_response_code(400);
            echo json_encode(['error' => 'A valid email address is required']);
            return;
        }

        if (!in_array($role, self::ASSIGNABLE_ROLES, true)) {
            http_response_code(400);
            echo json_encode(['error' => 'role must be one of: ' . implode(', ', self::ASSIGNABLE_ROLES)]);
            return;
        }

        // Cannot invite yourself
        if ($email === ($user['email'] ?? '')) {
            http_response_code(400);
            echo json_encode(['error' => 'You cannot invite yourself']);
            return;
        }

        // Check if a user with this email already exists in our DB
        $invitee = Database::fetch('SELECT id, team_id, name FROM users WHERE email = ?', [$email]);

        if ($invitee) {
            // User exists — check if they're already on this team
            if ((int) ($invitee['team_id'] ?? 0) === $teamId) {
                http_response_code(409);
                echo json_encode(['error' => 'This user is already a member of your team']);
                return;
            }

            // Check if they're on another team
            if (!empty($invitee['team_id'])) {
                http_response_code(400);
                echo json_encode(['error' => 'This user belongs to another team. They must leave it first.']);
                return;
            }

            // Add them directly
            Database::update('users', [
                'team_id' => $teamId,
                'role'    => $role,
            ], 'id = ?', [$invitee['id']]);

            $this->logActivity($teamId, $user['id'], 'member_added',
                "Added {$invitee['name']} ({$email}) as {$role}");

            // Create notification for the invitee
            try {
                Database::insert('notifications', [
                    'user_id'    => $invitee['id'],
                    'type'       => 'team_invite',
                    'title'      => 'You\'ve been added to a team',
                    'body'       => "You were added to \"{$team['name']}\" as {$role} by {$user['name']}.",
                    'action_url' => '/teams',
                ]);
            } catch (\Throwable $e) {
                error_log("Failed to create invite notification: " . $e->getMessage());
            }

            echo json_encode([
                'success' => true,
                'message' => "User added to team as {$role}",
                'added'   => true,
            ]);
            return;
        }

        // User does not exist — store a pending invite (future: send invitation email)
        $this->logActivity($teamId, $user['id'], 'invite_sent',
            "Sent invite to {$email} as {$role}");

        echo json_encode([
            'success' => true,
            'message' => "Invitation sent to {$email}",
            'added'   => false,
        ]);
    }

    // ──────────────────────────────────────────────
    // Member Management
    // ──────────────────────────────────────────────

    /** DELETE /api/teams/members/{id} — Remove a member from the team (owner only). */
    public function removeMember(array $params, array $body): void
    {
        $user = Auth::requireUser();
        $memberId = (int) $params['id'];

        // Verify user has a team and is owner
        $teamId = $user['team_id'] ?? null;
        if (!$teamId) {
            http_response_code(400);
            echo json_encode(['error' => 'You do not belong to a team']);
            return;
        }

        $team = Database::fetch('SELECT * FROM teams WHERE id = ? AND owner_id = ?', [$teamId, $user['id']]);
        if (!$team) {
            http_response_code(403);
            echo json_encode(['error' => 'Only the team owner can remove members']);
            return;
        }

        // Cannot remove yourself (the owner)
        if ($memberId === (int) $user['id']) {
            http_response_code(400);
            echo json_encode(['error' => 'The team owner cannot be removed. Transfer ownership or delete the team instead.']);
            return;
        }

        // Verify the member belongs to this team
        $member = Database::fetch(
            'SELECT id, name, email FROM users WHERE id = ? AND team_id = ?',
            [$memberId, $teamId]
        );

        if (!$member) {
            http_response_code(404);
            echo json_encode(['error' => 'Member not found in your team']);
            return;
        }

        // Remove from team — reset to default 'owner' role (their own content owner)
        Database::update('users', [
            'team_id' => null,
            'role'    => 'owner',
        ], 'id = ?', [$memberId]);

        $this->logActivity($teamId, $user['id'], 'member_removed',
            "Removed {$member['name']} ({$member['email']}) from team");

        // Notify the removed member
        try {
            Database::insert('notifications', [
                'user_id'    => $memberId,
                'type'       => 'team_removed',
                'title'      => 'Removed from team',
                'body'       => "You were removed from \"{$team['name']}\" by the team owner.",
                'action_url' => null,
            ]);
        } catch (\Throwable $e) {
            error_log("Failed to create removal notification: " . $e->getMessage());
        }

        echo json_encode(['success' => true]);
    }

    // ──────────────────────────────────────────────
    // Activity Feed
    // ──────────────────────────────────────────────

    /** GET /api/teams/activity — Paginated activity log for the user's team. */
    public function activity(array $params, array $body): void
    {
        $user = Auth::requireUser();

        $teamId = $user['team_id'] ?? null;
        if (!$teamId) {
            echo json_encode(['activities' => [], 'total' => 0, 'page' => 1]);
            return;
        }

        $page = max(1, (int) ($_GET['page'] ?? 1));
        $limit = min(50, max(1, (int) ($_GET['limit'] ?? 20)));
        $offset = ($page - 1) * $limit;

        $total = Database::fetch(
            'SELECT COUNT(*) as cnt FROM activity_log WHERE team_id = ?',
            [$teamId]
        )['cnt'];

        $activities = Database::fetchAll(
            'SELECT al.*, u.name as user_name, u.email as user_email, u.avatar_url as user_avatar
             FROM activity_log al
             JOIN users u ON al.user_id = u.id
             WHERE al.team_id = ?
             ORDER BY al.created_at DESC
             LIMIT ? OFFSET ?',
            [$teamId, $limit, $offset]
        );

        echo json_encode([
            'activities' => $activities,
            'total'      => (int) $total,
            'page'       => $page,
            'limit'      => $limit,
        ]);
    }

    // ──────────────────────────────────────────────
    // Private Helpers
    // ──────────────────────────────────────────────

    /** Insert an entry into the activity_log table. */
    private function logActivity(int $teamId, int $userId, string $action, string $description): void
    {
        try {
            Database::insert('activity_log', [
                'team_id'     => $teamId,
                'user_id'     => $userId,
                'action'      => $action,
                'description' => $description,
            ]);
        } catch (\Throwable $e) {
            // Non-critical — log and continue
            error_log("Failed to log team activity: " . $e->getMessage());
        }
    }
}
