<?php

declare(strict_types=1);

namespace Contentine\Controllers;

use Contentine\Auth;
use Contentine\Database;
use Contentine\Services\ApiKeyService;

/** Proxies external stock media APIs (Pexels, Pixabay, Freesound) and normalizes results. */
class StockController
{
    private ApiKeyService $keyService;

    public function __construct()
    {
        $this->keyService = new ApiKeyService();
    }

    /** Supported sources and their media type capabilities. */
    private const SOURCE_CAPABILITIES = [
        'openverse' => ['photo'],
        'pexels'    => ['photo', 'video'],
        'pixabay'   => ['photo', 'video'],
        'freesound' => ['audio'],
    ];

    /** Cache TTL in seconds (24 hours). */
    private const CACHE_TTL = 86400;

    // ──────────────────────────────────────────────
    // Search
    // ──────────────────────────────────────────────

    /** GET /api/stock/search — Search stock media across Pexels, Pixabay, or Freesound. */
    public function search(array $params, array $body): void
    {
        Auth::requireScope('stock:search');

        $query  = trim($_GET['q'] ?? '');
        $type   = $_GET['type'] ?? 'photo';
        $source = $_GET['source'] ?? 'pexels';
        $page   = max(1, (int) ($_GET['page'] ?? 1));
        $perPage = min(80, max(1, (int) ($_GET['per_page'] ?? 20)));

        if ($query === '') {
            http_response_code(400);
            echo json_encode(['error' => 'Search query (q) is required']);
            return;
        }

        if (!in_array($type, ['photo', 'video', 'audio'], true)) {
            http_response_code(400);
            echo json_encode(['error' => 'type must be one of: photo, video, audio']);
            return;
        }

        if (!isset(self::SOURCE_CAPABILITIES[$source])) {
            http_response_code(400);
            echo json_encode(['error' => 'source must be one of: pexels, pixabay, freesound']);
            return;
        }

        if (!in_array($type, self::SOURCE_CAPABILITIES[$source], true)) {
            http_response_code(400);
            echo json_encode(['error' => "Source '{$source}' does not support type '{$type}'"]);
            return;
        }

        // Check cache first
        $cacheKey = md5("{$source}:{$type}:{$query}:{$page}:{$perPage}");
        $cached = $this->getCached($cacheKey);
        if ($cached !== null) {
            // Entries cached before the proxy existed hold RAW cross-origin URLs,
            // which COEP: require-corp blocks. Normalizing on read is idempotent and
            // repairs stale cache without a flush.
            $cached['items'] = array_map([$this, 'normalizeItem'], $cached['items'] ?? []);
            echo json_encode($cached);
            return;
        }

        // Dispatch to the appropriate provider
        try {
            $results = match ($source) {
                'openverse' => $this->searchOpenverse($query, $page, $perPage),
                'pexels'    => $this->searchPexels($query, $type, $page, $perPage),
                'pixabay'   => $this->searchPixabay($query, $type, $page, $perPage),
                'freesound' => $this->searchFreesound($query, $page, $perPage),
            };
        } catch (\Throwable $e) {
            error_log("Stock search error ({$source}): " . $e->getMessage());
            http_response_code(502);
            echo json_encode(['error' => 'Failed to fetch results from stock provider']);
            return;
        }

        // Route every media URL through the same-origin proxy so images/audio
        // survive COEP: require-corp and the export canvas stays untainted.
        $results['items'] = array_map([$this, 'normalizeItem'], $results['items'] ?? []);

        // Cache results
        $this->setCache($cacheKey, $results);

        echo json_encode($results);
    }

    // ──────────────────────────────────────────────
    // Download
    // ──────────────────────────────────────────────

    /** GET /api/stock/{source}/{id}/download — Return the download URL for a cached stock item. */
    public function download(array $params, array $body): void
    {
        Auth::requireScope('stock:search');

        $source = $params['source'] ?? '';
        $itemId = $params['id'] ?? '';

        if (!isset(self::SOURCE_CAPABILITIES[$source])) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid source']);
            return;
        }

        // Look up from cache
        $row = Database::fetch(
            'SELECT response_json FROM stock_media_cache WHERE cache_key = ?',
            [md5("item:{$source}:{$itemId}")]
        );

        if ($row) {
            $item = $this->normalizeItem(json_decode($row['response_json'], true));
            echo json_encode([
                'download_url' => $item['download_url'] ?? null,
                'attribution'  => $item['attribution'] ?? null,
            ]);
            return;
        }

        // Not cached — try to fetch the individual item from the provider
        try {
            $item = match ($source) {
                'openverse' => $this->fetchOpenverseItem($itemId),
                'pexels'    => $this->fetchPexelsItem($itemId),
                'pixabay'   => $this->fetchPixabayItem($itemId),
                'freesound' => $this->fetchFreesoundItem($itemId),
            };
        } catch (\Throwable $e) {
            error_log("Stock download lookup error ({$source}/{$itemId}): " . $e->getMessage());
            http_response_code(404);
            echo json_encode(['error' => 'Stock item not found']);
            return;
        }

        if (!$item) {
            http_response_code(404);
            echo json_encode(['error' => 'Stock item not found']);
            return;
        }

        // Cache the individual item
        $this->setCache(md5("item:{$source}:{$itemId}"), $item);

        $item = $this->normalizeItem($item);
        echo json_encode([
            'download_url' => $item['download_url'] ?? null,
            'attribution'  => $item['attribution'] ?? null,
        ]);
    }

    // ──────────────────────────────────────────────
    // Same-origin media proxy
    // ──────────────────────────────────────────────

    /**
     * GET /api/stock/proxy?url=... — Stream a remote stock asset from our own origin.
     *
     * Deliberately PUBLIC (no Auth::requireScope): <img>/<audio>/<video> tags cannot
     * send the Authorization header, so an authed proxy could never load. Safety comes
     * from SSRF hardening instead: only absolute http(s) URLs, the host must resolve to
     * a PUBLIC IP, curl is pinned to that IP (defeats DNS-rebind), redirects are off,
     * the response size is capped, and only image/* , video/* , audio/* pass through.
     *
     * Why it exists: the live origin serves `Cross-Origin-Embedder-Policy: require-corp`,
     * which blocks every cross-origin subresource lacking a CORP header (all stock CDNs).
     * Serving the bytes same-origin fixes the blank thumbnails AND keeps the WebCodecs
     * export canvas untainted.
     */
    public function proxy(array $params, array $body): void
    {
        $target = $_GET['url'] ?? '';
        if ($target === '') {
            http_response_code(400);
            echo json_encode(['error' => 'url is required']);
            return;
        }

        $parts  = parse_url($target);
        $scheme = strtolower($parts['scheme'] ?? '');
        $host   = $parts['host'] ?? '';
        if (!in_array($scheme, ['http', 'https'], true) || $host === '') {
            http_response_code(400);
            echo json_encode(['error' => 'Only absolute http(s) URLs are allowed']);
            return;
        }

        // SSRF guard — require a public IP and pin curl to it.
        $ip = $this->resolvePublicIp($host);
        if ($ip === null) {
            http_response_code(400);
            echo json_encode(['error' => 'Host is not publicly resolvable']);
            return;
        }

        $port = (int) ($parts['port'] ?? ($scheme === 'https' ? 443 : 80));

        $ch = curl_init($target);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => false,                       // no redirect-based SSRF bounce
            CURLOPT_TIMEOUT        => 20,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_USERAGENT      => 'ContentineCreate/1.0 (+stock-proxy)',
            CURLOPT_RESOLVE        => ["{$host}:{$port}:{$ip}"],   // pin DNS (anti-rebind)
            CURLOPT_MAXFILESIZE    => 25 * 1024 * 1024,
            CURLOPT_HEADER         => false,
        ]);

        $data        = curl_exec($ch);
        $httpCode    = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $contentType = (string) curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
        $err         = curl_error($ch);
        curl_close($ch);

        if ($data === false || $httpCode >= 400) {
            error_log("Stock proxy fetch failed ({$target}): HTTP {$httpCode} {$err}");
            http_response_code(502);
            echo json_encode(['error' => 'Upstream media fetch failed']);
            return;
        }

        $mime = strtolower(trim(explode(';', $contentType)[0] ?? ''));
        $isMedia = str_starts_with($mime, 'image/')
            || str_starts_with($mime, 'video/')
            || str_starts_with($mime, 'audio/');
        if (!$isMedia) {
            http_response_code(415);
            echo json_encode(['error' => 'Upstream is not an allowed media type']);
            return;
        }

        // Same-origin media response. Override the JSON Content-Type set in index.php.
        header('Content-Type: ' . ($mime ?: 'application/octet-stream'));
        header('Content-Length: ' . strlen($data));
        header('Cache-Control: public, max-age=604800, immutable');
        header('Cross-Origin-Resource-Policy: same-origin');
        header('X-Content-Type-Options: nosniff');
        echo $data;
    }

    /** Resolve a hostname to one PUBLIC IP (v4 or v6), or null if none are public. */
    private function resolvePublicIp(string $host): ?string
    {
        if (filter_var($host, FILTER_VALIDATE_IP)) {
            return $this->isPublicIp($host) ? $host : null;
        }

        $ips = [];
        $v4 = @gethostbynamel($host);
        if (is_array($v4)) {
            $ips = array_merge($ips, $v4);
        }
        $aaaa = @dns_get_record($host, DNS_AAAA);
        if (is_array($aaaa)) {
            foreach ($aaaa as $rec) {
                if (!empty($rec['ipv6'])) {
                    $ips[] = $rec['ipv6'];
                }
            }
        }

        foreach ($ips as $candidate) {
            if ($this->isPublicIp($candidate)) {
                return $candidate;
            }
        }
        return null;
    }

    /** True when an IP is a normal, routable public address. */
    private function isPublicIp(string $ip): bool
    {
        return filter_var(
            $ip,
            FILTER_VALIDATE_IP,
            FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE
        ) !== false;
    }

    /** Wrap one remote media URL so it is served through the same-origin proxy. Idempotent. */
    private function proxied(string $url): string
    {
        if ($url === '' || str_starts_with($url, '/api/stock/proxy')) {
            return $url;
        }
        if (!str_starts_with($url, 'http://') && !str_starts_with($url, 'https://')) {
            return $url; // data:, blob:, relative — leave untouched
        }
        return '/api/stock/proxy?url=' . rawurlencode($url);
    }

    /** Return a copy of a stock item with its media URLs routed through the proxy. */
    private function normalizeItem(array $item): array
    {
        if (isset($item['preview_url'])) {
            $item['preview_url'] = $this->proxied((string) $item['preview_url']);
        }
        if (isset($item['download_url'])) {
            $item['download_url'] = $this->proxied((string) $item['download_url']);
        }
        return $item;
    }

    // ──────────────────────────────────────────────
    // Provider: Pexels
    // ──────────────────────────────────────────────

    /** Search Pexels for photos or videos. */
    private function searchPexels(string $query, string $type, int $page, int $perPage): array
    {
        $keyInfo = $this->keyService->getKey('pexels');
        if (!$keyInfo) {
            throw new \RuntimeException('No active Pexels API key available');
        }
        $apiKey = $keyInfo['api_key'];

        if ($type === 'photo') {
            $url = 'https://api.pexels.com/v1/search?' . http_build_query([
                'query'    => $query,
                'page'     => $page,
                'per_page' => $perPage,
            ]);
        } else {
            $url = 'https://api.pexels.com/videos/search?' . http_build_query([
                'query'    => $query,
                'page'     => $page,
                'per_page' => $perPage,
            ]);
        }

        $response = $this->httpGet($url, ['Authorization: ' . $apiKey]);
        $data = json_decode($response, true);

        if (!$data) {
            throw new \RuntimeException('Invalid response from Pexels');
        }

        $items = [];
        if ($type === 'photo') {
            foreach ($data['photos'] ?? [] as $photo) {
                $item = [
                    'id'           => (string) $photo['id'],
                    'source'       => 'pexels',
                    'type'         => 'photo',
                    'title'        => $photo['alt'] ?? 'Pexels Photo',
                    'preview_url'  => $photo['src']['medium'] ?? $photo['src']['small'] ?? '',
                    'download_url' => $photo['src']['original'] ?? '',
                    'attribution'  => 'Photo by ' . ($photo['photographer'] ?? 'Unknown') . ' on Pexels',
                    'width'        => $photo['width'] ?? null,
                    'height'       => $photo['height'] ?? null,
                ];
                $items[] = $item;
                $this->setCache(md5("item:pexels:{$photo['id']}"), $item);
            }
            $total = $data['total_results'] ?? 0;
        } else {
            foreach ($data['videos'] ?? [] as $video) {
                $bestFile = $this->pickBestPexelsVideo($video['video_files'] ?? []);
                $item = [
                    'id'           => (string) $video['id'],
                    'source'       => 'pexels',
                    'type'         => 'video',
                    'title'        => 'Pexels Video #' . $video['id'],
                    'preview_url'  => $video['image'] ?? '',
                    'download_url' => $bestFile['link'] ?? '',
                    'attribution'  => 'Video by ' . ($video['user']['name'] ?? 'Unknown') . ' on Pexels',
                    'width'        => $bestFile['width'] ?? $video['width'] ?? null,
                    'height'       => $bestFile['height'] ?? $video['height'] ?? null,
                    'duration'     => $video['duration'] ?? null,
                ];
                $items[] = $item;
                $this->setCache(md5("item:pexels:{$video['id']}"), $item);
            }
            $total = $data['total_results'] ?? 0;
        }

        return [
            'items'  => $items,
            'total'  => (int) $total,
            'page'   => $page,
            'source' => 'pexels',
            'type'   => $type,
        ];
    }

    /** Pick the highest-quality HD video file from Pexels. */
    private function pickBestPexelsVideo(array $files): array
    {
        if (empty($files)) {
            return [];
        }

        usort($files, function ($a, $b) {
            $qualityOrder = ['hd' => 0, 'sd' => 1];
            $qa = $qualityOrder[$a['quality'] ?? 'sd'] ?? 2;
            $qb = $qualityOrder[$b['quality'] ?? 'sd'] ?? 2;
            if ($qa !== $qb) {
                return $qa - $qb;
            }
            return ($b['width'] ?? 0) - ($a['width'] ?? 0);
        });

        return $files[0];
    }

    /** Fetch a single Pexels item by ID. */
    private function fetchPexelsItem(string $itemId): ?array
    {
        $keyInfo = $this->keyService->getKey('pexels');
        if (!$keyInfo) {
            return null;
        }
        $apiKey = $keyInfo['api_key'];

        // Try photo first
        try {
            $response = $this->httpGet(
                "https://api.pexels.com/v1/photos/{$itemId}",
                ['Authorization: ' . $apiKey]
            );
            $photo = json_decode($response, true);
            if ($photo && isset($photo['id'])) {
                return [
                    'id'           => (string) $photo['id'],
                    'source'       => 'pexels',
                    'type'         => 'photo',
                    'title'        => $photo['alt'] ?? 'Pexels Photo',
                    'preview_url'  => $photo['src']['medium'] ?? '',
                    'download_url' => $photo['src']['original'] ?? '',
                    'attribution'  => 'Photo by ' . ($photo['photographer'] ?? 'Unknown') . ' on Pexels',
                ];
            }
        } catch (\Throwable) {
            // Fall through to try video
        }

        // Try video
        try {
            $response = $this->httpGet(
                "https://api.pexels.com/videos/videos/{$itemId}",
                ['Authorization: ' . $apiKey]
            );
            $video = json_decode($response, true);
            if ($video && isset($video['id'])) {
                $bestFile = $this->pickBestPexelsVideo($video['video_files'] ?? []);
                return [
                    'id'           => (string) $video['id'],
                    'source'       => 'pexels',
                    'type'         => 'video',
                    'title'        => 'Pexels Video #' . $video['id'],
                    'preview_url'  => $video['image'] ?? '',
                    'download_url' => $bestFile['link'] ?? '',
                    'attribution'  => 'Video by ' . ($video['user']['name'] ?? 'Unknown') . ' on Pexels',
                ];
            }
        } catch (\Throwable) {
            // Not found
        }

        return null;
    }

    // ──────────────────────────────────────────────
    // Provider: Pixabay
    // ──────────────────────────────────────────────

    /** Search Pixabay for photos or videos. */
    private function searchPixabay(string $query, string $type, int $page, int $perPage): array
    {
        $keyInfo = $this->keyService->getKey('pixabay');
        if (!$keyInfo) {
            throw new \RuntimeException('No active Pixabay API key available');
        }
        $apiKey = $keyInfo['api_key'];

        $baseParams = [
            'key'      => $apiKey,
            'q'        => $query,
            'page'     => $page,
            'per_page' => $perPage,
            'safesearch' => 'true',
        ];

        if ($type === 'photo') {
            $url = 'https://pixabay.com/api/?' . http_build_query($baseParams);
        } else {
            $url = 'https://pixabay.com/api/videos/?' . http_build_query($baseParams);
        }

        $response = $this->httpGet($url);
        $data = json_decode($response, true);

        if (!$data) {
            throw new \RuntimeException('Invalid response from Pixabay');
        }

        $items = [];
        $total = $data['totalHits'] ?? 0;

        if ($type === 'photo') {
            foreach ($data['hits'] ?? [] as $hit) {
                $item = [
                    'id'           => (string) $hit['id'],
                    'source'       => 'pixabay',
                    'type'         => 'photo',
                    'title'        => $hit['tags'] ?? 'Pixabay Image',
                    'preview_url'  => $hit['webformatURL'] ?? '',
                    'download_url' => $hit['largeImageURL'] ?? '',
                    'attribution'  => 'Image by ' . ($hit['user'] ?? 'Unknown') . ' on Pixabay',
                    'width'        => $hit['imageWidth'] ?? null,
                    'height'       => $hit['imageHeight'] ?? null,
                ];
                $items[] = $item;
                $this->setCache(md5("item:pixabay:{$hit['id']}"), $item);
            }
        } else {
            foreach ($data['hits'] ?? [] as $hit) {
                $bestVideo = $hit['videos']['large'] ?? $hit['videos']['medium'] ?? $hit['videos']['small'] ?? [];
                $item = [
                    'id'           => (string) $hit['id'],
                    'source'       => 'pixabay',
                    'type'         => 'video',
                    'title'        => $hit['tags'] ?? 'Pixabay Video',
                    'preview_url'  => isset($hit['picture_id']) ? "https://i.vimeocdn.com/video/{$hit['picture_id']}_640x360.jpg" : '',
                    'download_url' => $bestVideo['url'] ?? '',
                    'attribution'  => 'Video by ' . ($hit['user'] ?? 'Unknown') . ' on Pixabay',
                    'width'        => $bestVideo['width'] ?? null,
                    'height'       => $bestVideo['height'] ?? null,
                    'duration'     => $hit['duration'] ?? null,
                ];
                $items[] = $item;
                $this->setCache(md5("item:pixabay:{$hit['id']}"), $item);
            }
        }

        return [
            'items'  => $items,
            'total'  => (int) $total,
            'page'   => $page,
            'source' => 'pixabay',
            'type'   => $type,
        ];
    }

    /** Fetch a single Pixabay item by ID. */
    private function fetchPixabayItem(string $itemId): ?array
    {
        $keyInfo = $this->keyService->getKey('pixabay');
        if (!$keyInfo) {
            return null;
        }
        $apiKey = $keyInfo['api_key'];

        // Try photo
        $response = $this->httpGet('https://pixabay.com/api/?' . http_build_query([
            'key' => $apiKey,
            'id'  => $itemId,
        ]));
        $data = json_decode($response, true);

        if ($data && !empty($data['hits'])) {
            $hit = $data['hits'][0];
            return [
                'id'           => (string) $hit['id'],
                'source'       => 'pixabay',
                'type'         => 'photo',
                'title'        => $hit['tags'] ?? 'Pixabay Image',
                'preview_url'  => $hit['webformatURL'] ?? '',
                'download_url' => $hit['largeImageURL'] ?? '',
                'attribution'  => 'Image by ' . ($hit['user'] ?? 'Unknown') . ' on Pixabay',
            ];
        }

        // Try video
        $response = $this->httpGet('https://pixabay.com/api/videos/?' . http_build_query([
            'key' => $apiKey,
            'id'  => $itemId,
        ]));
        $data = json_decode($response, true);

        if ($data && !empty($data['hits'])) {
            $hit = $data['hits'][0];
            $bestVideo = $hit['videos']['large'] ?? $hit['videos']['medium'] ?? [];
            return [
                'id'           => (string) $hit['id'],
                'source'       => 'pixabay',
                'type'         => 'video',
                'title'        => $hit['tags'] ?? 'Pixabay Video',
                'preview_url'  => '',
                'download_url' => $bestVideo['url'] ?? '',
                'attribution'  => 'Video by ' . ($hit['user'] ?? 'Unknown') . ' on Pixabay',
            ];
        }

        return null;
    }

    // ──────────────────────────────────────────────
    // Provider: Openverse (Creative Commons aggregator)
    // ──────────────────────────────────────────────

    /**
     * Search Openverse for commercially-usable CC/public-domain photos.
     * Needs NO API key (anonymous works); an optional 'openverse' bearer token
     * (free, instant registration) raises the rate limit when present.
     */
    private function searchOpenverse(string $query, int $page, int $perPage): array
    {
        $url = 'https://api.openverse.org/v1/images/?' . http_build_query([
            'q'            => $query,
            'page'         => $page,
            'page_size'    => $perPage,
            'license_type' => 'commercial', // only results cleared for commercial use
            'category'     => 'photograph', // real photos, not logos/album art/clip-art
            'mature'       => 'false',
        ]);

        $headers = $this->openverseHeaders();

        $response = $this->httpGet($url, $headers);
        $data = json_decode($response, true);

        if (!$data) {
            throw new \RuntimeException('Invalid response from Openverse');
        }

        $items = [];
        foreach ($data['results'] ?? [] as $r) {
            $item = [
                'id'           => (string) ($r['id'] ?? ''),
                'source'       => 'openverse',
                'type'         => 'photo',
                'title'        => $r['title'] ?? 'Openverse image',
                'preview_url'  => $r['url'] ?? $r['thumbnail'] ?? '',
                'download_url' => $r['url'] ?? '',
                'attribution'  => $this->openverseAttribution($r),
                'width'        => $r['width'] ?? null,
                'height'       => $r['height'] ?? null,
            ];
            $items[] = $item;
            if (!empty($r['id'])) {
                $this->setCache(md5("item:openverse:{$r['id']}"), $item);
            }
        }

        return [
            'items'  => $items,
            'total'  => (int) ($data['result_count'] ?? count($items)),
            'page'   => $page,
            'source' => 'openverse',
            'type'   => 'photo',
        ];
    }

    /** Fetch a single Openverse item by ID. */
    private function fetchOpenverseItem(string $itemId): ?array
    {
        try {
            $response = $this->httpGet(
                'https://api.openverse.org/v1/images/' . rawurlencode($itemId) . '/',
                $this->openverseHeaders()
            );
            $r = json_decode($response, true);
            if ($r && isset($r['id'])) {
                return [
                    'id'           => (string) $r['id'],
                    'source'       => 'openverse',
                    'type'         => 'photo',
                    'title'        => $r['title'] ?? 'Openverse image',
                    'preview_url'  => $r['url'] ?? $r['thumbnail'] ?? '',
                    'download_url' => $r['url'] ?? '',
                    'attribution'  => $this->openverseAttribution($r),
                ];
            }
        } catch (\Throwable) {
            return null;
        }
        return null;
    }

    /** Build request headers for Openverse, adding a bearer token when one is configured. */
    private function openverseHeaders(): array
    {
        $headers = [];
        $keyInfo = $this->keyService->getKey('openverse');
        if ($keyInfo && !empty($keyInfo['api_key'])) {
            $headers[] = 'Authorization: Bearer ' . $keyInfo['api_key'];
        }
        return $headers;
    }

    /** Prefer Openverse's ready-made attribution string; otherwise synthesize one. */
    private function openverseAttribution(array $r): string
    {
        if (!empty($r['attribution'])) {
            return (string) $r['attribution'];
        }
        $creator = $r['creator'] ?? 'Unknown';
        $license = strtoupper((string) ($r['license'] ?? 'CC'));
        return "Image by {$creator} — {$license} via Openverse";
    }

    // ──────────────────────────────────────────────
    // Provider: Freesound
    // ──────────────────────────────────────────────

    /** Search Freesound for audio clips. */
    private function searchFreesound(string $query, int $page, int $perPage): array
    {
        $keyInfo = $this->keyService->getKey('freesound');
        if (!$keyInfo) {
            throw new \RuntimeException('No active Freesound API key available');
        }
        $apiKey = $keyInfo['api_key'];

        $url = 'https://freesound.org/apiv2/search/text/?' . http_build_query([
            'query'     => $query,
            'page'      => $page,
            'page_size' => $perPage,
            'fields'    => 'id,name,description,previews,duration,username,license,download',
            'token'     => $apiKey,
        ]);

        $response = $this->httpGet($url);
        $data = json_decode($response, true);

        if (!$data) {
            throw new \RuntimeException('Invalid response from Freesound');
        }

        $items = [];
        foreach ($data['results'] ?? [] as $sound) {
            $item = [
                'id'           => (string) $sound['id'],
                'source'       => 'freesound',
                'type'         => 'audio',
                'title'        => $sound['name'] ?? 'Freesound Audio',
                'preview_url'  => $sound['previews']['preview-hq-mp3'] ?? $sound['previews']['preview-lq-mp3'] ?? '',
                'download_url' => $sound['download'] ?? '',
                'attribution'  => 'Sound by ' . ($sound['username'] ?? 'Unknown') . ' on Freesound (' . ($sound['license'] ?? 'CC') . ')',
                'duration'     => $sound['duration'] ?? null,
            ];
            $items[] = $item;
            $this->setCache(md5("item:freesound:{$sound['id']}"), $item);
        }

        return [
            'items'  => $items,
            'total'  => (int) ($data['count'] ?? 0),
            'page'   => $page,
            'source' => 'freesound',
            'type'   => 'audio',
        ];
    }

    /** Fetch a single Freesound item by ID. */
    private function fetchFreesoundItem(string $itemId): ?array
    {
        $keyInfo = $this->keyService->getKey('freesound');
        if (!$keyInfo) {
            return null;
        }
        $apiKey = $keyInfo['api_key'];

        $url = "https://freesound.org/apiv2/sounds/{$itemId}/?" . http_build_query([
            'fields' => 'id,name,description,previews,duration,username,license,download',
            'token'  => $apiKey,
        ]);

        $response = $this->httpGet($url);
        $sound = json_decode($response, true);

        if (!$sound || !isset($sound['id'])) {
            return null;
        }

        return [
            'id'           => (string) $sound['id'],
            'source'       => 'freesound',
            'type'         => 'audio',
            'title'        => $sound['name'] ?? 'Freesound Audio',
            'preview_url'  => $sound['previews']['preview-hq-mp3'] ?? '',
            'download_url' => $sound['download'] ?? '',
            'attribution'  => 'Sound by ' . ($sound['username'] ?? 'Unknown') . ' on Freesound (' . ($sound['license'] ?? 'CC') . ')',
            'duration'     => $sound['duration'] ?? null,
        ];
    }

    // ──────────────────────────────────────────────
    // Cache Helpers
    // ──────────────────────────────────────────────

    /** Read from the stock_media_cache table. Returns decoded JSON or null. */
    private function getCached(string $cacheKey): ?array
    {
        try {
            $row = Database::fetch(
                'SELECT response_json, created_at FROM stock_media_cache WHERE cache_key = ? AND created_at > DATE_SUB(NOW(), INTERVAL ? SECOND)',
                [$cacheKey, self::CACHE_TTL]
            );

            return $row ? json_decode($row['response_json'], true) : null;
        } catch (\Throwable) {
            // Table may not exist yet — silently skip cache
            return null;
        }
    }

    /** Write to the stock_media_cache table (upsert). */
    private function setCache(string $cacheKey, array $data): void
    {
        try {
            Database::query(
                'INSERT INTO stock_media_cache (cache_key, response_json, created_at)
                 VALUES (?, ?, NOW())
                 ON DUPLICATE KEY UPDATE response_json = VALUES(response_json), created_at = NOW()',
                [$cacheKey, json_encode($data)]
            );
        } catch (\Throwable $e) {
            // Non-critical — log and continue without caching
            error_log('Stock cache write failed: ' . $e->getMessage());
        }
    }

    // ──────────────────────────────────────────────
    // HTTP Helper
    // ──────────────────────────────────────────────

    /** Perform a GET request via cURL with optional headers. */
    private function httpGet(string $url, array $headers = []): string
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_USERAGENT      => 'ContentineCreate/1.0',
        ]);

        if (!empty($headers)) {
            curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        }

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        if ($response === false) {
            throw new \RuntimeException("HTTP request failed: {$error}");
        }

        if ($httpCode >= 400) {
            throw new \RuntimeException("HTTP {$httpCode} from {$url}");
        }

        return $response;
    }
}
