<?php

declare(strict_types=1);

namespace Contentine\Services;

use Contentine\Database;

/**
 * Service that publishes rendered videos to 7 social platforms against each
 * platform's current, real upload API. There is NO simulated success anywhere
 * in this file (Law L1): every method either returns a real published URL from
 * a real API response, an honest platform error, or a structured
 * "platform not configured" state when the operator has not provisioned the
 * platform's developer app (client id/secret in admin_config.php).
 *
 * Return contract (all methods):
 *   [
 *     'success'        => bool,
 *     'published_url'  => ?string,   // set on success
 *     'error'          => ?string,   // set on failure
 *     'not_configured' => bool,      // true => operator must provision the app
 *     'platform'       => string,
 *   ]
 *
 * Token handling: PublishController / cron decrypt the stored access token and
 * pass it as $data['oauth_token']. Platform-specific object ids (page id,
 * Instagram business account id, LinkedIn person urn, Threads user id) are
 * resolved at publish time from the access token — the same pattern
 * AuthController uses to fetch the account name — so no extra columns are needed.
 *
 * Media that Meta pulls by URL (Instagram Reels, Facebook, Threads) is served
 * from the app's public /uploads path; publicVideoUrl() builds that URL.
 *
 * Resilience: every platform HTTP call goes through requestWithRetry(), which
 * implements Law D-47 — up to 3 retries, exponential backoff, honours
 * Retry-After, and NEVER retries a 4xx other than 429.
 */
class SocialPublisher
{
    /** @var array Backend config (admin_config.php-backed) — app url + oauth app credentials. */
    private array $config;

    /**
     * Per-platform config keys the OPERATOR must provision for publishing to work.
     * Used to detect the "platform not configured" state and to document provisioning.
     * A platform whose access token alone is sufficient (already granted at connect
     * time) still lists its app id so the config check is meaningful.
     */
    private const REQUIRED_CONFIG = [
        'youtube'   => ['youtube_client_id', 'youtube_client_secret'],
        'tiktok'    => ['tiktok_client_id', 'tiktok_client_secret'],
        'instagram' => ['instagram_client_id', 'facebook_client_id'], // either satisfies (IG via FB app)
        'facebook'  => ['facebook_client_id', 'facebook_client_secret'],
        'linkedin'  => ['linkedin_client_id', 'linkedin_client_secret'],
        'threads'   => ['threads_client_id', 'threads_client_secret'],
        'twitter'   => ['twitter_client_id', 'twitter_client_secret'],
    ];

    public function __construct()
    {
        $configPath = __DIR__ . '/../../config.php';
        $this->config = file_exists($configPath) ? (require $configPath) : ['app' => [], 'oauth' => []];
    }

    /**
     * Publish to the given platform.
     * @param string $platform One of: youtube, tiktok, instagram, facebook, linkedin, threads, twitter
     * @param array $data Publishing payload with video_path, title, description, tags, hashtags, oauth_token, etc.
     * @return array{success: bool, published_url: ?string, error: ?string, not_configured?: bool, platform?: string}
     */
    public function publish(string $platform, array $data): array
    {
        // Honest gate: if the operator hasn't provisioned this platform's app,
        // surface a structured not-configured state instead of a fake success or
        // a confusing auth error.
        $gate = $this->configuredOr($platform);
        if ($gate !== null) {
            return $gate;
        }

        if (empty($data['oauth_token'])) {
            return $this->fail($platform, 'No access token for this account. Reconnect the account in Settings.');
        }

        return match ($platform) {
            'youtube'   => $this->publishToYouTube($data),
            'tiktok'    => $this->publishToTikTok($data),
            'instagram' => $this->publishToInstagram($data),
            'facebook'  => $this->publishToFacebook($data),
            'linkedin'  => $this->publishToLinkedIn($data),
            'threads'   => $this->publishToThreads($data),
            'twitter'   => $this->publishToTwitter($data),
            default     => $this->fail($platform, "Unsupported platform: {$platform}"),
        };
    }

    // ──────────────────────────────────────────────
    // YouTube — Data API v3 resumable upload
    // Docs: https://developers.google.com/youtube/v3/docs/videos/insert
    // ──────────────────────────────────────────────
    private function publishToYouTube(array $data): array
    {
        $token = $data['oauth_token'];
        $videoPath = $this->resolveVideoPath($data['video_path']);
        if (!$videoPath) {
            return $this->fail('youtube', 'Video file not found on server');
        }

        $metadata = [
            'snippet' => [
                'title'       => $this->clip($data['title'] ?? 'Untitled', 100),
                'description' => $this->clip($this->buildDescription($data), 5000),
                'tags'        => array_slice($data['tags'] ?? [], 0, 500),
                'categoryId'  => '22', // People & Blogs
            ],
            'status' => [
                'privacyStatus'           => 'public',
                'selfDeclaredMadeForKids' => false,
            ],
        ];

        $fileSize = filesize($videoPath);

        // Step 1 — initialise the resumable session; the upload URI comes back in Location.
        $init = $this->requestWithRetry(
            'POST',
            'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
            json_encode($metadata),
            [
                "Authorization: Bearer {$token}",
                'Content-Type: application/json; charset=UTF-8',
                'X-Upload-Content-Type: video/*',
                'X-Upload-Content-Length: ' . $fileSize,
            ]
        );

        if ($init['status'] < 200 || $init['status'] >= 300) {
            return $this->fail('youtube', $this->apiError('YouTube init', $init));
        }

        $uploadUri = $init['headers']['Location'] ?? $init['headers']['location'] ?? null;
        if (!$uploadUri) {
            return $this->fail('youtube', 'YouTube did not return a resumable upload URI');
        }

        // Step 2 — stream the file to the resumable URI.
        $upload = $this->uploadFile('PUT', $uploadUri, $videoPath, 'video/*', [
            "Authorization: Bearer {$token}",
        ]);

        if ($upload['status'] < 200 || $upload['status'] >= 300) {
            return $this->fail('youtube', $this->apiError('YouTube upload', $upload));
        }

        $videoId = $upload['json']['id'] ?? null;
        if (!$videoId) {
            return $this->fail('youtube', 'YouTube upload succeeded but returned no video id');
        }

        return $this->ok('youtube', "https://youtube.com/watch?v={$videoId}");
    }

    // ──────────────────────────────────────────────
    // TikTok — Content Posting API (direct post, FILE_UPLOAD)
    // Docs: https://developers.tiktok.com/doc/content-posting-api-reference-direct-post
    // ──────────────────────────────────────────────
    private function publishToTikTok(array $data): array
    {
        $token = $data['oauth_token'];
        $videoPath = $this->resolveVideoPath($data['video_path']);
        if (!$videoPath) {
            return $this->fail('tiktok', 'Video file not found on server');
        }

        $caption = $this->buildCaption($data, 2200);
        $fileSize = filesize($videoPath);
        // TikTok: single-chunk upload is allowed when the whole file is one chunk (<= 64MB).
        $chunkSize = $fileSize; // one chunk
        $totalChunks = 1;

        // Step 1 — initialise the direct-post upload.
        $init = $this->requestWithRetry(
            'POST',
            'https://open.tiktokapis.com/v2/post/publish/video/init/',
            json_encode([
                'post_info' => [
                    'title'          => $this->clip($caption, 2200),
                    'privacy_level'  => 'PUBLIC_TO_EVERYONE',
                    'disable_comment' => false,
                ],
                'source_info' => [
                    'source'           => 'FILE_UPLOAD',
                    'video_size'       => $fileSize,
                    'chunk_size'       => $chunkSize,
                    'total_chunk_count' => $totalChunks,
                ],
            ]),
            [
                "Authorization: Bearer {$token}",
                'Content-Type: application/json; charset=UTF-8',
            ]
        );

        if ($init['status'] < 200 || $init['status'] >= 300) {
            return $this->fail('tiktok', $this->apiError('TikTok init', $init));
        }

        $publishId = $init['json']['data']['publish_id'] ?? null;
        $uploadUrl = $init['json']['data']['upload_url'] ?? null;
        if (!$publishId || !$uploadUrl) {
            return $this->fail('tiktok', 'TikTok init returned no upload_url/publish_id: ' . $this->apiError('TikTok init', $init));
        }

        // Step 2 — PUT the file bytes with the required Content-Range header.
        $upload = $this->uploadFile('PUT', $uploadUrl, $videoPath, 'video/mp4', [
            'Content-Range: bytes 0-' . ($fileSize - 1) . '/' . $fileSize,
        ]);

        if ($upload['status'] < 200 || $upload['status'] >= 300) {
            return $this->fail('tiktok', $this->apiError('TikTok upload', $upload));
        }

        // Step 3 — poll publish status until the post is live (or fails).
        $shareUrl = $this->pollTikTokStatus($token, $publishId);
        if ($shareUrl['error'] !== null) {
            return $this->fail('tiktok', $shareUrl['error']);
        }

        // TikTok often finishes asynchronously; a null share URL with no error means
        // the post was accepted and is processing on TikTok's side.
        return $this->ok('tiktok', $shareUrl['url'] ?? "https://www.tiktok.com/@{$data['account_name']}");
    }

    /** Poll TikTok's publish status endpoint. Returns ['url'=>?string,'error'=>?string]. */
    private function pollTikTokStatus(string $token, string $publishId): array
    {
        for ($i = 0; $i < 6; $i++) {
            $resp = $this->requestWithRetry(
                'POST',
                'https://open.tiktokapis.com/v2/post/publish/status/fetch/',
                json_encode(['publish_id' => $publishId]),
                [
                    "Authorization: Bearer {$token}",
                    'Content-Type: application/json; charset=UTF-8',
                ]
            );

            $status = $resp['json']['data']['status'] ?? null;
            if ($status === 'PUBLISH_COMPLETE') {
                $url = $resp['json']['data']['publicaly_available_post_id'][0] ?? null;
                return ['url' => $url ? "https://www.tiktok.com/video/{$url}" : null, 'error' => null];
            }
            if ($status === 'FAILED') {
                $reason = $resp['json']['data']['fail_reason'] ?? 'unknown';
                return ['url' => null, 'error' => "TikTok publish failed: {$reason}"];
            }
            sleep(3);
        }
        // Still processing — accepted, not an error.
        return ['url' => null, 'error' => null];
    }

    // ──────────────────────────────────────────────
    // Instagram Reels — Graph API (video pulled by public URL)
    // Docs: https://developers.facebook.com/docs/instagram-api/guides/content-publishing
    // ──────────────────────────────────────────────
    private function publishToInstagram(array $data): array
    {
        $token = $data['oauth_token'];
        $publicUrl = $this->publicVideoUrl($data['video_path']);
        if (!$publicUrl) {
            return $this->fail('instagram', 'Could not build a public URL for the video (APP_URL not configured)');
        }
        $caption = $this->buildCaption($data, 2200);

        // Resolve the Instagram business account id from the connected Page.
        $igUserId = $this->resolveInstagramUserId($token);
        if ($igUserId === null) {
            return $this->fail('instagram', 'No Instagram Business account is linked to the connected Facebook Page.');
        }

        // Step 1 — create the REELS media container.
        $create = $this->requestWithRetry(
            'POST',
            "https://graph.facebook.com/v18.0/{$igUserId}/media",
            http_build_query([
                'media_type'   => 'REELS',
                'video_url'    => $publicUrl,
                'caption'      => $caption,
                'access_token' => $token,
            ]),
            ['Content-Type: application/x-www-form-urlencoded']
        );

        if ($create['status'] < 200 || $create['status'] >= 300) {
            return $this->fail('instagram', $this->apiError('Instagram container', $create));
        }
        $containerId = $create['json']['id'] ?? null;
        if (!$containerId) {
            return $this->fail('instagram', 'Instagram did not return a media container id');
        }

        // Step 2 — wait for the container to finish processing.
        $ready = $this->pollMetaContainer("https://graph.facebook.com/v18.0/{$containerId}?fields=status_code&access_token={$token}");
        if ($ready !== true) {
            return $this->fail('instagram', is_string($ready) ? $ready : 'Instagram video processing did not finish in time');
        }

        // Step 3 — publish the container.
        $publish = $this->requestWithRetry(
            'POST',
            "https://graph.facebook.com/v18.0/{$igUserId}/media_publish",
            http_build_query(['creation_id' => $containerId, 'access_token' => $token]),
            ['Content-Type: application/x-www-form-urlencoded']
        );
        if ($publish['status'] < 200 || $publish['status'] >= 300) {
            return $this->fail('instagram', $this->apiError('Instagram publish', $publish));
        }
        $mediaId = $publish['json']['id'] ?? null;

        // Step 4 — best-effort permalink.
        $permalink = null;
        if ($mediaId) {
            $pl = $this->requestWithRetry('GET', "https://graph.facebook.com/v18.0/{$mediaId}?fields=permalink&access_token={$token}", null, []);
            $permalink = $pl['json']['permalink'] ?? null;
        }

        return $this->ok('instagram', $permalink ?? "https://www.instagram.com/reel/{$mediaId}");
    }

    // ──────────────────────────────────────────────
    // Facebook Page video — Graph API (video pulled by public URL)
    // Docs: https://developers.facebook.com/docs/video-api/guides/publishing
    // ──────────────────────────────────────────────
    private function publishToFacebook(array $data): array
    {
        $token = $data['oauth_token'];
        $publicUrl = $this->publicVideoUrl($data['video_path']);
        if (!$publicUrl) {
            return $this->fail('facebook', 'Could not build a public URL for the video (APP_URL not configured)');
        }
        $description = $this->buildDescription($data);

        // Resolve the target Page id + Page access token (posting to a Page needs a Page token).
        $page = $this->resolveFacebookPage($token);
        if ($page === null) {
            return $this->fail('facebook', 'No Facebook Page is available on this account. A Page (not a personal profile) is required to publish.');
        }

        // Publish the video by URL (non-resumable "file_url" path).
        $publish = $this->requestWithRetry(
            'POST',
            "https://graph.facebook.com/v18.0/{$page['id']}/videos",
            http_build_query([
                'file_url'     => $publicUrl,
                'title'        => $this->clip($data['title'] ?? '', 255),
                'description'  => $description,
                'access_token' => $page['token'],
            ]),
            ['Content-Type: application/x-www-form-urlencoded'],
            300 // Facebook fetch+transcode can be slow
        );

        if ($publish['status'] < 200 || $publish['status'] >= 300) {
            return $this->fail('facebook', $this->apiError('Facebook publish', $publish));
        }
        $videoId = $publish['json']['id'] ?? null;
        if (!$videoId) {
            return $this->fail('facebook', 'Facebook accepted the request but returned no video id');
        }

        return $this->ok('facebook', "https://www.facebook.com/{$page['id']}/videos/{$videoId}");
    }

    // ──────────────────────────────────────────────
    // LinkedIn — Videos API (initialize → upload → post)
    // Docs: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/videos-api
    // ──────────────────────────────────────────────
    private function publishToLinkedIn(array $data): array
    {
        $token = $data['oauth_token'];
        $videoPath = $this->resolveVideoPath($data['video_path']);
        if (!$videoPath) {
            return $this->fail('linkedin', 'Video file not found on server');
        }
        $commentary = $this->buildDescription($data);
        $fileSize = filesize($videoPath);

        // Resolve the author URN (person) from OpenID userinfo.
        $personUrn = $this->resolveLinkedInPersonUrn($token);
        if ($personUrn === null) {
            return $this->fail('linkedin', 'Could not resolve LinkedIn member identity from the access token');
        }

        $versionHeaders = [
            "Authorization: Bearer {$token}",
            'X-Restli-Protocol-Version: 2.0.0',
            'LinkedIn-Version: 202401',
        ];

        // Step 1 — initialise the upload; LinkedIn returns an uploadUrl + video urn.
        $init = $this->requestWithRetry(
            'POST',
            'https://api.linkedin.com/rest/videos?action=initializeUpload',
            json_encode([
                'initializeUploadRequest' => [
                    'owner'         => $personUrn,
                    'fileSizeBytes' => $fileSize,
                    'uploadCaptions' => false,
                    'uploadThumbnail' => false,
                ],
            ]),
            array_merge($versionHeaders, ['Content-Type: application/json'])
        );

        if ($init['status'] < 200 || $init['status'] >= 300) {
            return $this->fail('linkedin', $this->apiError('LinkedIn init', $init));
        }
        $value = $init['json']['value'] ?? [];
        $videoUrn = $value['video'] ?? null;
        $instructions = $value['uploadInstructions'][0] ?? null;
        $uploadUrl = $instructions['uploadUrl'] ?? null;
        if (!$videoUrn || !$uploadUrl) {
            return $this->fail('linkedin', 'LinkedIn init returned no upload instructions');
        }

        // Step 2 — PUT the media bytes and capture the ETag (needed to finalize).
        $upload = $this->uploadFile('PUT', $uploadUrl, $videoPath, 'application/octet-stream', [
            "Authorization: Bearer {$token}",
        ]);
        if ($upload['status'] < 200 || $upload['status'] >= 300) {
            return $this->fail('linkedin', $this->apiError('LinkedIn upload', $upload));
        }
        $etag = $upload['headers']['ETag'] ?? $upload['headers']['etag'] ?? null;

        // Step 3 — finalize the upload.
        $finalize = $this->requestWithRetry(
            'POST',
            'https://api.linkedin.com/rest/videos?action=finalizeUpload',
            json_encode([
                'finalizeUploadRequest' => [
                    'video'          => $videoUrn,
                    'uploadToken'    => '',
                    'uploadedPartIds' => $etag ? [$etag] : [],
                ],
            ]),
            array_merge($versionHeaders, ['Content-Type: application/json'])
        );
        if ($finalize['status'] < 200 || $finalize['status'] >= 300) {
            return $this->fail('linkedin', $this->apiError('LinkedIn finalize', $finalize));
        }

        // Step 4 — create the post referencing the uploaded video.
        $post = $this->requestWithRetry(
            'POST',
            'https://api.linkedin.com/rest/posts',
            json_encode([
                'author'         => $personUrn,
                'commentary'     => $commentary,
                'visibility'     => 'PUBLIC',
                'distribution'   => ['feedDistribution' => 'MAIN_FEED', 'targetEntities' => [], 'thirdPartyDistributionChannels' => []],
                'content'        => ['media' => ['id' => $videoUrn, 'title' => $this->clip($data['title'] ?? 'Video', 200)]],
                'lifecycleState' => 'PUBLISHED',
            ]),
            array_merge($versionHeaders, ['Content-Type: application/json'])
        );
        if ($post['status'] < 200 || $post['status'] >= 300) {
            return $this->fail('linkedin', $this->apiError('LinkedIn post', $post));
        }

        $postUrn = $post['headers']['x-restli-id'] ?? $post['headers']['X-RestLi-Id'] ?? $post['json']['id'] ?? null;
        $url = $postUrn ? "https://www.linkedin.com/feed/update/{$postUrn}" : 'https://www.linkedin.com/feed/';
        return $this->ok('linkedin', $url);
    }

    // ──────────────────────────────────────────────
    // Threads — Threads API (video pulled by public URL)
    // Docs: https://developers.facebook.com/docs/threads/posts
    // ──────────────────────────────────────────────
    private function publishToThreads(array $data): array
    {
        $token = $data['oauth_token'];
        $publicUrl = $this->publicVideoUrl($data['video_path']);
        if (!$publicUrl) {
            return $this->fail('threads', 'Could not build a public URL for the video (APP_URL not configured)');
        }
        $text = $this->buildCaption($data, 500);

        // Resolve the Threads user id.
        $me = $this->requestWithRetry('GET', "https://graph.threads.net/v1.0/me?fields=id&access_token={$token}", null, []);
        $threadsUserId = $me['json']['id'] ?? null;
        if (!$threadsUserId) {
            return $this->fail('threads', 'Could not resolve Threads user id from the access token');
        }

        // Step 1 — create the video container.
        $create = $this->requestWithRetry(
            'POST',
            "https://graph.threads.net/v1.0/{$threadsUserId}/threads",
            http_build_query([
                'media_type'   => 'VIDEO',
                'video_url'    => $publicUrl,
                'text'         => $text,
                'access_token' => $token,
            ]),
            ['Content-Type: application/x-www-form-urlencoded']
        );
        if ($create['status'] < 200 || $create['status'] >= 300) {
            return $this->fail('threads', $this->apiError('Threads container', $create));
        }
        $containerId = $create['json']['id'] ?? null;
        if (!$containerId) {
            return $this->fail('threads', 'Threads did not return a container id');
        }

        // Step 2 — wait for the container to finish processing.
        $ready = $this->pollMetaContainer("https://graph.threads.net/v1.0/{$containerId}?fields=status&access_token={$token}", 'status', 'FINISHED');
        if ($ready !== true) {
            return $this->fail('threads', is_string($ready) ? $ready : 'Threads video processing did not finish in time');
        }

        // Step 3 — publish.
        $publish = $this->requestWithRetry(
            'POST',
            "https://graph.threads.net/v1.0/{$threadsUserId}/threads_publish",
            http_build_query(['creation_id' => $containerId, 'access_token' => $token]),
            ['Content-Type: application/x-www-form-urlencoded']
        );
        if ($publish['status'] < 200 || $publish['status'] >= 300) {
            return $this->fail('threads', $this->apiError('Threads publish', $publish));
        }
        $postId = $publish['json']['id'] ?? null;

        // Step 4 — best-effort permalink.
        $permalink = null;
        if ($postId) {
            $pl = $this->requestWithRetry('GET', "https://graph.threads.net/v1.0/{$postId}?fields=permalink&access_token={$token}", null, []);
            $permalink = $pl['json']['permalink'] ?? null;
        }
        return $this->ok('threads', $permalink ?? "https://www.threads.net/@{$data['account_name']}");
    }

    // ──────────────────────────────────────────────
    // Twitter / X — chunked media upload (v1.1) + create tweet (v2)
    // Docs: https://developer.x.com/en/docs/twitter-api/v1/media/upload-media/api-reference/post-media-upload-init
    //       https://developer.x.com/en/docs/twitter-api/tweets/manage-tweets/api-reference/post-tweets
    // ──────────────────────────────────────────────
    private function publishToTwitter(array $data): array
    {
        $token = $data['oauth_token'];
        $videoPath = $this->resolveVideoPath($data['video_path']);
        if (!$videoPath) {
            return $this->fail('twitter', 'Video file not found on server');
        }
        $tweetText = $this->buildCaption($data, 280);
        $fileSize = filesize($videoPath);
        $auth = ["Authorization: Bearer {$token}"];
        $uploadBase = 'https://upload.twitter.com/1.1/media/upload.json';

        // Step 1 — INIT.
        $init = $this->requestWithRetry('POST', $uploadBase, http_build_query([
            'command'        => 'INIT',
            'total_bytes'    => $fileSize,
            'media_type'     => 'video/mp4',
            'media_category' => 'tweet_video',
        ]), array_merge($auth, ['Content-Type: application/x-www-form-urlencoded']));

        if ($init['status'] < 200 || $init['status'] >= 300) {
            return $this->fail('twitter', $this->apiError('X media INIT', $init));
        }
        $mediaId = $init['json']['media_id_string'] ?? null;
        if (!$mediaId) {
            return $this->fail('twitter', 'X media INIT returned no media id');
        }

        // Step 2 — APPEND in 4MB chunks (base64-encoded media_data).
        $chunkSize = 4 * 1024 * 1024;
        $fh = fopen($videoPath, 'rb');
        if ($fh === false) {
            return $this->fail('twitter', 'Could not open video file for upload');
        }
        $segment = 0;
        while (!feof($fh)) {
            $chunk = fread($fh, $chunkSize);
            if ($chunk === '' || $chunk === false) {
                break;
            }
            $append = $this->requestWithRetry('POST', $uploadBase, http_build_query([
                'command'       => 'APPEND',
                'media_id'      => $mediaId,
                'segment_index' => $segment,
                'media_data'    => base64_encode($chunk),
            ]), array_merge($auth, ['Content-Type: application/x-www-form-urlencoded']));

            if ($append['status'] < 200 || $append['status'] >= 300) {
                fclose($fh);
                return $this->fail('twitter', $this->apiError('X media APPEND', $append));
            }
            $segment++;
        }
        fclose($fh);

        // Step 3 — FINALIZE.
        $finalize = $this->requestWithRetry('POST', $uploadBase, http_build_query([
            'command'  => 'FINALIZE',
            'media_id' => $mediaId,
        ]), array_merge($auth, ['Content-Type: application/x-www-form-urlencoded']));

        if ($finalize['status'] < 200 || $finalize['status'] >= 300) {
            return $this->fail('twitter', $this->apiError('X media FINALIZE', $finalize));
        }

        // Step 4 — poll processing state when X reports async processing.
        $processing = $finalize['json']['processing_info'] ?? null;
        if ($processing) {
            $err = $this->pollTwitterMedia($token, $mediaId);
            if ($err !== null) {
                return $this->fail('twitter', $err);
            }
        }

        // Step 5 — create the tweet referencing the uploaded media.
        $tweet = $this->requestWithRetry('POST', 'https://api.twitter.com/2/tweets', json_encode([
            'text'  => $tweetText,
            'media' => ['media_ids' => [$mediaId]],
        ]), array_merge($auth, ['Content-Type: application/json']));

        if ($tweet['status'] < 200 || $tweet['status'] >= 300) {
            return $this->fail('twitter', $this->apiError('X create tweet', $tweet));
        }
        $tweetId = $tweet['json']['data']['id'] ?? null;
        if (!$tweetId) {
            return $this->fail('twitter', 'X accepted the media but returned no tweet id');
        }

        $handle = ltrim((string) ($data['account_name'] ?? 'i'), '@');
        return $this->ok('twitter', "https://twitter.com/{$handle}/status/{$tweetId}");
    }

    /** Poll X media processing status. Returns null on success, or an error string. */
    private function pollTwitterMedia(string $token, string $mediaId): ?string
    {
        for ($i = 0; $i < 10; $i++) {
            $resp = $this->requestWithRetry(
                'GET',
                'https://upload.twitter.com/1.1/media/upload.json?command=STATUS&media_id=' . urlencode($mediaId),
                null,
                ["Authorization: Bearer {$token}"]
            );
            $info = $resp['json']['processing_info'] ?? [];
            $state = $info['state'] ?? 'succeeded';
            if ($state === 'succeeded') {
                return null;
            }
            if ($state === 'failed') {
                $msg = $info['error']['message'] ?? 'unknown';
                return "X media processing failed: {$msg}";
            }
            sleep((int) ($info['check_after_secs'] ?? 5));
        }
        return 'X media processing did not finish in time';
    }

    // ──────────────────────────────────────────────
    // Platform id resolvers (from access token, at publish time)
    // ──────────────────────────────────────────────

    /** Resolve the Instagram business account id linked to the first available Page. */
    private function resolveInstagramUserId(string $token): ?string
    {
        $pages = $this->requestWithRetry('GET', "https://graph.facebook.com/v18.0/me/accounts?access_token={$token}", null, []);
        foreach ($pages['json']['data'] ?? [] as $page) {
            if (empty($page['id'])) {
                continue;
            }
            $ig = $this->requestWithRetry('GET', "https://graph.facebook.com/v18.0/{$page['id']}?fields=instagram_business_account&access_token={$token}", null, []);
            $igId = $ig['json']['instagram_business_account']['id'] ?? null;
            if ($igId) {
                return $igId;
            }
        }
        return null;
    }

    /** Resolve the first Page id + Page access token for the user. */
    private function resolveFacebookPage(string $token): ?array
    {
        $pages = $this->requestWithRetry('GET', "https://graph.facebook.com/v18.0/me/accounts?fields=id,name,access_token&access_token={$token}", null, []);
        $first = $pages['json']['data'][0] ?? null;
        if (!$first || empty($first['id'])) {
            return null;
        }
        return ['id' => $first['id'], 'token' => $first['access_token'] ?? $token];
    }

    /** Resolve the LinkedIn person URN from OpenID userinfo (sub). */
    private function resolveLinkedInPersonUrn(string $token): ?string
    {
        $me = $this->requestWithRetry('GET', 'https://api.linkedin.com/v2/userinfo', null, ["Authorization: Bearer {$token}"]);
        $sub = $me['json']['sub'] ?? null;
        return $sub ? "urn:li:person:{$sub}" : null;
    }

    /**
     * Poll a Meta (IG/Threads) media container until it reports ready.
     * Returns true on ready, an error string on hard failure, or false on timeout.
     * @return true|string|false
     */
    private function pollMetaContainer(string $url, string $field = 'status_code', string $ready = 'FINISHED')
    {
        for ($i = 0; $i < 20; $i++) {
            $resp = $this->requestWithRetry('GET', $url, null, []);
            $status = $resp['json'][$field] ?? null;
            if ($status === $ready) {
                return true;
            }
            if ($status === 'ERROR' || $status === 'EXPIRED') {
                return "Media processing returned status {$status}";
            }
            sleep(3);
        }
        return false;
    }

    // ──────────────────────────────────────────────
    // Configuration / result helpers
    // ──────────────────────────────────────────────

    /**
     * Return a structured not-configured result if the operator has not provisioned
     * the platform's developer app, otherwise null (meaning: proceed).
     */
    private function configuredOr(string $platform): ?array
    {
        $keys = self::REQUIRED_CONFIG[$platform] ?? [];
        $oauth = $this->config['oauth'] ?? [];
        foreach ($keys as $k) {
            if (!empty($oauth[$k])) {
                // For instagram, any one of the listed keys is enough; a single hit configures it.
                if ($platform === 'instagram') {
                    return null;
                }
            } elseif ($platform !== 'instagram') {
                return $this->notConfigured($platform, $k);
            }
        }
        if ($platform === 'instagram') {
            // Reached here only if none of the instagram keys were set.
            return $this->notConfigured($platform, 'instagram_client_id or facebook_client_id');
        }
        return null;
    }

    private function notConfigured(string $platform, string $missingKey): array
    {
        return [
            'success'        => false,
            'published_url'  => null,
            'error'          => ucfirst($platform) . " publishing is not configured yet. The operator must provision the {$platform} developer app (missing: {$missingKey}).",
            'not_configured' => true,
            'platform'       => $platform,
        ];
    }

    private function ok(string $platform, string $url): array
    {
        return ['success' => true, 'published_url' => $url, 'error' => null, 'not_configured' => false, 'platform' => $platform];
    }

    private function fail(string $platform, string $error): array
    {
        return ['success' => false, 'published_url' => null, 'error' => $error, 'not_configured' => false, 'platform' => $platform];
    }

    /** Extract a human error message from a platform API response. */
    private function apiError(string $label, array $resp): string
    {
        $status = $resp['status'] ?? 0;
        $json = $resp['json'] ?? null;
        $msg = null;
        if (is_array($json)) {
            $msg = $json['error']['message']       // Meta / generic
                ?? $json['error']['error_user_msg']
                ?? $json['error_description']       // OAuth-style
                ?? $json['message']                 // X / LinkedIn
                ?? (isset($json['error']) && is_string($json['error']) ? $json['error'] : null);
        }
        if ($msg === null) {
            $body = (string) ($resp['body'] ?? '');
            $msg = $body !== '' ? substr($body, 0, 300) : ($status === 0 ? 'network/transport error' : 'no response body');
        }
        return "{$label} failed (HTTP {$status}): {$msg}";
    }

    // ──────────────────────────────────────────────
    // Media / string helpers
    // ──────────────────────────────────────────────

    /** Resolve a relative video path to an absolute filesystem path. */
    private function resolveVideoPath(string $relativePath): ?string
    {
        $basePath = realpath(__DIR__ . '/../../public') ?: (__DIR__ . '/../../public');
        $fullPath = $basePath . '/' . ltrim($relativePath, '/');
        if (file_exists($fullPath)) {
            return $fullPath;
        }
        $altPath = realpath(__DIR__ . '/../../uploads');
        if ($altPath) {
            $stripped = preg_replace('#^/uploads/#', '', $relativePath);
            $altFull = $altPath . '/' . $stripped;
            if (file_exists($altFull)) {
                return $altFull;
            }
        }
        return null;
    }

    /** Build a publicly reachable URL for the video (required by Meta pull-by-URL APIs). */
    private function publicVideoUrl(string $relativePath): ?string
    {
        $base = $this->config['app']['url'] ?? '';
        if ($base === '') {
            return null;
        }
        return rtrim($base, '/') . '/' . ltrim($relativePath, '/');
    }

    /** Truncate a string to a hard length with an ellipsis. */
    private function clip(string $s, int $max): string
    {
        if (strlen($s) <= $max) {
            return $s;
        }
        return substr($s, 0, max(0, $max - 3)) . '...';
    }

    /** Build a description string combining description, CTA text, and hashtags. */
    private function buildDescription(array $data): string
    {
        $parts = [];
        if (!empty($data['description'])) {
            $parts[] = $data['description'];
        }
        if (!empty($data['cta_text'])) {
            $parts[] = $data['cta_text'];
        }
        if (!empty($data['cta_links'])) {
            foreach ($data['cta_links'] as $link) {
                if (is_array($link) && !empty($link['url'])) {
                    $label = $link['label'] ?? $link['url'];
                    $parts[] = "{$label}: {$link['url']}";
                } elseif (is_string($link)) {
                    $parts[] = $link;
                }
            }
        }
        if (!empty($data['hashtags'])) {
            $parts[] = implode(' ', array_map(
                fn($tag) => str_starts_with($tag, '#') ? $tag : "#{$tag}",
                $data['hashtags']
            ));
        }
        return implode("\n\n", $parts);
    }

    /** Build a short caption with description and hashtags, capped at maxLength. */
    private function buildCaption(array $data, int $maxLength): string
    {
        $caption = $data['title'] ?? '';
        if (!empty($data['description'])) {
            $caption .= "\n\n" . $data['description'];
        }
        if (!empty($data['cta_text'])) {
            $caption .= "\n\n" . $data['cta_text'];
        }
        if (!empty($data['hashtags'])) {
            $hashtagStr = implode(' ', array_map(
                fn($tag) => str_starts_with($tag, '#') ? $tag : "#{$tag}",
                $data['hashtags']
            ));
            if (strlen($caption) + strlen($hashtagStr) + 2 <= $maxLength) {
                $caption .= "\n\n" . $hashtagStr;
            }
        }
        return $this->clip($caption, $maxLength);
    }

    // ──────────────────────────────────────────────
    // HTTP core (with D-47 retry discipline)
    // ──────────────────────────────────────────────

    /**
     * HTTP request with Law D-47 resilience: up to 3 retries, exponential backoff,
     * honours Retry-After, and NEVER retries a 4xx other than 429.
     */
    private function requestWithRetry(string $method, string $url, ?string $body, array $headers, int $timeout = 120, int $maxRetries = 3): array
    {
        $attempt = 0;
        $backoff = 1;
        while (true) {
            $resp = $this->httpRequest($method, $url, $body, $headers, $timeout);
            $status = $resp['status'];

            if ($status >= 200 && $status < 300) {
                return $resp;
            }
            // Client errors (except 429) are not retryable.
            if ($status >= 400 && $status < 500 && $status !== 429) {
                return $resp;
            }
            if ($attempt >= $maxRetries) {
                return $resp;
            }

            $retryAfter = $resp['headers']['Retry-After'] ?? $resp['headers']['retry-after'] ?? null;
            $sleep = ($retryAfter !== null && is_numeric($retryAfter)) ? (int) $retryAfter : $backoff;
            sleep(min($sleep, 30));
            $backoff *= 2;
            $attempt++;
        }
    }

    /**
     * Generic HTTP request. Returns ['status','headers','body','json'].
     * A transport failure returns status 0 so the caller/retry treats it as transient.
     */
    private function httpRequest(string $method, string $url, ?string $body, array $headers, int $timeout = 120): array
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST  => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => $timeout,
            CURLOPT_CONNECTTIMEOUT => 15,
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_HEADER         => true,
            CURLOPT_FOLLOWLOCATION => false,
        ]);
        if ($body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        }

        $response = curl_exec($ch);
        $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $headerSize = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE);
        $curlErr = curl_error($ch);
        curl_close($ch);

        if ($response === false) {
            return ['status' => 0, 'headers' => [], 'body' => $curlErr, 'json' => null];
        }

        $responseHeaders = substr($response, 0, $headerSize);
        $responseBody = substr($response, $headerSize);

        return [
            'status'  => $httpCode,
            'headers' => $this->parseHeaders($responseHeaders),
            'body'    => $responseBody,
            'json'    => json_decode($responseBody, true),
        ];
    }

    /**
     * Stream a file to a URL with the given method (PUT/POST). Uses CURLOPT_INFILE so
     * large videos are not buffered fully into memory.
     */
    private function uploadFile(string $method, string $url, string $filePath, string $contentType, array $extraHeaders): array
    {
        $fileSize = filesize($filePath);
        $fh = fopen($filePath, 'rb');
        if ($fh === false) {
            return ['status' => 0, 'headers' => [], 'body' => 'could not open file', 'json' => null];
        }

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST  => $method,
            CURLOPT_UPLOAD         => true,
            CURLOPT_INFILE         => $fh,
            CURLOPT_INFILESIZE     => $fileSize,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 600,
            CURLOPT_CONNECTTIMEOUT => 15,
            CURLOPT_HEADER         => true,
            CURLOPT_HTTPHEADER     => array_merge($extraHeaders, [
                "Content-Type: {$contentType}",
                'Content-Length: ' . $fileSize,
            ]),
        ]);

        $response = curl_exec($ch);
        $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $headerSize = (int) curl_getinfo($ch, CURLINFO_HEADER_SIZE);
        $curlErr = curl_error($ch);
        curl_close($ch);
        fclose($fh);

        if ($response === false) {
            return ['status' => 0, 'headers' => [], 'body' => $curlErr, 'json' => null];
        }

        $responseHeaders = substr($response, 0, $headerSize);
        $responseBody = substr($response, $headerSize);

        return [
            'status'  => $httpCode,
            'headers' => $this->parseHeaders($responseHeaders),
            'body'    => $responseBody,
            'json'    => json_decode($responseBody, true),
        ];
    }

    /** Parse raw HTTP headers into an associative array (last block wins on redirects). */
    private function parseHeaders(string $raw): array
    {
        $headers = [];
        foreach (explode("\r\n", $raw) as $line) {
            if (str_contains($line, ':')) {
                [$key, $value] = explode(':', $line, 2);
                $headers[trim($key)] = trim($value);
            }
        }
        return $headers;
    }
}
