<?php

declare(strict_types=1);

namespace Contentine\Services;

class ContentExtractor
{
    /**
     * Extract text from a URL (article/blog)
     */
    public function extractFromUrl(string $url): array
    {
        $html = $this->fetchWithRetry($url);

        $dom = new \DOMDocument();
        @$dom->loadHTML($html, LIBXML_NOERROR);
        $xpath = new \DOMXPath($dom);

        // Get title
        $titleNodes = $xpath->query('//title');
        $title = $titleNodes->length > 0 ? trim($titleNodes->item(0)->textContent) : '';

        // Remove non-content elements. Snapshot the node list first — removing nodes while
        // iterating a live DOMNodeList skips siblings.
        foreach (['script','style','nav','header','footer','aside','iframe','noscript','form'] as $tag) {
            foreach (iterator_to_array($xpath->query("//{$tag}")) as $node) {
                if ($node->parentNode) {
                    $node->parentNode->removeChild($node);
                }
            }
        }

        // Extract from article/main or body
        $article = $xpath->query('//article | //main | //*[@role="main"]');
        $root = $article->length > 0 ? $article->item(0) : $dom->getElementsByTagName('body')->item(0);

        if ($root === null) {
            throw new \RuntimeException('Could not parse readable content from the page');
        }

        $text = trim(preg_replace('/\s+/', ' ', $root->textContent));

        // Honest empty-content guard: never return a 0-word "source". A paywalled or
        // JS-rendered page that yields no text is a real failure, not empty success.
        if (strlen($text) < 20) {
            throw new \RuntimeException('No readable article text found at this URL');
        }

        return ['title' => $title !== '' ? $title : $url, 'text' => $text];
    }

    /**
     * Fetch a URL with bounded retries. Honors D-47: retry transient network/5xx
     * failures with exponential backoff; never retry a definitive 4xx.
     */
    private function fetchWithRetry(string $url, int $maxAttempts = 3): string
    {
        $attempt = 0;
        $lastError = 'unknown error';

        while ($attempt < $maxAttempts) {
            list($html, $status) = $this->httpGet($url);

            if ($html !== '' && ($status === 0 || ($status >= 200 && $status < 300))) {
                return $html;
            }

            // Definitive client error — retrying will not help (D-47).
            if ($status >= 400 && $status < 500) {
                throw new \RuntimeException("The URL returned HTTP {$status} and could not be read");
            }

            $lastError = $status > 0 ? "HTTP {$status}" : 'connection failed';
            $attempt++;
            if ($attempt < $maxAttempts) {
                usleep(300000 * $attempt); // 0.3s, then 0.6s
            }
        }

        throw new \RuntimeException("Failed to fetch URL after {$maxAttempts} attempts ({$lastError})");
    }

    /**
     * Perform one GET. Returns [body, httpStatus]. Prefers cURL (exact status, no
     * deprecated globals); falls back to the HTTP stream wrapper where cURL is absent.
     */
    private function httpGet(string $url): array
    {
        $userAgent = 'Contentine/1.0 (+https://github.com/BeyondITL/contentine-create)';

        if (function_exists('curl_init')) {
            $ch = curl_init($url);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
            curl_setopt($ch, CURLOPT_MAXREDIRS, 5);
            curl_setopt($ch, CURLOPT_TIMEOUT, 12);
            curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 8);
            curl_setopt($ch, CURLOPT_USERAGENT, $userAgent);
            curl_setopt($ch, CURLOPT_HTTPHEADER, ['Accept: text/html,application/xhtml+xml']);
            $body = curl_exec($ch);
            $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
            return [is_string($body) ? $body : '', $status];
        }

        // Fallback: HTTP stream wrapper. Reference the response-header global indirectly so
        // PHP 8.4's compile-time deprecation of $http_response_header is never triggered,
        // while still reading it on PHP 8.0–8.3 where it is the only option.
        $context = stream_context_create([
            'http' => [
                'method'          => 'GET',
                'timeout'         => 12,
                'follow_location' => 1,
                'ignore_errors'   => true, // read the body even on 4xx/5xx so we can see the status
                'header'          => "User-Agent: {$userAgent}\r\nAccept: text/html,application/xhtml+xml\r\n",
            ],
        ]);

        $body = @file_get_contents($url, false, $context);
        $headerVar = 'http_response_header';
        $responseHeaders = isset($$headerVar) ? $$headerVar : [];

        return [is_string($body) ? $body : '', $this->statusFromHeaders($responseHeaders)];
    }

    /** Parse the final HTTP status code from a response-header array (0 if none). */
    private function statusFromHeaders(array $headers): int
    {
        $status = 0;
        foreach ($headers as $header) {
            if (preg_match('#^HTTP/\S+\s+(\d{3})#', $header, $m)) {
                $status = (int) $m[1]; // keep the last status line (handles redirects)
            }
        }
        return $status;
    }

    /**
     * Extract transcript from YouTube video
     */
    public function extractFromYouTube(string $videoUrl): array
    {
        preg_match('/(?:v=|\/)([\w-]{11})/', $videoUrl, $m);
        $videoId = $m[1] ?? throw new \RuntimeException('Invalid YouTube URL');

        $page = file_get_contents("https://www.youtube.com/watch?v={$videoId}");

        // Get title
        preg_match('/<title>(.*?)<\/title>/', $page, $titleMatch);
        $title = html_entity_decode($titleMatch[1] ?? 'YouTube Video');
        $title = str_replace(' - YouTube', '', $title);

        // Get captions
        preg_match('/"captionTracks":(\[.*?\])/', $page, $m);
        if (empty($m[1])) throw new \RuntimeException('No captions available');

        $tracks = json_decode($m[1], true);

        // Prefer English
        $trackUrl = null;
        foreach ($tracks as $t) {
            if (str_contains($t['languageCode'] ?? '', 'en')) {
                $trackUrl = $t['baseUrl'];
                break;
            }
        }
        $trackUrl ??= $tracks[0]['baseUrl'] ?? throw new \RuntimeException('No caption track found');

        $xml = file_get_contents($trackUrl);
        $text = trim(strip_tags(str_replace(['</text>', '&#39;'], ["\n", "'"], $xml)));

        return ['title' => $title, 'text' => $text];
    }

    /**
     * Extract caption from TikTok video
     */
    public function extractFromTikTok(string $videoUrl): array
    {
        $oembed = file_get_contents("https://www.tiktok.com/oembed?url=" . urlencode($videoUrl));
        $data = json_decode($oembed, true);

        return [
            'title' => $data['title'] ?? 'TikTok Video',
            'text' => $data['title'] ?? '',
        ];
    }

    /**
     * Route extraction to the right method
     */
    public function extract(string $type, ?string $url = null): array
    {
        return match ($type) {
            'url'     => $this->extractFromUrl($url),
            'youtube' => $this->extractFromYouTube($url),
            'tiktok'  => $this->extractFromTikTok($url),
            default   => throw new \RuntimeException("Unsupported source type: {$type}"),
        };
    }
}
