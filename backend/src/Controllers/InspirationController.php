<?php

declare(strict_types=1);

namespace Contentine\Controllers;

use Contentine\Auth;
use Contentine\Database;

/** Provides curated inspiration items from user search history and trending favourites. */
class InspirationController
{
    /**
     * GET /api/inspiration — Return a combined feed of inspiration items.
     * Sources: user's recent searches + globally popular favourited topics.
     */
    public function index(array $params, array $body): void
    {
        $user = Auth::requireUser();

        // 1. User's recent unique searches (last 20 distinct queries)
        $recentSearches = Database::fetchAll(
            'SELECT DISTINCT query, platform, created_at FROM idea_searches WHERE user_id = ? ORDER BY created_at DESC LIMIT 20',
            [$user['id']]
        );

        // 2. Globally popular favourited topics (most saved by all users)
        $trendingTopics = Database::fetchAll(
            'SELECT ft.topic_text, ft.source_platform, ft.search_volume, COUNT(*) AS fav_count FROM favourite_topics ft GROUP BY ft.topic_text, ft.source_platform, ft.search_volume ORDER BY fav_count DESC LIMIT 10'
        );

        // Combine into a unified inspiration feed
        $items = [];

        // Map recent searches into inspiration items
        foreach ($recentSearches as $search) {
            $items[] = [
                'type'             => 'recent_search',
                'title'            => $search['query'],
                'source_platform'  => $search['platform'],
                'engagement_score' => null,
                'created_at'       => $search['created_at'],
            ];
        }

        // Map trending favourites into inspiration items
        foreach ($trendingTopics as $topic) {
            $items[] = [
                'type'             => 'trending_topic',
                'title'            => $topic['topic_text'],
                'source_platform'  => $topic['source_platform'],
                'engagement_score' => (int) $topic['fav_count'],
                'created_at'       => null,
            ];
        }

        echo json_encode(['items' => $items]);
    }
}
