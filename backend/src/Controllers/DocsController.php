<?php

declare(strict_types=1);

namespace Contentine\Controllers;

/** Serves the OpenAPI 3.0 specification for the Contentine Create API. */
class DocsController
{
    /** GET /api/docs — Return the full OpenAPI 3.0 JSON specification. */
    public function openapi(array $params, array $body): void
    {
        $spec = [
            'openapi' => '3.0.3',
            'info' => [
                'title'       => 'Contentine Create API',
                'description' => 'AI-powered video creation and content repurposing platform. Browser-first rendering with unlimited usage on paid plans.',
                'version'     => '2.2.0',
                'contact'     => [
                    'name' => 'Contentine Create Support',
                    'url'  => 'https://contentine.ai/support',
                ],
            ],
            'servers' => [
                [
                    'url'         => '{baseUrl}',
                    'description' => 'Contentine Create API Server',
                    'variables'   => [
                        'baseUrl' => [
                            'default'     => 'https://api.contentine.ai',
                            'description' => 'API base URL',
                        ],
                    ],
                ],
            ],
            'security' => [
                ['bearerAuth' => []],
            ],
            'components' => $this->buildComponents(),
            'paths'      => $this->buildPaths(),
            'tags'       => $this->buildTags(),
        ];

        echo json_encode($spec, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    }

    /** Build the components (schemas, security schemes) section. */
    private function buildComponents(): array
    {
        return [
            'securitySchemes' => [
                'bearerAuth' => [
                    'type'         => 'http',
                    'scheme'       => 'bearer',
                    'bearerFormat' => 'JWT',
                    'description'  => 'Auth0 JWT token. Obtain via Auth0 SPA SDK authentication flow.',
                ],
                'apiKeyAuth' => [
                    'type' => 'apiKey',
                    'in'   => 'header',
                    'name' => 'X-API-Key',
                    'description' => 'API key generated via POST /api/keys.',
                ],
            ],
            'schemas' => [
                'Error' => [
                    'type'       => 'object',
                    'properties' => [
                        'error' => ['type' => 'string', 'description' => 'Human-readable error message'],
                    ],
                    'required' => ['error'],
                ],
                'Video' => [
                    'type'       => 'object',
                    'properties' => [
                        'id'                  => ['type' => 'integer'],
                        'user_id'             => ['type' => 'integer'],
                        'project_id'          => ['type' => 'integer', 'nullable' => true],
                        'title'               => ['type' => 'string'],
                        'type'                => ['type' => 'string', 'enum' => ['faceless', 'avatar']],
                        'style_mode'          => ['type' => 'string'],
                        'script_json'         => ['type' => 'object'],
                        'art_style'           => ['type' => 'string', 'nullable' => true],
                        'voice_profile_id'    => ['type' => 'integer', 'nullable' => true],
                        'character_anchor_id' => ['type' => 'integer', 'nullable' => true],
                        'aspect_ratio'        => ['type' => 'string', 'enum' => ['9:16', '16:9', '1:1']],
                        'duration_seconds'    => ['type' => 'integer'],
                        'status'              => ['type' => 'string', 'enum' => ['draft', 'rendering', 'completed', 'published', 'failed']],
                        'mp4_path'            => ['type' => 'string', 'nullable' => true],
                        'thumbnail_path'      => ['type' => 'string', 'nullable' => true],
                        'created_at'          => ['type' => 'string', 'format' => 'date-time'],
                        'updated_at'          => ['type' => 'string', 'format' => 'date-time'],
                    ],
                ],
                'StockItem' => [
                    'type'       => 'object',
                    'properties' => [
                        'id'           => ['type' => 'string'],
                        'source'       => ['type' => 'string', 'enum' => ['pexels', 'pixabay', 'freesound']],
                        'type'         => ['type' => 'string', 'enum' => ['photo', 'video', 'audio']],
                        'title'        => ['type' => 'string'],
                        'preview_url'  => ['type' => 'string', 'format' => 'uri'],
                        'download_url' => ['type' => 'string', 'format' => 'uri'],
                        'attribution'  => ['type' => 'string'],
                    ],
                ],
                'ApiKey' => [
                    'type'       => 'object',
                    'properties' => [
                        'id'           => ['type' => 'integer'],
                        'name'         => ['type' => 'string'],
                        'key_prefix'   => ['type' => 'string', 'description' => 'First 10 characters of the key'],
                        'scopes'       => ['type' => 'array', 'items' => ['type' => 'string']],
                        'last_used_at' => ['type' => 'string', 'format' => 'date-time', 'nullable' => true],
                        'created_at'   => ['type' => 'string', 'format' => 'date-time'],
                    ],
                ],
                'Webhook' => [
                    'type'       => 'object',
                    'properties' => [
                        'id'                => ['type' => 'integer'],
                        'url'               => ['type' => 'string', 'format' => 'uri'],
                        'events'            => ['type' => 'array', 'items' => ['type' => 'string']],
                        'is_active'         => ['type' => 'boolean'],
                        'last_triggered_at' => ['type' => 'string', 'format' => 'date-time', 'nullable' => true],
                        'last_status_code'  => ['type' => 'integer', 'nullable' => true],
                        'created_at'        => ['type' => 'string', 'format' => 'date-time'],
                    ],
                ],
                'RemixProject' => [
                    'type'       => 'object',
                    'properties' => [
                        'id'                  => ['type' => 'integer'],
                        'user_id'             => ['type' => 'integer'],
                        'name'                => ['type' => 'string'],
                        'custom_instructions' => ['type' => 'string', 'nullable' => true],
                        'target_platforms'    => ['type' => 'array', 'items' => ['type' => 'string']],
                        'status'              => ['type' => 'string', 'enum' => ['draft', 'generated', 'published']],
                        'created_at'          => ['type' => 'string', 'format' => 'date-time'],
                    ],
                ],
                'Notification' => [
                    'type'       => 'object',
                    'properties' => [
                        'id'         => ['type' => 'integer'],
                        'type'       => ['type' => 'string'],
                        'title'      => ['type' => 'string'],
                        'body'       => ['type' => 'string', 'nullable' => true],
                        'is_read'    => ['type' => 'boolean'],
                        'created_at' => ['type' => 'string', 'format' => 'date-time'],
                    ],
                ],
                'Pagination' => [
                    'type'       => 'object',
                    'properties' => [
                        'total' => ['type' => 'integer'],
                        'page'  => ['type' => 'integer'],
                        'limit' => ['type' => 'integer'],
                    ],
                ],
            ],
        ];
    }

    /** Build the tags for grouping endpoints. */
    private function buildTags(): array
    {
        return [
            ['name' => 'Authentication',  'description' => 'Auth0-based registration, login, and token management'],
            ['name' => 'Videos',           'description' => 'Video CRUD, upload, and comments'],
            ['name' => 'Scripts',          'description' => 'AI script generation via Claude Sonnet'],
            ['name' => 'Images',           'description' => 'AI image generation via DALL-E 3'],
            ['name' => 'Avatars',          'description' => 'Avatar presets and real clone requests'],
            ['name' => 'Characters',       'description' => 'Character anchor management'],
            ['name' => 'Voices',           'description' => 'Voice profile management'],
            ['name' => 'Content Remix',    'description' => 'Content extraction and multi-platform repurposing'],
            ['name' => 'Stock Media',      'description' => 'Search Pexels, Pixabay, and Freesound stock libraries'],
            ['name' => 'Publishing',       'description' => 'Direct publish to social platforms'],
            ['name' => 'Scheduling',       'description' => 'Schedule posts, calendar view, and CTA templates'],
            ['name' => 'Ideas',            'description' => 'Topic discovery and favourites'],
            ['name' => 'AI Writer',        'description' => 'AI-generated blog posts, captions, emails, and more'],
            ['name' => 'Analytics',        'description' => 'Performance metrics, alerts, and consistency tracking'],
            ['name' => 'Notifications',    'description' => 'In-app notification management and polling'],
            ['name' => 'Teams',            'description' => 'Team creation, member management, and activity feed'],
            ['name' => 'Thumbnails',       'description' => 'AI thumbnail generation'],
            ['name' => 'Assets',           'description' => 'User asset library (images, videos, audio)'],
            ['name' => 'API Keys',         'description' => 'Programmatic API key management'],
            ['name' => 'Webhooks',         'description' => 'Event webhook subscriptions and testing'],
            ['name' => 'Payments',         'description' => 'Stripe checkout, portal, and plan management'],
            ['name' => 'User',             'description' => 'User profile, settings, and onboarding'],
            ['name' => 'Documentation',    'description' => 'API documentation'],
        ];
    }

    /** Build all API paths. */
    private function buildPaths(): array
    {
        return [
            // ── Authentication ──
            '/api/auth/register' => [
                'post' => [
                    'tags'        => ['Authentication'],
                    'summary'     => 'Register a new user',
                    'operationId' => 'authRegister',
                    'security'    => [],
                    'requestBody' => $this->jsonBody(['email' => 'string', 'password' => 'string', 'name' => 'string']),
                    'responses'   => $this->responses(201, 'User registered'),
                ],
            ],
            '/api/auth/login' => [
                'post' => [
                    'tags'        => ['Authentication'],
                    'summary'     => 'Authenticate and receive JWT',
                    'operationId' => 'authLogin',
                    'security'    => [],
                    'requestBody' => $this->jsonBody(['email' => 'string', 'password' => 'string']),
                    'responses'   => $this->responses(200, 'JWT token returned'),
                ],
            ],
            '/api/auth/sync' => [
                'post' => [
                    'tags'        => ['Authentication'],
                    'summary'     => 'Sync Auth0 user to local database',
                    'operationId' => 'authSync',
                    'responses'   => $this->responses(200, 'User synced'),
                ],
            ],

            // ── Videos ──
            '/api/videos' => [
                'get' => [
                    'tags'        => ['Videos'],
                    'summary'     => 'List user videos',
                    'operationId' => 'listVideos',
                    'parameters'  => [
                        $this->queryParam('page', 'integer', 'Page number'),
                        $this->queryParam('limit', 'integer', 'Items per page (max 50)'),
                        $this->queryParam('status', 'string', 'Filter by status'),
                        $this->queryParam('type', 'string', 'Filter by type (faceless, avatar)'),
                        $this->queryParam('q', 'string', 'Search by title'),
                    ],
                    'responses' => $this->responses(200, 'Paginated video list'),
                ],
                'post' => [
                    'tags'        => ['Videos'],
                    'summary'     => 'Create a new video',
                    'operationId' => 'createVideo',
                    'requestBody' => $this->jsonBody(['title' => 'string', 'type' => 'string', 'aspect_ratio' => 'string']),
                    'responses'   => $this->responses(201, 'Video created'),
                ],
            ],
            '/api/videos/{id}' => [
                'get' => [
                    'tags'        => ['Videos'],
                    'summary'     => 'Get a single video',
                    'operationId' => 'getVideo',
                    'parameters'  => [$this->pathParam('id')],
                    'responses'   => $this->responses(200, 'Video details'),
                ],
                'put' => [
                    'tags'        => ['Videos'],
                    'summary'     => 'Update a video',
                    'operationId' => 'updateVideo',
                    'parameters'  => [$this->pathParam('id')],
                    'requestBody' => $this->jsonBody(['title' => 'string', 'status' => 'string']),
                    'responses'   => $this->responses(200, 'Video updated'),
                ],
                'delete' => [
                    'tags'        => ['Videos'],
                    'summary'     => 'Delete a video',
                    'operationId' => 'deleteVideo',
                    'parameters'  => [$this->pathParam('id')],
                    'responses'   => $this->responses(200, 'Video deleted'),
                ],
            ],
            '/api/videos/{id}/upload' => [
                'post' => [
                    'tags'        => ['Videos'],
                    'summary'     => 'Upload rendered MP4 for a video',
                    'operationId' => 'uploadVideo',
                    'parameters'  => [$this->pathParam('id')],
                    'requestBody' => [
                        'content' => [
                            'multipart/form-data' => [
                                'schema' => [
                                    'type'       => 'object',
                                    'properties' => [
                                        'file' => ['type' => 'string', 'format' => 'binary'],
                                    ],
                                ],
                            ],
                        ],
                    ],
                    'responses' => $this->responses(200, 'File uploaded'),
                ],
            ],

            // ── Scripts ──
            '/api/scripts/generate' => [
                'post' => [
                    'tags'        => ['Scripts'],
                    'summary'     => 'Generate a video script with AI',
                    'operationId' => 'generateScript',
                    'requestBody' => $this->jsonBody(['topic' => 'string', 'tone' => 'string', 'duration_target' => 'integer']),
                    'responses'   => $this->responses(200, 'Generated script JSON'),
                ],
            ],

            // ── Images ──
            '/api/images/generate' => [
                'post' => [
                    'tags'        => ['Images'],
                    'summary'     => 'Generate an image with DALL-E 3',
                    'operationId' => 'generateImage',
                    'requestBody' => $this->jsonBody(['prompt' => 'string', 'size' => 'string', 'style' => 'string']),
                    'responses'   => $this->responses(200, 'Generated image URL'),
                ],
            ],

            // ── Avatars ──
            '/api/avatars/presets' => [
                'get' => [
                    'tags'        => ['Avatars'],
                    'summary'     => 'List available avatar presets',
                    'operationId' => 'listAvatarPresets',
                    'responses'   => $this->responses(200, 'Avatar presets array'),
                ],
            ],

            // ── Content Remix ──
            '/api/remix/extract' => [
                'post' => [
                    'tags'        => ['Content Remix'],
                    'summary'     => 'Extract content from URL, YouTube, TikTok, or text',
                    'operationId' => 'remixExtract',
                    'requestBody' => $this->jsonBody(['source_type' => 'string', 'source_url' => 'string', 'text' => 'string']),
                    'responses'   => $this->responses(200, 'Extracted text content'),
                ],
            ],
            '/api/remix/generate' => [
                'post' => [
                    'tags'        => ['Content Remix'],
                    'summary'     => 'Generate multi-platform remix outputs from extracted content',
                    'operationId' => 'remixGenerate',
                    'requestBody' => $this->jsonBody(['remix_project_id' => 'integer', 'target_platforms' => 'array']),
                    'responses'   => $this->responses(200, 'Generated remix outputs'),
                ],
            ],
            '/api/remix/projects' => [
                'get' => [
                    'tags'        => ['Content Remix'],
                    'summary'     => 'List remix projects',
                    'operationId' => 'listRemixProjects',
                    'responses'   => $this->responses(200, 'Paginated remix projects'),
                ],
                'post' => [
                    'tags'        => ['Content Remix'],
                    'summary'     => 'Create a remix project',
                    'operationId' => 'createRemixProject',
                    'requestBody' => $this->jsonBody(['name' => 'string', 'target_platforms' => 'array']),
                    'responses'   => $this->responses(201, 'Remix project created'),
                ],
            ],

            // ── Stock Media ──
            '/api/stock/search' => [
                'get' => [
                    'tags'        => ['Stock Media'],
                    'summary'     => 'Search stock photos, videos, or audio',
                    'operationId' => 'searchStock',
                    'parameters'  => [
                        $this->queryParam('q', 'string', 'Search query', true),
                        $this->queryParam('type', 'string', 'Media type: photo, video, audio'),
                        $this->queryParam('source', 'string', 'Provider: pexels, pixabay, freesound'),
                        $this->queryParam('page', 'integer', 'Page number'),
                        $this->queryParam('per_page', 'integer', 'Results per page (max 80)'),
                    ],
                    'responses' => [
                        '200' => [
                            'description' => 'Stock search results',
                            'content'     => [
                                'application/json' => [
                                    'schema' => [
                                        'type'       => 'object',
                                        'properties' => [
                                            'items'  => ['type' => 'array', 'items' => ['$ref' => '#/components/schemas/StockItem']],
                                            'total'  => ['type' => 'integer'],
                                            'page'   => ['type' => 'integer'],
                                            'source' => ['type' => 'string'],
                                            'type'   => ['type' => 'string'],
                                        ],
                                    ],
                                ],
                            ],
                        ],
                        '400' => ['description' => 'Invalid parameters', 'content' => ['application/json' => ['schema' => ['$ref' => '#/components/schemas/Error']]]],
                        '401' => ['description' => 'Unauthorized'],
                        '502' => ['description' => 'Stock provider unavailable'],
                    ],
                ],
            ],
            '/api/stock/{source}/{id}/download' => [
                'get' => [
                    'tags'        => ['Stock Media'],
                    'summary'     => 'Get download URL for a stock item',
                    'operationId' => 'downloadStock',
                    'parameters'  => [
                        $this->pathParam('source', 'Stock provider (pexels, pixabay, freesound)'),
                        $this->pathParam('id', 'Stock item ID'),
                    ],
                    'responses' => $this->responses(200, 'Download URL and attribution'),
                ],
            ],

            // ── API Keys ──
            '/api/keys' => [
                'get' => [
                    'tags'        => ['API Keys'],
                    'summary'     => 'List API keys (prefix and metadata only)',
                    'operationId' => 'listApiKeys',
                    'responses'   => [
                        '200' => [
                            'description' => 'List of API keys',
                            'content'     => [
                                'application/json' => [
                                    'schema' => [
                                        'type'       => 'object',
                                        'properties' => [
                                            'keys' => ['type' => 'array', 'items' => ['$ref' => '#/components/schemas/ApiKey']],
                                        ],
                                    ],
                                ],
                            ],
                        ],
                        '401' => ['description' => 'Unauthorized'],
                    ],
                ],
                'post' => [
                    'tags'        => ['API Keys'],
                    'summary'     => 'Generate a new API key (secret returned once)',
                    'operationId' => 'createApiKey',
                    'requestBody' => $this->jsonBody(['name' => 'string', 'scopes' => 'array']),
                    'responses'   => $this->responses(201, 'API key created with secret'),
                ],
            ],
            '/api/keys/{id}' => [
                'delete' => [
                    'tags'        => ['API Keys'],
                    'summary'     => 'Revoke an API key',
                    'operationId' => 'revokeApiKey',
                    'parameters'  => [$this->pathParam('id')],
                    'responses'   => $this->responses(200, 'API key revoked'),
                ],
            ],

            // ── Webhooks ──
            '/api/webhooks' => [
                'get' => [
                    'tags'        => ['Webhooks'],
                    'summary'     => 'List webhooks',
                    'operationId' => 'listWebhooks',
                    'responses'   => [
                        '200' => [
                            'description' => 'List of webhooks and valid events',
                            'content'     => [
                                'application/json' => [
                                    'schema' => [
                                        'type'       => 'object',
                                        'properties' => [
                                            'webhooks'     => ['type' => 'array', 'items' => ['$ref' => '#/components/schemas/Webhook']],
                                            'valid_events' => ['type' => 'array', 'items' => ['type' => 'string']],
                                        ],
                                    ],
                                ],
                            ],
                        ],
                        '401' => ['description' => 'Unauthorized'],
                    ],
                ],
                'post' => [
                    'tags'        => ['Webhooks'],
                    'summary'     => 'Create a webhook (signing secret returned once)',
                    'operationId' => 'createWebhook',
                    'requestBody' => $this->jsonBody(['url' => 'string', 'events' => 'array']),
                    'responses'   => $this->responses(201, 'Webhook created with HMAC secret'),
                ],
            ],
            '/api/webhooks/{id}' => [
                'put' => [
                    'tags'        => ['Webhooks'],
                    'summary'     => 'Update a webhook',
                    'operationId' => 'updateWebhook',
                    'parameters'  => [$this->pathParam('id')],
                    'requestBody' => $this->jsonBody(['url' => 'string', 'events' => 'array', 'is_active' => 'boolean']),
                    'responses'   => $this->responses(200, 'Webhook updated'),
                ],
                'delete' => [
                    'tags'        => ['Webhooks'],
                    'summary'     => 'Delete a webhook',
                    'operationId' => 'deleteWebhook',
                    'parameters'  => [$this->pathParam('id')],
                    'responses'   => $this->responses(200, 'Webhook deleted'),
                ],
            ],
            '/api/webhooks/{id}/test' => [
                'post' => [
                    'tags'        => ['Webhooks'],
                    'summary'     => 'Send a test ping to the webhook URL',
                    'operationId' => 'testWebhook',
                    'parameters'  => [$this->pathParam('id')],
                    'responses'   => [
                        '200' => [
                            'description' => 'Test delivery result',
                            'content'     => [
                                'application/json' => [
                                    'schema' => [
                                        'type'       => 'object',
                                        'properties' => [
                                            'success'       => ['type' => 'boolean'],
                                            'status_code'   => ['type' => 'integer', 'nullable' => true],
                                            'response_time' => ['type' => 'integer', 'description' => 'Response time in milliseconds'],
                                            'error'         => ['type' => 'string', 'nullable' => true],
                                        ],
                                    ],
                                ],
                            ],
                        ],
                        '401' => ['description' => 'Unauthorized'],
                        '404' => ['description' => 'Webhook not found'],
                    ],
                ],
            ],

            '/api/webhooks/{id}/deliveries' => [
                'get' => [
                    'tags'        => ['Webhooks'],
                    'summary'     => 'List recent delivery attempts for a webhook',
                    'operationId' => 'listWebhookDeliveries',
                    'parameters'  => [$this->pathParam('id')],
                    'responses'   => $this->responses(200, 'Delivery log (event, status, attempts, response_code, timestamps)'),
                ],
            ],

            // ── Publishing ──
            '/api/publish/{platform}' => [
                'post' => [
                    'tags'        => ['Publishing'],
                    'summary'     => 'Publish a video to a social platform',
                    'operationId' => 'publishVideo',
                    'parameters'  => [$this->pathParam('platform', 'Target platform')],
                    'requestBody' => $this->jsonBody(['video_id' => 'integer', 'title' => 'string', 'description' => 'string']),
                    'responses'   => $this->responses(200, 'Published URL returned'),
                ],
            ],

            // ── Scheduling ──
            '/api/schedule' => [
                'get' => [
                    'tags'        => ['Scheduling'],
                    'summary'     => 'List scheduled posts',
                    'operationId' => 'listScheduledPosts',
                    'responses'   => $this->responses(200, 'Scheduled posts list'),
                ],
                'post' => [
                    'tags'        => ['Scheduling'],
                    'summary'     => 'Create a scheduled post',
                    'operationId' => 'createScheduledPost',
                    'requestBody' => $this->jsonBody(['video_id' => 'integer', 'platform' => 'string', 'scheduled_at' => 'string']),
                    'responses'   => $this->responses(201, 'Scheduled post created'),
                ],
            ],
            '/api/schedule/calendar' => [
                'get' => [
                    'tags'        => ['Scheduling'],
                    'summary'     => 'Calendar view of scheduled posts',
                    'operationId' => 'scheduleCalendar',
                    'parameters'  => [
                        $this->queryParam('month', 'string', 'Month in YYYY-MM format'),
                    ],
                    'responses' => $this->responses(200, 'Calendar data'),
                ],
            ],
            '/api/schedule/bulk' => [
                'post' => [
                    'tags'        => ['Scheduling'],
                    'summary'     => 'Bulk-schedule posts from a CSV/batch (tracked as a bulk job)',
                    'operationId' => 'bulkSchedulePosts',
                    'requestBody' => [
                        'required' => true,
                        'content'  => [
                            'application/json' => [
                                'schema' => [
                                    'type'       => 'object',
                                    'properties' => [
                                        'rows' => [
                                            'type'  => 'array',
                                            'items' => [
                                                'type'       => 'object',
                                                'properties' => [
                                                    'video_id'     => ['type' => 'integer'],
                                                    'platform'     => ['type' => 'string'],
                                                    'scheduled_at' => ['type' => 'string', 'format' => 'date-time'],
                                                    'title'        => ['type' => 'string'],
                                                    'description'  => ['type' => 'string'],
                                                    'tags'         => ['type' => 'array', 'items' => ['type' => 'string']],
                                                    'hashtags'     => ['type' => 'array', 'items' => ['type' => 'string']],
                                                ],
                                            ],
                                        ],
                                    ],
                                    'required' => ['rows'],
                                ],
                            ],
                        ],
                    ],
                    'responses' => $this->responses(201, 'Bulk job created with per-row results'),
                ],
            ],
            '/api/schedule/bulk/{id}' => [
                'get' => [
                    'tags'        => ['Scheduling'],
                    'summary'     => 'Progress of a bulk schedule job',
                    'operationId' => 'bulkScheduleStatus',
                    'parameters'  => [$this->pathParam('id')],
                    'responses'   => $this->responses(200, 'Bulk job progress (total_count, completed_count, status)'),
                ],
            ],

            // ── Ideas ──
            '/api/ideas/search' => [
                'post' => [
                    'tags'        => ['Ideas'],
                    'summary'     => 'Search for content ideas across platforms',
                    'operationId' => 'searchIdeas',
                    'requestBody' => $this->jsonBody(['query' => 'string', 'platform' => 'string']),
                    'responses'   => $this->responses(200, 'Search results'),
                ],
            ],
            '/api/ideas/favourites' => [
                'get' => [
                    'tags'        => ['Ideas'],
                    'summary'     => 'List saved favourite topics',
                    'operationId' => 'listFavourites',
                    'responses'   => $this->responses(200, 'Favourite topics'),
                ],
                'post' => [
                    'tags'        => ['Ideas'],
                    'summary'     => 'Save a topic to favourites',
                    'operationId' => 'addFavourite',
                    'requestBody' => $this->jsonBody(['topic_text' => 'string', 'source_platform' => 'string']),
                    'responses'   => $this->responses(201, 'Topic saved'),
                ],
            ],

            // ── AI Writer ──
            '/api/writer/generate' => [
                'post' => [
                    'tags'        => ['AI Writer'],
                    'summary'     => 'Generate content (blog, caption, email, etc.)',
                    'operationId' => 'writerGenerate',
                    'requestBody' => $this->jsonBody(['type' => 'string', 'topic' => 'string', 'tone' => 'string']),
                    'responses'   => $this->responses(200, 'Generated content'),
                ],
            ],
            '/api/writer/documents' => [
                'get' => [
                    'tags'        => ['AI Writer'],
                    'summary'     => 'List generated documents',
                    'operationId' => 'listDocuments',
                    'responses'   => $this->responses(200, 'Documents list'),
                ],
            ],

            // ── Analytics ──
            '/api/analytics' => [
                'get' => [
                    'tags'        => ['Analytics'],
                    'summary'     => 'Get analytics dashboard data',
                    'operationId' => 'getAnalytics',
                    'parameters'  => [
                        $this->queryParam('period', 'string', 'Time period: 7d, 30d, 90d'),
                    ],
                    'responses' => $this->responses(200, 'Analytics data'),
                ],
            ],
            '/api/analytics/consistency' => [
                'get' => [
                    'tags'        => ['Analytics'],
                    'summary'     => 'Get content consistency tracking data',
                    'operationId' => 'getConsistency',
                    'responses'   => $this->responses(200, 'Consistency streak and history'),
                ],
            ],

            // ── Notifications ──
            '/api/notifications' => [
                'get' => [
                    'tags'        => ['Notifications'],
                    'summary'     => 'List notifications',
                    'operationId' => 'listNotifications',
                    'parameters'  => [
                        $this->queryParam('page', 'integer', 'Page number'),
                        $this->queryParam('unread_only', 'boolean', 'Filter unread only'),
                    ],
                    'responses' => $this->responses(200, 'Paginated notifications'),
                ],
            ],
            '/api/notifications/poll' => [
                'get' => [
                    'tags'        => ['Notifications'],
                    'summary'     => 'Poll for new notifications since timestamp',
                    'operationId' => 'pollNotifications',
                    'parameters'  => [
                        $this->queryParam('since', 'string', 'ISO timestamp or Unix epoch'),
                    ],
                    'responses' => $this->responses(200, 'New notifications since timestamp'),
                ],
            ],

            // ── Teams ──
            '/api/teams' => [
                'get' => [
                    'tags'        => ['Teams'],
                    'summary'     => 'Get team info and members',
                    'operationId' => 'getTeam',
                    'responses'   => $this->responses(200, 'Team and members'),
                ],
                'post' => [
                    'tags'        => ['Teams'],
                    'summary'     => 'Create a new team (business/enterprise only)',
                    'operationId' => 'createTeam',
                    'requestBody' => $this->jsonBody(['name' => 'string']),
                    'responses'   => $this->responses(201, 'Team created'),
                ],
            ],

            // ── Thumbnails ──
            '/api/thumbnails/generate' => [
                'post' => [
                    'tags'        => ['Thumbnails'],
                    'summary'     => 'Generate a thumbnail image with AI',
                    'operationId' => 'generateThumbnail',
                    'requestBody' => $this->jsonBody(['prompt' => 'string', 'video_id' => 'integer']),
                    'responses'   => $this->responses(200, 'Generated thumbnail'),
                ],
            ],

            // ── User ──
            '/api/user/profile' => [
                'get' => [
                    'tags'        => ['User'],
                    'summary'     => 'Get current user profile',
                    'operationId' => 'getProfile',
                    'responses'   => $this->responses(200, 'User profile data'),
                ],
                'put' => [
                    'tags'        => ['User'],
                    'summary'     => 'Update user profile',
                    'operationId' => 'updateProfile',
                    'requestBody' => $this->jsonBody(['name' => 'string', 'timezone' => 'string']),
                    'responses'   => $this->responses(200, 'Profile updated'),
                ],
            ],

            // ── Payments ──
            '/api/stripe/plans' => [
                'get' => [
                    'tags'        => ['Payments'],
                    'summary'     => 'List available subscription plans',
                    'operationId' => 'listPlans',
                    'security'    => [],
                    'responses'   => $this->responses(200, 'Plans array'),
                ],
            ],
            '/api/stripe/checkout' => [
                'post' => [
                    'tags'        => ['Payments'],
                    'summary'     => 'Create a Stripe Checkout session',
                    'operationId' => 'createCheckout',
                    'requestBody' => $this->jsonBody(['plan' => 'string']),
                    'responses'   => $this->responses(200, 'Checkout session URL'),
                ],
            ],

            // ── Documentation ──
            '/api/docs' => [
                'get' => [
                    'tags'        => ['Documentation'],
                    'summary'     => 'Get OpenAPI 3.0 specification',
                    'operationId' => 'getOpenApiSpec',
                    'security'    => [],
                    'responses'   => $this->responses(200, 'OpenAPI 3.0 JSON'),
                ],
            ],
        ];
    }

    // ──────────────────────────────────────────────
    // Helper Methods
    // ──────────────────────────────────────────────

    /** Build a standard JSON request body schema from field-type pairs. */
    private function jsonBody(array $fields): array
    {
        $properties = [];
        foreach ($fields as $name => $type) {
            $properties[$name] = ['type' => $type];
        }

        return [
            'required' => true,
            'content'  => [
                'application/json' => [
                    'schema' => [
                        'type'       => 'object',
                        'properties' => $properties,
                    ],
                ],
            ],
        ];
    }

    /** Build standard success + error responses. */
    private function responses(int $successCode, string $description): array
    {
        return [
            (string) $successCode => ['description' => $description],
            '400' => ['description' => 'Bad request',    'content' => ['application/json' => ['schema' => ['$ref' => '#/components/schemas/Error']]]],
            '401' => ['description' => 'Unauthorized',   'content' => ['application/json' => ['schema' => ['$ref' => '#/components/schemas/Error']]]],
            '404' => ['description' => 'Not found',      'content' => ['application/json' => ['schema' => ['$ref' => '#/components/schemas/Error']]]],
            '500' => ['description' => 'Internal error',  'content' => ['application/json' => ['schema' => ['$ref' => '#/components/schemas/Error']]]],
        ];
    }

    /** Build a path parameter definition. */
    private function pathParam(string $name, string $description = ''): array
    {
        return [
            'name'        => $name,
            'in'          => 'path',
            'required'    => true,
            'schema'      => ['type' => 'string'],
            'description' => $description ?: "Resource {$name}",
        ];
    }

    /** Build a query parameter definition. */
    private function queryParam(string $name, string $type, string $description, bool $required = false): array
    {
        return [
            'name'        => $name,
            'in'          => 'query',
            'required'    => $required,
            'schema'      => ['type' => $type],
            'description' => $description,
        ];
    }
}
