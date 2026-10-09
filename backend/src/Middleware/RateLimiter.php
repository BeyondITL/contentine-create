<?php
declare(strict_types=1);

namespace Contentine\Middleware;

use Contentine\Database;
use Contentine\Services\EncryptionService;

/** IP-based rate limiting using MySQL. */
class RateLimiter
{
    /**
     * Check rate limit. Sends 429 and exits if exceeded.
     * @param string $identifier Usually IP address or "auth:{ip}" for auth endpoints.
     * @param int $maxRequests Maximum requests allowed in the window.
     * @param int $windowSeconds Time window in seconds.
     */
    public static function check(string $identifier, int $maxRequests = 60, int $windowSeconds = 60): void
    {
        try {
            // Count requests in window
            $count = Database::fetch(
                "SELECT COUNT(*) AS cnt FROM rate_limit_log WHERE identifier = ? AND created_at > DATE_SUB(NOW(), INTERVAL ? SECOND)",
                [$identifier, $windowSeconds]
            );

            $current = (int) ($count['cnt'] ?? 0);

            if ($current >= $maxRequests) {
                // Clean up old entries occasionally (1 in 100 chance)
                if (rand(1, 100) === 1) {
                    self::cleanup();
                }

                http_response_code(429);
                header('Retry-After: ' . $windowSeconds);
                echo json_encode([
                    'error' => 'rate_limit_exceeded',
                    'message' => 'Too many requests. Please try again later.',
                    'retry_after' => $windowSeconds,
                ]);
                exit;
            }

            // Log this request
            Database::query(
                "INSERT INTO rate_limit_log (identifier) VALUES (?)",
                [$identifier]
            );
        } catch (\Throwable $e) {
            // If rate limiting fails (e.g., table doesn't exist), allow request through
            error_log('Rate limiter error: ' . $e->getMessage());
        }
    }

    /** Apply standard rate limits based on request path. */
    public static function apply(): void
    {
        $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
        $uri = $_SERVER['REQUEST_URI'] ?? '';

        try {
            $config = EncryptionService::loadAdminConfig();
            $generalLimit = (int) ($config['RATE_LIMIT_REQUESTS_PER_MINUTE'] ?? 60);
            $authLimit = (int) ($config['RATE_LIMIT_AUTH_ATTEMPTS_PER_HOUR'] ?? 10);
        } catch (\Throwable) {
            $generalLimit = 60;
            $authLimit = 10;
        }

        // Auth endpoints: stricter limits
        if (str_contains($uri, '/api/auth/login') || str_contains($uri, '/api/auth/register')) {
            self::check("auth:{$ip}", $authLimit, 3600); // per hour
        }

        // General rate limit
        self::check("general:{$ip}", $generalLimit, 60); // per minute
    }

    /** Clean up rate limit entries older than 2 hours. */
    public static function cleanup(): void
    {
        try {
            Database::query(
                "DELETE FROM rate_limit_log WHERE created_at < DATE_SUB(NOW(), INTERVAL 2 HOUR)"
            );
        } catch (\Throwable) {
            // Non-critical
        }
    }
}
