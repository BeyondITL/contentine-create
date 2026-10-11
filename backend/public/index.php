<?php
/**
 * Contentine Create — API Entry Point
 * All requests to /api/* are routed here via .htaccess
 */

declare(strict_types=1);
error_reporting(E_ALL);

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/../src/Router.php';
require_once __DIR__ . '/../src/Database.php';
require_once __DIR__ . '/../src/Auth.php';

// Load config from admin_config.php (not .env — secrets never in environment)
$config = require __DIR__ . '/../config.php';

// Security headers
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('X-XSS-Protection: 1; mode=block');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('Permissions-Policy: camera=(), microphone=(self), geolocation=()');
header('Strict-Transport-Security: max-age=31536000; includeSubDomains');

// CORS — APP_URL from admin_config.php
header('Access-Control-Allow-Origin: ' . ($config['app']['url'] ?? '*'));
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-CSRF-Token');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Rate limiting
require_once __DIR__ . '/../src/Middleware/RateLimiter.php';
\Contentine\Middleware\RateLimiter::apply();

// CSRF protection for mutating requests
require_once __DIR__ . '/../src/Middleware/CsrfMiddleware.php';
if (!\Contentine\Middleware\CsrfMiddleware::apply()) {
    exit; // 403 already sent
}

// Route
$router = new \Contentine\Router();

// Auth
$router->post('/api/auth/register',     'AuthController@register');
$router->post('/api/auth/login',        'AuthController@login');
$router->post('/api/auth/refresh',      'AuthController@refresh');
$router->post('/api/auth/sync',         'AuthController@sync');
$router->get('/api/auth/csrf-token',                  'AuthController@csrfToken');
$router->get('/api/auth/oauth/{platform}',          'AuthController@oauthRedirect');
$router->get('/api/auth/oauth/{platform}/callback',  'AuthController@oauthCallback');

// Videos
$router->get('/api/videos',            'VideoController@index');
$router->post('/api/videos',           'VideoController@store');
$router->get('/api/videos/{id}',       'VideoController@show');
$router->put('/api/videos/{id}',       'VideoController@update');
$router->delete('/api/videos/{id}',    'VideoController@destroy');
$router->post('/api/videos/{id}/upload', 'VideoController@upload');
$router->get('/api/videos/{id}/comments',  'VideoController@comments');
$router->post('/api/videos/{id}/comments', 'VideoController@addComment');

// Avatars
$router->get('/api/avatars/presets',    'AvatarController@presets');
$router->post('/api/avatars/real-clone', 'AvatarController@realClone');

// Pro Avatar — D-ID API (v2.2 Audit Fix)
$router->post('/api/avatar/pro/generate',   'ProAvatarController@generate');
$router->get('/api/avatar/pro/status/{id}',  'ProAvatarController@status');
$router->get('/api/avatar/pro/available',    'ProAvatarController@available');

// Characters & Voices
$router->resource('/api/characters',    'CharacterController');
$router->resource('/api/voices',        'VoiceController');

// Social Accounts
$router->get('/api/social-accounts',       'ScheduleController@socialAccounts');
$router->delete('/api/social-accounts/{id}', 'ScheduleController@disconnectSocial');

// Schedule — calendar/bulk must come BEFORE resource (which creates /api/schedule/{id})
$router->get('/api/schedule/calendar',  'ScheduleController@calendar');
$router->post('/api/schedule/bulk',     'ScheduleController@bulkStore');
$router->get('/api/schedule/bulk/{id}', 'ScheduleController@bulkStatus');

// Schedule & CTA
$router->resource('/api/schedule',      'ScheduleController');
$router->resource('/api/cta-templates', 'ScheduleController', 'ctaTemplates');

// Ideas
$router->post('/api/ideas/search',      'IdeaController@search');
$router->get('/api/ideas/favourites',   'IdeaController@favourites');
$router->post('/api/ideas/favourites',  'IdeaController@addFavourite');
$router->delete('/api/ideas/favourites/{id}', 'IdeaController@removeFavourite');

// Analytics
$router->get('/api/analytics',          'AnalyticsController@index');
$router->resource('/api/analytics/alerts', 'AnalyticsController', 'alerts');
$router->get('/api/analytics/export',   'AnalyticsController@export');

// Notifications
$router->get('/api/notifications',      'NotificationController@index');
$router->put('/api/notifications/mark-all-read', 'NotificationController@markAllRead');
$router->put('/api/notifications/{id}', 'NotificationController@markRead');
$router->get('/api/notifications/poll', 'NotificationController@poll');

// Publishing
$router->post('/api/publish/{platform}', 'PublishController@publish');

// Thumbnails
$router->post('/api/thumbnails/generate', 'ThumbnailController@generate');
$router->get('/api/thumbnails',           'ThumbnailController@index');
$router->delete('/api/thumbnails/{id}',   'ThumbnailController@destroy');

// Generation proxies
$router->post('/api/scripts/generate',   'ScriptController@generate');
$router->post('/api/images/generate',    'ImageController@generate');
$router->post('/api/writer/generate',    'WriterController@generate');
$router->get('/api/writer/documents',    'WriterController@index');
$router->get('/api/writer/documents/{id}', 'WriterController@show');
$router->delete('/api/writer/documents/{id}', 'WriterController@destroy');

// Teams
$router->get('/api/teams',             'TeamController@index');
$router->post('/api/teams',            'TeamController@store');
$router->put('/api/teams/{id}',        'TeamController@update');
$router->post('/api/teams/invite',     'TeamController@invite');
$router->delete('/api/teams/members/{id}', 'TeamController@removeMember');
$router->get('/api/teams/activity',    'TeamController@activity');

// Assets
$router->get('/api/assets',            'AssetController@index');
$router->post('/api/assets',           'AssetController@store');
$router->delete('/api/assets/{id}',    'AssetController@destroy');

// Content Remix
$router->post('/api/remix/extract',    'RemixController@extract');
$router->post('/api/remix/generate',   'RemixController@generate');
$router->get('/api/remix/projects',    'RemixController@index');
$router->post('/api/remix/projects',   'RemixController@store');
$router->get('/api/remix/projects/{id}',    'RemixController@show');
$router->put('/api/remix/projects/{id}',    'RemixController@update');
$router->delete('/api/remix/projects/{id}', 'RemixController@destroy');
$router->post('/api/remix/projects/{id}/to-video',  'RemixController@toVideo');
$router->post('/api/remix/projects/{id}/publish',   'RemixController@publish');

// Stripe (checkout/portal require auth, webhook/plans are public)
$router->post('/api/stripe/checkout',  'StripeController@createCheckoutSession');
$router->post('/api/stripe/portal',    'StripeController@createPortalSession');
$router->post('/api/stripe/webhook',   'StripeController@webhook');
$router->get('/api/stripe/plans',      'StripeController@getPlans');

// User profile, settings & onboarding
$router->get('/api/user/profile',      'UserController@profile');
$router->put('/api/user/profile',      'UserController@updateProfile');
$router->post('/api/user/onboarding',  'UserController@completeOnboarding');
$router->delete('/api/user/account',   'UserController@deleteAccount');
$router->get('/api/user/usage',        'UserController@usage');

// Inspiration
$router->get('/api/inspiration',       'InspirationController@index');

// Stock Media (v2.2)
$router->get('/api/stock/search',              'StockController@search');
$router->get('/api/stock/proxy',               'StockController@proxy');
$router->get('/api/stock/{source}/{id}/download', 'StockController@download');

// API Keys (v2.2)
$router->get('/api/keys',                      'ApiKeyController@index');
$router->post('/api/keys',                     'ApiKeyController@store');
$router->delete('/api/keys/{id}',              'ApiKeyController@destroy');

// Webhooks (v2.2)
$router->get('/api/webhooks',                  'WebhookController@index');
$router->post('/api/webhooks',                 'WebhookController@store');
$router->put('/api/webhooks/{id}',             'WebhookController@update');
$router->delete('/api/webhooks/{id}',          'WebhookController@destroy');
$router->post('/api/webhooks/{id}/test',       'WebhookController@test');
$router->get('/api/webhooks/{id}/deliveries',  'WebhookController@deliveries');

// API Documentation (v2.2)
$router->get('/api/docs',                      'DocsController@openapi');

// Marketplace (v2.2)
$router->get('/api/marketplace',               'MarketplaceController@index');
$router->get('/api/marketplace/my-listings',   'MarketplaceController@myListings');
$router->get('/api/marketplace/my-purchases',  'MarketplaceController@myPurchases');
$router->get('/api/marketplace/connect/status', 'MarketplaceController@connectStatus');
$router->get('/api/marketplace/{id}',          'MarketplaceController@show');
$router->get('/api/marketplace/{id}/reviews',  'MarketplaceController@reviews');
$router->post('/api/marketplace',              'MarketplaceController@store');
$router->put('/api/marketplace/{id}',          'MarketplaceController@update');
$router->post('/api/marketplace/{id}/purchase', 'MarketplaceController@purchase');
$router->post('/api/marketplace/{id}/review',  'MarketplaceController@review');
$router->post('/api/marketplace/connect',      'MarketplaceController@stripeConnect');

// Consistency Tracker (v2.2)
$router->get('/api/analytics/consistency',     'AnalyticsController@consistency');

// Enterprise Leads (v2.2)
$router->post('/api/enterprise/contact',       'EnterpriseController@contact');
$router->get('/api/admin/enterprise/leads',    'EnterpriseController@leads');
$router->put('/api/admin/enterprise/leads/{id}', 'EnterpriseController@updateLead');

// Admin User Directory (R5 SA-06 / F-17)
$router->get('/api/admin/users',               'AdminUserController@index');

// Industry Prompts (v2.2)
$router->get('/api/prompts/industries',        'PromptController@industries');

// Credits — User-facing (v2.2 Hotfix)
$router->get('/api/credits/balance',           'CreditController@balance');
$router->get('/api/credits/transactions',      'CreditController@transactions');
$router->get('/api/credits/packs',             'CreditController@packs');
$router->post('/api/credits/purchase',         'CreditController@purchase');
$router->post('/api/credits/check',            'CreditController@check');
$router->post('/api/credits/deduct',           'CreditController@deduct');
$router->post('/api/credits/refund',           'CreditController@refund');

// Credits — Admin (v2.2 Hotfix)
$router->get('/api/admin/credits/features',    'AdminCreditController@features');
$router->put('/api/admin/credits/features/{key}', 'AdminCreditController@updateFeature');
$router->get('/api/admin/credits/packs',       'AdminCreditController@packs');
$router->post('/api/admin/credits/packs',      'AdminCreditController@createPack');
$router->put('/api/admin/credits/packs/{id}',  'AdminCreditController@updatePack');
$router->delete('/api/admin/credits/packs/{id}', 'AdminCreditController@deletePack');
$router->post('/api/admin/credits/grant',      'AdminCreditController@grantCredits');
$router->get('/api/admin/credits/stats',       'AdminCreditController@stats');

// Real Clone Studio — admin review queue (SA-12/F-35)
$router->get('/api/admin/real-clone',              'RealCloneController@queue');
$router->post('/api/admin/real-clone/{id}/status', 'RealCloneController@updateStatus');

// Admin System API Keys (v2.2 Hotfix)
$router->get('/api/admin/keys/services',           'AdminKeyController@services');
$router->get('/api/admin/keys/{service}',          'AdminKeyController@keysForService');
$router->post('/api/admin/keys/{service}',         'AdminKeyController@addKey');
$router->put('/api/admin/keys/key/{id}',           'AdminKeyController@updateKey');
$router->post('/api/admin/keys/key/{id}/rotate',   'AdminKeyController@rotateKey');
$router->delete('/api/admin/keys/key/{id}',        'AdminKeyController@deleteKey');
$router->get('/api/admin/keys/{service}/usage',    'AdminKeyController@usage');

// Auth Role (v2.2 Hotfix)
$router->get('/api/auth/role',                 'AuthController@role');

// User BYOK Keys (v2.2 HOTFIX_2 — Three-Tier AI Provider)
$router->get('/api/user/keys',                 'UserKeyController@list');
$router->post('/api/user/keys',                'UserKeyController@add');
$router->delete('/api/user/keys/{service}',    'UserKeyController@remove');
$router->get('/api/user/keys/test/{service}',  'UserKeyController@test');

// AI Provider Resolution (v2.2 HOTFIX_2)
$router->get('/api/ai/providers/{feature_key}', 'AiProviderController@available');

// Health probe (WS-8 task #1 — C-M1 gate requirement)
$router->get('/api/health', 'HealthController@check');

// Dispatch
$router->dispatch($_SERVER['REQUEST_METHOD'], $_SERVER['REQUEST_URI']);
