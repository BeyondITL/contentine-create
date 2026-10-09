<?php

declare(strict_types=1);

namespace Contentine\Controllers;

use Contentine\Auth;
use Contentine\Database;

/** Handles idea search across 8 platforms and favourite topic management. */
class IdeaController
{
    /** Valid platforms for idea search. */
    private const VALID_PLATFORMS = [
        'google', 'youtube', 'bing', 'tiktok',
        'instagram', 'twitter', 'pinterest', 'quora',
    ];

    /**
     * Platforms that expose a key-free public autocomplete/suggest API we can call
     * honestly. Everything else in VALID_PLATFORMS has no zero-key path and is
     * surfaced to the UI as an honest "requires API key" state — never fabricated
     * data (Law L1). See searchGoogle/searchYouTube/searchBing.
     */
    private const ZERO_KEY_PLATFORMS = ['google', 'youtube', 'bing'];

    /**
     * POST /api/ideas/search — Search for content ideas on a specific platform.
     * Caches results for 15 minutes per user+query+platform combination.
     */
    public function search(array $params, array $body): void
    {
        $user = Auth::requireUser();

        $query = trim($body['query'] ?? '');
        $platform = $body['platform'] ?? '';

        // Validate query
        if ($query === '') {
            http_response_code(400);
            echo json_encode(['error' => 'query is required']);
            return;
        }

        if (mb_strlen($query) > 300) {
            http_response_code(400);
            echo json_encode(['error' => 'query must be 300 characters or fewer']);
            return;
        }

        // Validate platform
        if (!in_array($platform, self::VALID_PLATFORMS, true)) {
            http_response_code(400);
            echo json_encode([
                'error' => 'platform must be one of: ' . implode(', ', self::VALID_PLATFORMS),
            ]);
            return;
        }

        // Honest gate (Law L1): platforms without a key-free public suggest API return
        // an "unavailable — requires API key" state, NOT fabricated results.
        if (!in_array($platform, self::ZERO_KEY_PLATFORMS, true)) {
            echo json_encode([
                'results'     => [],
                'cached'      => false,
                'unavailable' => true,
                'reason'      => ucfirst($platform) . ' idea search requires an official ' . ucfirst($platform)
                    . ' API key, which the operator has not provisioned. Try Google, YouTube, or Bing for key-free suggestions.',
            ]);
            return;
        }

        // Check cache (15-minute window)
        $cached = Database::fetch(
            'SELECT results_json FROM idea_searches WHERE user_id = ? AND query = ? AND platform = ? AND created_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE) ORDER BY created_at DESC LIMIT 1',
            [$user['id'], $query, $platform]
        );

        if ($cached) {
            echo json_encode([
                'results' => json_decode($cached['results_json'], true),
                'cached' => true,
            ]);
            return;
        }

        // Fetch results based on platform
        try {
            $results = match ($platform) {
                'google'    => $this->searchGoogle($query),
                'youtube'   => $this->searchYouTube($query),
                'bing'      => $this->searchBing($query),
                default     => [], // unreachable: non-zero-key platforms gated above
            };
        } catch (\Throwable $e) {
            error_log("Idea search error ({$platform}): " . $e->getMessage());
            http_response_code(502);
            echo json_encode(['error' => 'Search request failed. Please try again.']);
            return;
        }

        // Cache results
        Database::insert('idea_searches', [
            'user_id'      => $user['id'],
            'query'        => $query,
            'platform'     => $platform,
            'results_json' => json_encode($results),
        ]);

        echo json_encode([
            'results' => $results,
            'cached'  => false,
        ]);
    }

    /**
     * GET /api/ideas/favourites — List the authenticated user's favourite topics.
     */
    public function favourites(array $params, array $body): void
    {
        $user = Auth::requireUser();

        $favourites = Database::fetchAll(
            'SELECT * FROM favourite_topics WHERE user_id = ? ORDER BY created_at DESC',
            [$user['id']]
        );

        echo json_encode(['favourites' => $favourites]);
    }

    /**
     * POST /api/ideas/favourites — Add a topic to the user's favourites.
     */
    public function addFavourite(array $params, array $body): void
    {
        $user = Auth::requireUser();

        $topicText = trim($body['topic_text'] ?? '');
        $sourcePlatform = $body['source_platform'] ?? null;
        $searchVolume = isset($body['search_volume']) ? (int) $body['search_volume'] : null;

        if ($topicText === '') {
            http_response_code(400);
            echo json_encode(['error' => 'topic_text is required']);
            return;
        }

        if (mb_strlen($topicText) > 300) {
            http_response_code(400);
            echo json_encode(['error' => 'topic_text must be 300 characters or fewer']);
            return;
        }

        // Check for duplicate (UNIQUE KEY uk_user_topic on user_id + topic_text)
        $existing = Database::fetch(
            'SELECT id FROM favourite_topics WHERE user_id = ? AND topic_text = ?',
            [$user['id'], $topicText]
        );

        if ($existing) {
            http_response_code(409);
            echo json_encode(['error' => 'Topic already in favourites']);
            return;
        }

        try {
            $id = Database::insert('favourite_topics', [
                'user_id'         => $user['id'],
                'topic_text'      => $topicText,
                'source_platform' => $sourcePlatform,
                'search_volume'   => $searchVolume,
            ]);

            $favourite = Database::fetch('SELECT * FROM favourite_topics WHERE id = ?', [$id]);

            http_response_code(201);
            echo json_encode($favourite);
        } catch (\PDOException $e) {
            // Handle duplicate key at DB level as fallback
            if ($e->getCode() === '23000') {
                http_response_code(409);
                echo json_encode(['error' => 'Topic already in favourites']);
                return;
            }
            throw $e;
        }
    }

    /**
     * DELETE /api/ideas/favourites/{id} — Remove a favourite topic.
     */
    public function removeFavourite(array $params, array $body): void
    {
        $user = Auth::requireUser();
        $id = (int) ($params['id'] ?? 0);

        if ($id <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid favourite ID']);
            return;
        }

        $deleted = Database::delete(
            'favourite_topics',
            'id = ? AND user_id = ?',
            [$id, $user['id']]
        );

        if ($deleted === 0) {
            http_response_code(404);
            echo json_encode(['error' => 'Favourite not found']);
            return;
        }

        echo json_encode(['success' => true]);
    }

    // ──────────────────────────────────────────────
    // Search Implementations
    // ──────────────────────────────────────────────

    /** Fetch Google autocomplete suggestions via the public suggest API. */
    private function searchGoogle(string $query): array
    {
        $url = 'http://suggestqueries.google.com/complete/search?client=firefox&q=' . urlencode($query);
        $raw = $this->curlGet($url);
        $data = json_decode($raw, true);

        // Google returns [query, [suggestions]]
        $suggestions = $data[1] ?? [];

        return array_map(fn(string $suggestion) => [
            'title'           => $suggestion,
            'url'             => null,
            'source_platform' => 'google',
            'search_volume'   => null,
            'description'     => null,
        ], $suggestions);
    }

    /** Fetch YouTube autocomplete suggestions via the public suggest API. */
    private function searchYouTube(string $query): array
    {
        $url = 'https://suggestqueries.youtube.com/complete/search?client=firefox&ds=yt&q=' . urlencode($query);
        $raw = $this->curlGet($url);
        $data = json_decode($raw, true);

        // YouTube returns [query, [suggestions]]
        $suggestions = $data[1] ?? [];

        return array_map(fn(string $suggestion) => [
            'title'           => $suggestion,
            'url'             => null,
            'source_platform' => 'youtube',
            'search_volume'   => null,
            'description'     => null,
        ], $suggestions);
    }

    /** Fetch Bing autocomplete suggestions via the public suggest API. */
    private function searchBing(string $query): array
    {
        $url = 'https://api.bing.com/osjson.aspx?query=' . urlencode($query);
        $raw = $this->curlGet($url);
        $data = json_decode($raw, true);

        // Bing returns [query, [suggestions]]
        $suggestions = $data[1] ?? [];

        return array_map(fn(string $suggestion) => [
            'title'           => $suggestion,
            'url'             => null,
            'source_platform' => 'bing',
            'search_volume'   => null,
            'description'     => null,
        ], $suggestions);
    }

    // ──────────────────────────────────────────────
    // HTTP Helper
    // ──────────────────────────────────────────────

    /** Perform a GET request via curl and return the raw response body. */
    private function curlGet(string $url): string
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_USERAGENT      => 'Mozilla/5.0 (compatible; ContentineCreate/1.0)',
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        if ($response === false || $httpCode >= 400) {
            throw new \RuntimeException("HTTP GET failed ({$httpCode}): {$error}");
        }

        return $response;
    }
}
