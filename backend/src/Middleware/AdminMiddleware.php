<?php
declare(strict_types=1);

namespace Contentine\Middleware;

use Contentine\Services\EncryptionService;

/** Verifies authenticated user is the admin based on admin_config.php. */
class AdminMiddleware
{
    /**
     * Verify the authenticated user is the admin. Sends 403 and exits if not.
     *
     * The admin identity is derived from the AUTHENTICATED PRINCIPAL (Auth::requireUser)
     * — never from a request-controlled/absent $_SERVER value. requireUser() is
     * JWT-only (deny-by-default for API keys), so admin routes are interactive-only.
     * Fails CLOSED: if no admin email is configured, or the user has no email, deny.
     */
    public static function verify(): bool
    {
        $user = \Contentine\Auth::requireUser();

        $config = EncryptionService::loadAdminConfig();
        $adminEmail = strtolower(trim($config['ADMIN_EMAIL'] ?? ''));
        $userEmail = strtolower(trim($user['email'] ?? ''));

        if ($adminEmail === '' || $userEmail === '' || $adminEmail !== $userEmail) {
            http_response_code(403);
            echo json_encode(['error' => 'forbidden', 'message' => 'Admin access required.']);
            exit;
        }
        return true;
    }

    /** Check if a given email is admin (for frontend role detection). Fails closed. */
    public static function isAdmin(string $email): bool
    {
        try {
            $config = EncryptionService::loadAdminConfig();
            $adminEmail = strtolower(trim($config['ADMIN_EMAIL'] ?? ''));
            $email = strtolower(trim($email));
            if ($adminEmail === '' || $email === '') {
                return false;
            }
            return $adminEmail === $email;
        } catch (\Throwable) {
            return false;
        }
    }
}
