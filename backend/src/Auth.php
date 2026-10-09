<?php

declare(strict_types=1);

namespace Contentine;

use Firebase\JWT\JWT;
use Firebase\JWT\JWK;
use Firebase\JWT\Key;

class Auth
{
    private static ?array $jwksCache = null;
    private static int $jwksCacheTime = 0;
    private const JWKS_CACHE_TTL = 3600; // 1 hour

    /**
     * Auth context for the current request when it was authenticated via an API key
     * (X-API-Key header) rather than an interactive Auth0 JWT session.
     * Shape: ['key_id' => int, 'scopes' => string[]]. Null for JWT/interactive sessions.
     */
    private static ?array $apiKeyContext = null;

    /**
     * Validate Auth0 JWT from Authorization header.
     * Returns decoded token payload or null.
     */
    public static function validateToken(): ?object
    {
        $header = $_SERVER['HTTP_AUTHORIZATION']
            ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION']
            ?? '';

        // Also check Apache's mod_rewrite passthrough
        if (empty($header) && function_exists('apache_request_headers')) {
            $headers = apache_request_headers();
            $header = $headers['Authorization'] ?? $headers['authorization'] ?? '';
        }

        if (!str_starts_with($header, 'Bearer ')) {
            return null;
        }

        $token = substr($header, 7);
        $config = require __DIR__ . '/../config.php';
        $domain = $config['auth0']['domain'];
        $audience = $config['auth0']['audience'];

        try {
            $jwks = self::getJWKS($domain);
            $keys = JWK::parseKeySet($jwks, 'RS256');

            $decoded = JWT::decode($token, $keys);

            // Verify issuer and audience
            $expectedIssuer = "https://{$domain}/";
            if ($decoded->iss !== $expectedIssuer) {
                return null;
            }
            if (is_array($decoded->aud)) {
                if (!in_array($audience, $decoded->aud)) return null;
            } else {
                if ($decoded->aud !== $audience) return null;
            }

            return $decoded;

        } catch (\Exception $e) {
            error_log("Auth0 JWT validation failed: " . $e->getMessage());
            return null;
        }
    }

    /**
     * Require authentication — returns user or sends 401.
     */
    public static function requireAuth(): object
    {
        $token = self::validateToken();
        if (!$token) {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthorized']);
            exit;
        }
        return $token;
    }

    /**
     * Get the authenticated user's database record.
     * Creates user if first login (Auth0 sync).
     */
    public static function getUser(object $token): ?array
    {
        $sub = $token->sub;
        return Database::fetch('SELECT * FROM users WHERE auth0_sub = ?', [$sub]);
    }

    /**
     * Require an INTERACTIVE (Auth0 JWT) user and return the database record.
     *
     * DENY-BY-DEFAULT for API keys: a bare requireUser() is JWT/interactive-only.
     * A valid API key is NOT admitted here — it gets a 403. The ONLY way an API key
     * reaches a handler is through requireScope(), which every API-key-reachable
     * route must call explicitly. This closes the over-privilege gap where any valid
     * key (e.g. a read-only one) could exercise near-full account authority on routes
     * that only called requireUser(). The JWT path is unchanged.
     */
    public static function requireUser(): array
    {
        // Primary: Auth0 JWT (interactive) — full access.
        $token = self::validateToken();
        if ($token) {
            $user = self::getUser($token);
            if (!$user) {
                http_response_code(403);
                echo json_encode(['error' => 'User not found. Please complete signup.']);
                exit;
            }
            self::$apiKeyContext = null; // interactive session => full access
            return $user;
        }

        // Deny-by-default: a valid API key is authenticated but NOT authorized for a
        // route that did not explicitly grant it a scope (via requireScope()).
        if (self::validateApiKey() !== null) {
            http_response_code(403);
            echo json_encode([
                'error' => 'This endpoint is not accessible with an API key. Use an interactive session, or a route that grants an API-key scope.',
                'code'  => 'api_key_scope_required',
            ]);
            exit;
        }

        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        exit;
    }

    /**
     * Resolve a presented API key (X-API-Key header) to its owning user + scopes.
     * Keys are stored as bcrypt hashes, so we narrow by the indexed key_prefix and
     * verify each candidate with password_verify (constant-time). Returns
     * ['user' => array, 'scopes' => string[], 'key_id' => int] or null.
     */
    public static function validateApiKey(): ?array
    {
        $rawKey = $_SERVER['HTTP_X_API_KEY'] ?? '';
        if ($rawKey === '' && function_exists('apache_request_headers')) {
            $headers = apache_request_headers();
            $rawKey = $headers['X-API-Key'] ?? $headers['x-api-key'] ?? '';
        }
        $rawKey = trim($rawKey);

        // Issued keys are 64-char hex with a 10-char prefix (see ApiKeyController).
        if (strlen($rawKey) < 10 || !ctype_xdigit($rawKey)) {
            return null;
        }

        $prefix = substr($rawKey, 0, 10);
        $candidates = Database::fetchAll(
            'SELECT * FROM api_keys
             WHERE key_prefix = ? AND revoked_at IS NULL
               AND (expires_at IS NULL OR expires_at > NOW())',
            [$prefix]
        );

        foreach ($candidates as $row) {
            if (password_verify($rawKey, $row['key_hash'])) {
                $user = Database::fetch('SELECT * FROM users WHERE id = ?', [$row['user_id']]);
                if (!$user) {
                    return null;
                }
                // Record usage (best-effort; must not block the request).
                try {
                    Database::update('api_keys', ['last_used_at' => date('Y-m-d H:i:s')], 'id = ?', [$row['id']]);
                } catch (\Throwable $e) {
                    error_log('api_key last_used_at update failed: ' . $e->getMessage());
                }
                $scopes = json_decode($row['scopes'] ?? '[]', true);
                return [
                    'user'   => $user,
                    'scopes' => is_array($scopes) ? $scopes : [],
                    'key_id' => (int) $row['id'],
                ];
            }
        }

        return null;
    }

    /**
     * Authenticate AND authorize for a scoped action, returning the database user.
     * This is the ONLY entry that admits an API key — call it INSTEAD of requireUser()
     * on any route API keys are meant to reach (the deny-by-default in requireUser()
     * blocks keys everywhere else).
     *
     *  - Auth0 JWT / interactive session: full access; $scope is not enforced.
     *  - API key WITH $scope: admitted; the api-key context is recorded.
     *  - API key WITHOUT $scope: 403 (missing scope).
     *  - Neither: 401.
     */
    public static function requireScope(string $scope): array
    {
        // JWT/interactive — full access, scope not required.
        $token = self::validateToken();
        if ($token) {
            $user = self::getUser($token);
            if (!$user) {
                http_response_code(403);
                echo json_encode(['error' => 'User not found. Please complete signup.']);
                exit;
            }
            self::$apiKeyContext = null;
            return $user;
        }

        // API key — must carry the required scope.
        $ctx = self::validateApiKey();
        if ($ctx) {
            if (!in_array($scope, $ctx['scopes'], true)) {
                http_response_code(403);
                echo json_encode([
                    'error'          => "API key is missing the required scope: {$scope}",
                    'required_scope' => $scope,
                ]);
                exit;
            }
            self::$apiKeyContext = ['key_id' => $ctx['key_id'], 'scopes' => $ctx['scopes']];
            return $ctx['user'];
        }

        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']);
        exit;
    }

    /** True when the current request was authenticated via an API key (not a JWT session). */
    public static function isApiKeyRequest(): bool
    {
        return self::$apiKeyContext !== null;
    }

    /**
     * Fetch and cache Auth0 JWKS.
     */
    private static function getJWKS(string $domain): array
    {
        $now = time();

        // Return cached if fresh
        if (self::$jwksCache && ($now - self::$jwksCacheTime) < self::JWKS_CACHE_TTL) {
            return self::$jwksCache;
        }

        // Check file cache
        $cacheFile = sys_get_temp_dir() . '/contentine_auth0_jwks.json';
        if (file_exists($cacheFile) && ($now - filemtime($cacheFile)) < self::JWKS_CACHE_TTL) {
            self::$jwksCache = json_decode(file_get_contents($cacheFile), true);
            self::$jwksCacheTime = filemtime($cacheFile);
            return self::$jwksCache;
        }

        // Fetch fresh
        $url = "https://{$domain}/.well-known/jwks.json";
        $json = file_get_contents($url);

        if (!$json) {
            throw new \RuntimeException("Failed to fetch JWKS from {$url}");
        }

        self::$jwksCache = json_decode($json, true);
        self::$jwksCacheTime = $now;

        // Write file cache
        file_put_contents($cacheFile, $json);

        return self::$jwksCache;
    }
}
