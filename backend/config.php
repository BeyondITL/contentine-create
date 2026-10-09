<?php

declare(strict_types=1);

/**
 * App-level configuration loader.
 * Reads secrets from admin_config.php (above webroot, never in version control).
 * API keys for external services (Anthropic, OpenAI, Pexels, etc.) are stored
 * encrypted in the `system_api_keys` table and managed via ApiKeyService.
 *
 * SECURITY: No getenv() or .env reads for secrets. All secrets via admin_config.php.
 */

// Load admin_config.php — the single source of truth for server-side secrets
$adminConfig = (function (): array {
    // Production: one dir above document root
    $productionPath = dirname($_SERVER['DOCUMENT_ROOT'] ?? '/var/www/html') . '/admin_config.php';
    if (file_exists($productionPath)) {
        return require $productionPath;
    }
    // Development: in backend root
    $devPath = __DIR__ . '/admin_config.php';
    if (file_exists($devPath)) {
        return require $devPath;
    }
    // Fallback: project root
    $rootPath = __DIR__ . '/../admin_config.php';
    if (file_exists($rootPath)) {
        return require $rootPath;
    }
    // If no config found, use safe defaults (DB connection will fail, user must configure)
    return [];
})();

return [
    'app' => [
        'env'  => $adminConfig['APP_ENV'] ?? 'production',
        'url'  => $adminConfig['APP_URL'] ?? 'https://app.contentine.ai',
        'name' => 'Contentine Create',
    ],
    'db' => [
        'host' => $adminConfig['DB_HOST'] ?? 'localhost',
        'name' => $adminConfig['DB_NAME'] ?? 'contentine_create',
        'user' => $adminConfig['DB_USER'] ?? 'root',
        'pass' => $adminConfig['DB_PASS'] ?? '',
    ],
    'auth0' => [
        'domain'        => $adminConfig['AUTH0_DOMAIN'] ?? '',
        'client_id'     => $adminConfig['AUTH0_CLIENT_ID'] ?? '',
        'client_secret' => $adminConfig['AUTH0_CLIENT_SECRET'] ?? '',
        'audience'      => $adminConfig['AUTH0_AUDIENCE'] ?? 'https://api.contentine.ai',
    ],
    'stripe' => [
        'webhook_secret' => $adminConfig['STRIPE_WEBHOOK_SECRET'] ?? '',
    ],
    // Social OAuth app credentials (platform developer console registrations)
    'oauth' => [
        'youtube_client_id'      => $adminConfig['YOUTUBE_CLIENT_ID'] ?? '',
        'youtube_client_secret'  => $adminConfig['YOUTUBE_CLIENT_SECRET'] ?? '',
        'tiktok_client_id'       => $adminConfig['TIKTOK_CLIENT_ID'] ?? '',
        'tiktok_client_secret'   => $adminConfig['TIKTOK_CLIENT_SECRET'] ?? '',
        'facebook_client_id'     => $adminConfig['FACEBOOK_CLIENT_ID'] ?? '',
        'facebook_client_secret' => $adminConfig['FACEBOOK_CLIENT_SECRET'] ?? '',
        'instagram_client_id'    => $adminConfig['INSTAGRAM_CLIENT_ID'] ?? '',
        'instagram_client_secret'=> $adminConfig['INSTAGRAM_CLIENT_SECRET'] ?? '',
        'linkedin_client_id'     => $adminConfig['LINKEDIN_CLIENT_ID'] ?? '',
        'linkedin_client_secret' => $adminConfig['LINKEDIN_CLIENT_SECRET'] ?? '',
        'threads_client_id'      => $adminConfig['THREADS_CLIENT_ID'] ?? '',
        'threads_client_secret'  => $adminConfig['THREADS_CLIENT_SECRET'] ?? '',
        'twitter_client_id'      => $adminConfig['TWITTER_CLIENT_ID'] ?? '',
        'twitter_client_secret'  => $adminConfig['TWITTER_CLIENT_SECRET'] ?? '',
    ],
];
