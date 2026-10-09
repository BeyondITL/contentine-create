<?php

declare(strict_types=1);

namespace Contentine\Controllers;

use Contentine\Auth;
use Contentine\Database;
use Contentine\Services\EncryptionService;

class AuthController
{
    /** Config from admin_config.php (no getenv). */
    private array $config;
    private EncryptionService $encryption;

    public function __construct()
    {
        $this->config = require __DIR__ . '/../../config.php';
        $this->encryption = new EncryptionService();
    }
    /**
     * POST /api/auth/sync
     * Called by frontend after Auth0 login. Creates or updates user record.
     * Body: { auth0_sub, email, name }
     */
    public function sync(array $params, array $body): void
    {
        $token = Auth::requireAuth();

        $sub = $body['auth0_sub'] ?? $token->sub ?? null;
        $email = $body['email'] ?? '';
        $name = $body['name'] ?? null;

        if (!$sub || !$email) {
            http_response_code(400);
            echo json_encode(['error' => 'auth0_sub and email are required']);
            return;
        }

        // Check existing user
        $user = Database::fetch('SELECT * FROM users WHERE auth0_sub = ?', [$sub]);

        if ($user) {
            // Update last login info
            Database::update('users', [
                'email' => $email,
                'name' => $name ?? $user['name'],
            ], 'auth0_sub = ?', [$sub]);

            $user = Database::fetch('SELECT * FROM users WHERE auth0_sub = ?', [$sub]);
        } else {
            // Create new user with 7-day free trial
            $trialEnd = date('Y-m-d H:i:s', strtotime('+7 days'));

            $id = Database::insert('users', [
                'auth0_sub' => $sub,
                'email' => $email,
                'name' => $name,
                'plan_tier' => 'free',
                'timezone' => 'UTC',
                'role' => 'owner',
                'trial_ends_at' => $trialEnd,
            ]);

            $user = Database::fetch('SELECT * FROM users WHERE id = ?', [$id]);
        }

        // Remove sensitive fields
        unset($user['password_hash']);

        echo json_encode(['user' => $user]);
    }

    /**
     * POST /api/auth/register — Legacy (Auth0 handles this now)
     */
    public function register(array $params, array $body): void
    {
        http_response_code(301);
        echo json_encode(['error' => 'Use Auth0 for registration', 'redirect' => '/auth/login']);
    }

    /**
     * POST /api/auth/login — Legacy (Auth0 handles this now)
     */
    public function login(array $params, array $body): void
    {
        http_response_code(301);
        echo json_encode(['error' => 'Use Auth0 for login', 'redirect' => '/auth/login']);
    }

    /**
     * POST /api/auth/refresh — Legacy (Auth0 handles token refresh)
     */
    public function refresh(array $params, array $body): void
    {
        http_response_code(301);
        echo json_encode(['error' => 'Use Auth0 SDK for token refresh']);
    }

    /** GET /api/auth/role — Return user role (admin or user) based on admin_config.php. */
    public function role(array $params, array $body): void
    {
        $user = Auth::requireUser();
        $isAdmin = \Contentine\Middleware\AdminMiddleware::isAdmin($user['email'] ?? '');
        echo json_encode(['role' => $isAdmin ? 'admin' : 'user']);
    }

    /** GET /api/auth/csrf-token — Generate a CSRF token for the frontend. */
    public function csrfToken(array $params, array $body): void
    {
        $middleware = new \Contentine\Middleware\CsrfMiddleware();
        echo json_encode(['token' => $middleware->generateToken()]);
    }

    /** Valid platforms for social publishing OAuth. */
    private const SOCIAL_PLATFORMS = ['youtube', 'tiktok', 'instagram', 'facebook', 'linkedin', 'threads', 'twitter'];

    /**
     * GET /api/auth/oauth/{platform} — Initiate OAuth flow for a social publishing account.
     * This is SEPARATE from Auth0 — it connects platform accounts for video publishing.
     * Returns { auth_url } which the frontend opens via window.open().
     */
    public function oauthRedirect(array $params, array $body): void
    {
        $user = Auth::requireUser();
        $platform = $params['platform'] ?? '';

        if (!in_array($platform, self::SOCIAL_PLATFORMS, true)) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid platform. Must be one of: ' . implode(', ', self::SOCIAL_PLATFORMS)]);
            return;
        }

        // Generate CSRF state token with user ID, platform, and expiry
        $state = $this->generateOAuthState($user['id'], $platform);

        // Store state for verification on callback
        $this->storeOAuthState($state, $user['id'], $platform);

        $callbackUrl = ($this->config['app']['url']) . "/api/auth/oauth/{$platform}/callback";

        $authUrl = match ($platform) {
            'youtube' => $this->buildYouTubeAuthUrl($callbackUrl, $state),
            'tiktok' => $this->buildTikTokAuthUrl($callbackUrl, $state),
            'instagram' => $this->buildInstagramAuthUrl($callbackUrl, $state),
            'facebook' => $this->buildFacebookAuthUrl($callbackUrl, $state),
            'linkedin' => $this->buildLinkedInAuthUrl($callbackUrl, $state),
            'threads' => $this->buildThreadsAuthUrl($callbackUrl, $state),
            'twitter' => $this->buildTwitterAuthUrl($callbackUrl, $state),
            default => null,
        };

        if (!$authUrl) {
            http_response_code(500);
            echo json_encode(['error' => "OAuth not configured for {$platform}"]);
            return;
        }

        echo json_encode(['auth_url' => $authUrl, 'platform' => $platform]);
    }

    /**
     * GET /api/auth/oauth/{platform}/callback — Handle OAuth callback from social platform.
     * Exchanges code for tokens, stores in social_accounts, and sends postMessage to opener.
     */
    public function oauthCallback(array $params, array $body): void
    {
        $platform = $params['platform'] ?? '';

        if (!in_array($platform, self::SOCIAL_PLATFORMS, true)) {
            $this->renderOAuthResult($platform, false, 'Invalid platform');
            return;
        }

        $code = $_GET['code'] ?? '';
        $state = $_GET['state'] ?? '';
        $error = $_GET['error'] ?? '';

        // Handle user denial
        if ($error) {
            $errorDesc = $_GET['error_description'] ?? 'Authorization was denied';
            $this->renderOAuthResult($platform, false, $errorDesc);
            return;
        }

        if (!$code || !$state) {
            $this->renderOAuthResult($platform, false, 'Missing authorization code or state');
            return;
        }

        // Validate CSRF state
        $stateData = $this->validateOAuthState($state);
        if (!$stateData) {
            $this->renderOAuthResult($platform, false, 'Invalid or expired state token. Please try again.');
            return;
        }

        $userId = $stateData['user_id'];
        $callbackUrl = ($this->config['app']['url']) . "/api/auth/oauth/{$platform}/callback";

        // Exchange code for tokens
        try {
            $tokens = $this->exchangeCodeForTokens($platform, $code, $callbackUrl);

            if (!$tokens || empty($tokens['access_token'])) {
                $this->renderOAuthResult($platform, false, 'Failed to obtain access token from ' . $platform);
                return;
            }

            // Get account name/info from platform API
            $accountName = $this->fetchAccountName($platform, $tokens['access_token']);

            // Calculate token expiry
            $expiresAt = null;
            if (!empty($tokens['expires_in'])) {
                $expiresAt = date('Y-m-d H:i:s', time() + (int) $tokens['expires_in']);
            }

            // Upsert into social_accounts (UNIQUE KEY on user_id + platform)
            $existing = Database::fetch(
                'SELECT id FROM social_accounts WHERE user_id = ? AND platform = ?',
                [$userId, $platform]
            );

            // Encrypt tokens before storage (AES-256-GCM)
            $encAccess = $this->encryption->encrypt($tokens['access_token']);
            $encRefresh = null;
            if (!empty($tokens['refresh_token'])) {
                $encRefresh = $this->encryption->encrypt($tokens['refresh_token']);
            }

            $tokenData = [
                'account_name' => $accountName,
                'encrypted_access_token' => $encAccess['encrypted'],
                'access_token_iv' => $encAccess['iv'],
                'access_token_tag' => $encAccess['tag'],
                'encrypted_refresh_token' => $encRefresh ? $encRefresh['encrypted'] : null,
                'refresh_token_iv' => $encRefresh ? $encRefresh['iv'] : null,
                'refresh_token_tag' => $encRefresh ? $encRefresh['tag'] : null,
                'token_expires_at' => $expiresAt,
            ];

            if ($existing) {
                Database::update('social_accounts', $tokenData, 'id = ?', [$existing['id']]);
            } else {
                Database::insert('social_accounts', array_merge([
                    'user_id' => $userId,
                    'platform' => $platform,
                ], $tokenData));
            }

            // Clean up used state
            $this->clearOAuthState($state);

            $this->renderOAuthResult($platform, true, null, $accountName);
        } catch (\Throwable $e) {
            error_log("OAuth callback error for {$platform}: " . $e->getMessage());
            $this->renderOAuthResult($platform, false, 'Connection failed: ' . $e->getMessage());
        }
    }

    // ──────────────────────────────────────────────
    // OAuth URL Builders (per platform)
    // ──────────────────────────────────────────────
    //
    // NOTE: OAuth app credentials (client_id, client_secret) are loaded from
    // admin_config.php via $this->config — NOT from ApiKeyService. This is intentional because:
    //   1. They are app-registration credentials tied to platform developer
    //      consoles (Google, Meta, TikTok, etc.), not per-request API keys.
    //   2. They always come in pairs (client_id + client_secret) and never
    //      rotate independently or need usage tracking.
    //   3. ApiKeyService is designed for single rotatable API keys with
    //      rate-limit tracking and automatic failover — a poor fit for
    //      static OAuth app credentials.
    //

    /** Build YouTube (Google) OAuth2 authorization URL. */
    private function buildYouTubeAuthUrl(string $redirectUri, string $state): ?string
    {
        $clientId = $this->config['oauth']['youtube_client_id'];
        if (!$clientId) return null;

        return 'https://accounts.google.com/o/oauth2/v2/auth?' . http_build_query([
            'client_id' => $clientId,
            'redirect_uri' => $redirectUri,
            'response_type' => 'code',
            'scope' => 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube',
            'access_type' => 'offline',
            'prompt' => 'consent',
            'state' => $state,
        ]);
    }

    /** Build TikTok OAuth2 authorization URL. */
    private function buildTikTokAuthUrl(string $redirectUri, string $state): ?string
    {
        $clientKey = $this->config['oauth']['tiktok_client_id'];
        if (!$clientKey) return null;

        return 'https://www.tiktok.com/v2/auth/authorize/?' . http_build_query([
            'client_key' => $clientKey,
            'response_type' => 'code',
            'scope' => 'video.publish,video.upload,user.info.basic',
            'redirect_uri' => $redirectUri,
            'state' => $state,
        ]);
    }

    /** Build Instagram (via Facebook) OAuth2 authorization URL. */
    private function buildInstagramAuthUrl(string $redirectUri, string $state): ?string
    {
        $clientId = $this->config['oauth']['instagram_client_id'] ?: $this->config['oauth']['facebook_client_id'];
        if (!$clientId) return null;

        return 'https://www.facebook.com/v18.0/dialog/oauth?' . http_build_query([
            'client_id' => $clientId,
            'redirect_uri' => $redirectUri,
            'response_type' => 'code',
            'scope' => 'instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement',
            'state' => $state,
        ]);
    }

    /** Build Facebook OAuth2 authorization URL. */
    private function buildFacebookAuthUrl(string $redirectUri, string $state): ?string
    {
        $clientId = $this->config['oauth']['facebook_client_id'];
        if (!$clientId) return null;

        return 'https://www.facebook.com/v18.0/dialog/oauth?' . http_build_query([
            'client_id' => $clientId,
            'redirect_uri' => $redirectUri,
            'response_type' => 'code',
            'scope' => 'pages_manage_posts,pages_read_engagement,pages_show_list,publish_video',
            'state' => $state,
        ]);
    }

    /** Build LinkedIn OAuth2 authorization URL. */
    private function buildLinkedInAuthUrl(string $redirectUri, string $state): ?string
    {
        $clientId = $this->config['oauth']['linkedin_client_id'];
        if (!$clientId) return null;

        return 'https://www.linkedin.com/oauth/v2/authorization?' . http_build_query([
            'client_id' => $clientId,
            'redirect_uri' => $redirectUri,
            'response_type' => 'code',
            'scope' => 'openid profile w_member_social',
            'state' => $state,
        ]);
    }

    /** Build Threads (Meta) OAuth2 authorization URL. */
    private function buildThreadsAuthUrl(string $redirectUri, string $state): ?string
    {
        $clientId = $this->config['oauth']['threads_client_id'];
        if (!$clientId) return null;

        return 'https://threads.net/oauth/authorize?' . http_build_query([
            'client_id' => $clientId,
            'redirect_uri' => $redirectUri,
            'response_type' => 'code',
            'scope' => 'threads_basic,threads_content_publish',
            'state' => $state,
        ]);
    }

    /** Build Twitter/X OAuth2 authorization URL (PKCE flow). */
    private function buildTwitterAuthUrl(string $redirectUri, string $state): ?string
    {
        $clientId = $this->config['oauth']['twitter_client_id'];
        if (!$clientId) return null;

        // Twitter uses PKCE — generate code verifier and challenge
        $codeVerifier = bin2hex(random_bytes(32));
        $codeChallenge = rtrim(strtr(base64_encode(hash('sha256', $codeVerifier, true)), '+/', '-_'), '=');

        // Store code_verifier alongside state for use in token exchange
        $this->storeOAuthCodeVerifier($state, $codeVerifier);

        return 'https://twitter.com/i/oauth2/authorize?' . http_build_query([
            'client_id' => $clientId,
            'redirect_uri' => $redirectUri,
            'response_type' => 'code',
            'scope' => 'tweet.read tweet.write users.read offline.access',
            'state' => $state,
            'code_challenge' => $codeChallenge,
            'code_challenge_method' => 'S256',
        ]);
    }

    // ──────────────────────────────────────────────
    // Token Exchange (per platform)
    // ──────────────────────────────────────────────

    /** Exchange authorization code for access + refresh tokens. */
    private function exchangeCodeForTokens(string $platform, string $code, string $redirectUri): ?array
    {
        return match ($platform) {
            'youtube'   => $this->exchangeGoogleToken($code, $redirectUri),
            'tiktok'    => $this->exchangeTikTokToken($code, $redirectUri),
            'instagram' => $this->exchangeFacebookToken($code, $redirectUri, 'instagram_client_id', 'instagram_client_secret'),
            'facebook'  => $this->exchangeFacebookToken($code, $redirectUri, 'facebook_client_id', 'facebook_client_secret'),
            'linkedin'  => $this->exchangeLinkedInToken($code, $redirectUri),
            'threads'   => $this->exchangeThreadsToken($code, $redirectUri),
            'twitter'   => $this->exchangeTwitterToken($code, $redirectUri),
            default     => null,
        };
    }

    /** Exchange code for Google/YouTube tokens. */
    private function exchangeGoogleToken(string $code, string $redirectUri): ?array
    {
        $response = $this->oauthHttpPost('https://oauth2.googleapis.com/token', [
            'code' => $code,
            'client_id' => $this->config['oauth']['youtube_client_id'],
            'client_secret' => $this->config['oauth']['youtube_client_secret'],
            'redirect_uri' => $redirectUri,
            'grant_type' => 'authorization_code',
        ]);

        $data = json_decode($response, true);
        if (empty($data['access_token'])) return null;

        return [
            'access_token' => $data['access_token'],
            'refresh_token' => $data['refresh_token'] ?? null,
            'expires_in' => $data['expires_in'] ?? 3600,
        ];
    }

    /** Exchange code for TikTok tokens. */
    private function exchangeTikTokToken(string $code, string $redirectUri): ?array
    {
        $response = $this->oauthHttpPost('https://open.tiktokapis.com/v2/oauth/token/', [
            'client_key' => $this->config['oauth']['tiktok_client_id'],
            'client_secret' => $this->config['oauth']['tiktok_client_secret'],
            'code' => $code,
            'grant_type' => 'authorization_code',
            'redirect_uri' => $redirectUri,
        ]);

        $data = json_decode($response, true);
        if (empty($data['access_token'])) return null;

        return [
            'access_token' => $data['access_token'],
            'refresh_token' => $data['refresh_token'] ?? null,
            'expires_in' => $data['expires_in'] ?? 86400,
        ];
    }

    /** Exchange code for Facebook/Instagram tokens. */
    private function exchangeFacebookToken(string $code, string $redirectUri, string $clientIdKey, string $clientSecretKey): ?array
    {
        $clientId = $this->config['oauth'][$clientIdKey] ?: $this->config['oauth']['facebook_client_id'];
        $clientSecret = $this->config['oauth'][$clientSecretKey] ?: $this->config['oauth']['facebook_client_secret'];

        $url = 'https://graph.facebook.com/v18.0/oauth/access_token?' . http_build_query([
            'client_id' => $clientId,
            'client_secret' => $clientSecret,
            'redirect_uri' => $redirectUri,
            'code' => $code,
        ]);

        // Use curl instead of file_get_contents (allow_url_fopen may be disabled)
        $data = $this->curlGetJson($url);
        if (empty($data['access_token'])) return null;

        // Exchange short-lived token for long-lived token
        $longUrl = 'https://graph.facebook.com/v18.0/oauth/access_token?' . http_build_query([
            'grant_type' => 'fb_exchange_token',
            'client_id' => $clientId,
            'client_secret' => $clientSecret,
            'fb_exchange_token' => $data['access_token'],
        ]);

        // Use curl instead of file_get_contents (allow_url_fopen may be disabled)
        $longData = $this->curlGetJson($longUrl);

        return [
            'access_token' => $longData['access_token'] ?? $data['access_token'],
            'refresh_token' => null, // Facebook uses long-lived tokens instead
            'expires_in' => $longData['expires_in'] ?? $data['expires_in'] ?? 5184000, // ~60 days
        ];
    }

    /** Exchange code for LinkedIn tokens. */
    private function exchangeLinkedInToken(string $code, string $redirectUri): ?array
    {
        $response = $this->oauthHttpPost('https://www.linkedin.com/oauth/v2/accessToken', [
            'grant_type' => 'authorization_code',
            'code' => $code,
            'client_id' => $this->config['oauth']['linkedin_client_id'],
            'client_secret' => $this->config['oauth']['linkedin_client_secret'],
            'redirect_uri' => $redirectUri,
        ]);

        $data = json_decode($response, true);
        if (empty($data['access_token'])) return null;

        return [
            'access_token' => $data['access_token'],
            'refresh_token' => $data['refresh_token'] ?? null,
            'expires_in' => $data['expires_in'] ?? 5184000, // ~60 days
        ];
    }

    /** Exchange code for Threads tokens. */
    private function exchangeThreadsToken(string $code, string $redirectUri): ?array
    {
        $response = $this->oauthHttpPost('https://graph.threads.net/oauth/access_token', [
            'client_id' => $this->config['oauth']['threads_client_id'],
            'client_secret' => $this->config['oauth']['threads_client_secret'],
            'code' => $code,
            'grant_type' => 'authorization_code',
            'redirect_uri' => $redirectUri,
        ]);

        $data = json_decode($response, true);
        if (empty($data['access_token'])) return null;

        // Exchange for long-lived token (use curl instead of file_get_contents)
        $longUrl = 'https://graph.threads.net/access_token?' . http_build_query([
            'grant_type' => 'th_exchange_token',
            'client_secret' => $this->config['oauth']['threads_client_secret'],
            'access_token' => $data['access_token'],
        ]);

        $longData = $this->curlGetJson($longUrl);

        return [
            'access_token' => $longData['access_token'] ?? $data['access_token'],
            'refresh_token' => null,
            'expires_in' => $longData['expires_in'] ?? 5184000, // ~60 days
        ];
    }

    /** Exchange code for Twitter/X tokens (PKCE flow). */
    private function exchangeTwitterToken(string $code, string $redirectUri): ?array
    {
        $clientId = $this->config['oauth']['twitter_client_id'];
        $clientSecret = $this->config['oauth']['twitter_client_secret'];
        $codeVerifier = $this->getOAuthCodeVerifier($_GET['state'] ?? '');

        $ch = curl_init('https://api.twitter.com/2/oauth2/token');
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => http_build_query([
                'code' => $code,
                'grant_type' => 'authorization_code',
                'client_id' => $clientId,
                'redirect_uri' => $redirectUri,
                'code_verifier' => $codeVerifier,
            ]),
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/x-www-form-urlencoded',
                'Authorization: Basic ' . base64_encode("{$clientId}:{$clientSecret}"),
            ],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 30,
        ]);

        $response = curl_exec($ch);
        curl_close($ch);

        $data = json_decode($response, true);
        if (empty($data['access_token'])) return null;

        return [
            'access_token' => $data['access_token'],
            'refresh_token' => $data['refresh_token'] ?? null,
            'expires_in' => $data['expires_in'] ?? 7200,
        ];
    }

    // ──────────────────────────────────────────────
    // Account Name Fetchers
    // ──────────────────────────────────────────────

    /** Fetch the display name / account name from the platform's user API. */
    private function fetchAccountName(string $platform, string $accessToken): string
    {
        try {
            return match ($platform) {
                'youtube'   => $this->fetchGoogleAccountName($accessToken),
                'tiktok'    => $this->fetchTikTokAccountName($accessToken),
                'instagram' => $this->fetchInstagramAccountName($accessToken),
                'facebook'  => $this->fetchFacebookAccountName($accessToken),
                'linkedin'  => $this->fetchLinkedInAccountName($accessToken),
                'threads'   => $this->fetchThreadsAccountName($accessToken),
                'twitter'   => $this->fetchTwitterAccountName($accessToken),
                default     => 'Unknown',
            };
        } catch (\Throwable $e) {
            error_log("Failed to fetch account name for {$platform}: {$e->getMessage()}");
            return 'Connected Account';
        }
    }

    /** Fetch YouTube channel name. */
    private function fetchGoogleAccountName(string $token): string
    {
        $data = $this->oauthHttpGet('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', $token);
        return $data['items'][0]['snippet']['title'] ?? 'YouTube Channel';
    }

    /** Fetch TikTok display name. */
    private function fetchTikTokAccountName(string $token): string
    {
        $data = $this->oauthHttpGet('https://open.tiktokapis.com/v2/user/info/?fields=display_name,username', $token);
        return $data['data']['user']['display_name'] ?? $data['data']['user']['username'] ?? 'TikTok Account';
    }

    /** Fetch Instagram business account username. Uses oauthHttpGet (curl) instead of file_get_contents. */
    private function fetchInstagramAccountName(string $token): string
    {
        $pages = $this->oauthHttpGet('https://graph.facebook.com/v18.0/me/accounts', $token);
        if (!empty($pages['data'][0]['id'])) {
            $pageId = $pages['data'][0]['id'];
            $igData = $this->oauthHttpGet("https://graph.facebook.com/v18.0/{$pageId}?fields=instagram_business_account", $token);
            if (!empty($igData['instagram_business_account']['id'])) {
                $igId = $igData['instagram_business_account']['id'];
                $profile = $this->oauthHttpGet("https://graph.facebook.com/v18.0/{$igId}?fields=username", $token);
                return '@' . ($profile['username'] ?? 'instagram');
            }
        }
        return 'Instagram Account';
    }

    /** Fetch Facebook user name. Uses oauthHttpGet (curl) instead of file_get_contents. */
    private function fetchFacebookAccountName(string $token): string
    {
        $data = $this->oauthHttpGet('https://graph.facebook.com/v18.0/me?fields=name', $token);
        return $data['name'] ?? 'Facebook Account';
    }

    /** Fetch LinkedIn profile name. */
    private function fetchLinkedInAccountName(string $token): string
    {
        $data = $this->oauthHttpGet('https://api.linkedin.com/v2/userinfo', $token);
        return $data['name'] ?? trim(($data['given_name'] ?? '') . ' ' . ($data['family_name'] ?? '')) ?: 'LinkedIn Account';
    }

    /** Fetch Threads username. Uses oauthHttpGet (curl) instead of file_get_contents. */
    private function fetchThreadsAccountName(string $token): string
    {
        $data = $this->oauthHttpGet('https://graph.threads.net/v1.0/me?fields=username', $token);
        return '@' . ($data['username'] ?? 'threads');
    }

    /** Fetch Twitter/X username. */
    private function fetchTwitterAccountName(string $token): string
    {
        $data = $this->oauthHttpGet('https://api.twitter.com/2/users/me', $token);
        return '@' . ($data['data']['username'] ?? 'twitter');
    }

    // ──────────────────────────────────────────────
    // OAuth State Management (CSRF protection)
    // ──────────────────────────────────────────────

    /** Generate a random state token with user/platform metadata. */
    private function generateOAuthState(int $userId, string $platform): string
    {
        return base64_encode(json_encode([
            'user_id' => $userId,
            'platform' => $platform,
            'nonce' => bin2hex(random_bytes(16)),
            'exp' => time() + 600, // 10 minute expiry
        ]));
    }

    /** Store OAuth state in temp file for CSRF validation on callback. */
    private function storeOAuthState(string $state, int $userId, string $platform): void
    {
        $hash = hash('sha256', $state);
        $file = sys_get_temp_dir() . "/contentine_oauth_{$hash}";
        file_put_contents($file, json_encode([
            'user_id' => $userId,
            'platform' => $platform,
            'created_at' => time(),
        ]));
    }

    /** Validate OAuth state token and return metadata. */
    private function validateOAuthState(string $state): ?array
    {
        $decoded = json_decode(base64_decode($state), true);
        if (!$decoded || empty($decoded['user_id']) || empty($decoded['exp'])) {
            return null;
        }

        // Check expiry
        if ($decoded['exp'] < time()) {
            return null;
        }

        // Verify the state file exists (was created by us)
        $hash = hash('sha256', $state);
        $file = sys_get_temp_dir() . "/contentine_oauth_{$hash}";
        if (!file_exists($file)) {
            return null;
        }

        $stored = json_decode(file_get_contents($file), true);
        if (!$stored || $stored['user_id'] !== $decoded['user_id']) {
            return null;
        }

        return $decoded;
    }

    /** Remove used OAuth state file. */
    private function clearOAuthState(string $state): void
    {
        $hash = hash('sha256', $state);
        $file = sys_get_temp_dir() . "/contentine_oauth_{$hash}";
        if (file_exists($file)) {
            unlink($file);
        }
    }

    /** Store PKCE code verifier alongside state (for Twitter OAuth2). */
    private function storeOAuthCodeVerifier(string $state, string $codeVerifier): void
    {
        $hash = hash('sha256', $state);
        $file = sys_get_temp_dir() . "/contentine_pkce_{$hash}";
        file_put_contents($file, $codeVerifier);
    }

    /** Retrieve PKCE code verifier for a state token. */
    private function getOAuthCodeVerifier(string $state): string
    {
        $hash = hash('sha256', $state);
        $file = sys_get_temp_dir() . "/contentine_pkce_{$hash}";
        if (file_exists($file)) {
            $verifier = file_get_contents($file);
            unlink($file); // Clean up after use
            return $verifier;
        }
        return '';
    }

    // ──────────────────────────────────────────────
    // HTTP Helpers (OAuth-specific)
    // ──────────────────────────────────────────────

    /** POST form data and return raw response body. */
    private function oauthHttpPost(string $url, array $data): string
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => http_build_query($data),
            CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 30,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode >= 400) {
            throw new \RuntimeException("OAuth token exchange failed (HTTP {$httpCode}): {$response}");
        }

        return $response;
    }

    /** GET with Bearer token and return decoded JSON. */
    private function oauthHttpGet(string $url, string $token): array
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_HTTPHEADER => ["Authorization: Bearer {$token}"],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 15,
        ]);

        $response = curl_exec($ch);
        curl_close($ch);

        return json_decode($response, true) ?: [];
    }

    /** GET a URL (no auth header) and return decoded JSON. Replaces file_get_contents for HTTP requests. */
    private function curlGetJson(string $url): array
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_FOLLOWLOCATION => true,
        ]);

        $response = curl_exec($ch);
        curl_close($ch);

        return json_decode($response ?: '', true) ?: [];
    }

    /**
     * Render an HTML page that sends postMessage to the opener window and closes.
     * The frontend listens for this message to update the connected accounts UI.
     */
    private function renderOAuthResult(string $platform, bool $success, ?string $error = null, ?string $accountName = null): void
    {
        // Override JSON content type — this endpoint returns HTML
        header('Content-Type: text/html; charset=utf-8');

        $statusText = $success
            ? "Connected to {$platform} as {$accountName}"
            : "Failed to connect: {$error}";

        $appUrl = htmlspecialchars($this->config['app']['url'] ?? '*');
        $successJs = $success ? 'true' : 'false';
        $platformJs = addslashes($platform);
        $accountNameJs = addslashes($accountName ?? '');
        $errorJs = addslashes($error ?? '');

        echo <<<HTML
<!DOCTYPE html>
<html>
<head>
    <title>Contentine Create</title>
    <style>
        body {
            font-family: Inter, system-ui, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            background: #171717;
            color: #fff;
        }
        .container { text-align: center; padding: 2rem; }
        .status { font-size: 1.25rem; margin-bottom: 1rem; }
        .closing { color: #888; font-size: 0.875rem; }
    </style>
</head>
<body>
    <div class="container">
        <div class="status">{$statusText}</div>
        <div class="closing">This window will close automatically...</div>
    </div>
    <script>
        if (window.opener) {
            var messageData = {
                type: 'oauth-callback',
                success: {$successJs},
                platform: '{$platformJs}',
                accountName: '{$accountNameJs}',
                error: '{$errorJs}'
            };
            window.opener.postMessage(messageData, '{$appUrl}');
        }
        setTimeout(function() { window.close(); }, 1500);
    </script>
</body>
</html>
HTML;
    }
}
