<?php
declare(strict_types=1);

namespace Contentine\Middleware;

/**
 * CSRF protection middleware using HMAC-SHA256 tokens.
 * Tokens are valid for 1 hour and tied to the CSRF secret in admin_config.php.
 */
class CsrfMiddleware
{
    private string $secret;

    public function __construct()
    {
        $config = \Contentine\Services\EncryptionService::loadAdminConfig();
        $this->secret = $config['CSRF_SECRET'] ?? ($config['ENCRYPTION_MASTER_KEY'] ?? 'fallback-csrf-key');
    }

    /** Generate a new CSRF token (HMAC + timestamp, valid 1 hour). */
    public function generateToken(): string
    {
        $timestamp = time();
        $nonce = bin2hex(random_bytes(16));
        $payload = "{$timestamp}:{$nonce}";
        $hmac = hash_hmac('sha256', $payload, $this->secret);
        return base64_encode("{$payload}:{$hmac}");
    }

    /** Validate a CSRF token. Returns true if valid and not expired. */
    public function validateToken(string $token): bool
    {
        if (empty($token)) return false;

        $decoded = base64_decode($token, true);
        if (!$decoded) return false;

        $parts = explode(':', $decoded);
        if (count($parts) !== 3) return false;

        [$timestamp, $nonce, $hmac] = $parts;

        // Check expiry (1 hour)
        if ((int)$timestamp < (time() - 3600)) return false;

        // Verify HMAC
        $expectedHmac = hash_hmac('sha256', "{$timestamp}:{$nonce}", $this->secret);
        return hash_equals($expectedHmac, $hmac);
    }

    /**
     * Apply CSRF validation to current request.
     * Skips GET/OPTIONS/HEAD. Skips webhook endpoints (they use signature verification).
     * Returns true if valid, false if rejected.
     */
    public static function apply(): bool
    {
        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

        // Safe methods don't need CSRF
        if (in_array($method, ['GET', 'OPTIONS', 'HEAD'], true)) {
            return true;
        }

        // Webhook endpoints use their own signature verification (Stripe)
        $uri = $_SERVER['REQUEST_URI'] ?? '';
        if (str_contains($uri, '/webhook')) {
            return true;
        }

        // OAuth callbacks are initiated by the server, not the frontend
        if (str_contains($uri, '/oauth/') && str_contains($uri, '/callback')) {
            return true;
        }

        // Programmatic API-key requests (X-API-Key) are exempt from CSRF: CSRF
        // defends cookie/session auth against forged cross-site form posts, but a
        // browser cannot silently attach a custom X-API-Key header cross-site
        // (custom headers trigger a CORS preflight). The key itself is still
        // validated by Auth::validateApiKey(), and an invalid key is rejected 401.
        if (!empty($_SERVER['HTTP_X_API_KEY'])) {
            return true;
        }

        $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
        $middleware = new self();

        if (!$middleware->validateToken($token)) {
            http_response_code(403);
            echo json_encode([
                'error' => 'Invalid or expired CSRF token',
                'code' => 'csrf_invalid',
            ]);
            return false;
        }

        return true;
    }
}
