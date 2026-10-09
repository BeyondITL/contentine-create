<?php

declare(strict_types=1);

namespace Contentine\Controllers;

use Contentine\Auth;
use Contentine\Database;
use Contentine\Middleware\InputValidator;

/** Handles video CRUD + MP4 upload from browser renderer. */
class VideoController
{
    /** GET /api/videos — list user's videos with optional filters. */
    public function index(array $params, array $body): void
    {
        $user = Auth::requireScope('videos:read');
        $page = max(1, (int) ($_GET['page'] ?? 1));
        $limit = min(50, max(1, (int) ($_GET['limit'] ?? 20)));
        $offset = ($page - 1) * $limit;

        $where = 'user_id = ?';
        $bindings = [$user['id']];

        // Optional status filter
        if (!empty($_GET['status'])) {
            $where .= ' AND status = ?';
            $bindings[] = $_GET['status'];
        }

        // Optional type filter
        if (!empty($_GET['type'])) {
            $where .= ' AND type = ?';
            $bindings[] = $_GET['type'];
        }

        // Optional search
        if (!empty($_GET['q'])) {
            $where .= ' AND title LIKE ?';
            $bindings[] = '%' . $_GET['q'] . '%';
        }

        $total = Database::fetch(
            "SELECT COUNT(*) as cnt FROM videos WHERE {$where}",
            $bindings
        )['cnt'];

        $videos = Database::fetchAll(
            "SELECT * FROM videos WHERE {$where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
            [...$bindings, $limit, $offset]
        );

        echo json_encode([
            'videos' => $videos,
            'total' => (int) $total,
            'page' => $page,
            'limit' => $limit,
        ]);
    }

    /** POST /api/videos — create a new video record. */
    public function store(array $params, array $body): void
    {
        $user = Auth::requireScope('videos:write');

        $clean = InputValidator::sanitize($body, [
            'project_id'         => 'int|nullable',
            'title'              => 'string|max:300|nullable',
            'type'               => 'string|max:30|in:faceless,avatar|nullable',
            'style_mode'         => 'string|max:30|nullable',
            'script_json'        => 'array|nullable',
            'art_style'          => 'string|max:50|nullable',
            'voice_profile_id'   => 'int|nullable',
            'character_anchor_id' => 'int|nullable',
            'aspect_ratio'       => 'string|max:10|in:9:16,16:9,1:1|nullable',
            'duration_seconds'   => 'int|min:0|nullable',
            'status'             => 'string|max:30|in:draft,rendering,completed,failed|nullable',
        ]);

        $id = Database::insert('videos', [
            'user_id' => $user['id'],
            'project_id' => $clean['project_id'] ?? null,
            'title' => $clean['title'] ?? 'Untitled Video',
            'type' => $clean['type'] ?? 'faceless',
            'style_mode' => $clean['style_mode'] ?? 'ai_visuals',
            'script_json' => json_encode($clean['script_json'] ?? ['scenes' => []]),
            'art_style' => $clean['art_style'] ?? null,
            'voice_profile_id' => $clean['voice_profile_id'] ?? null,
            'character_anchor_id' => $clean['character_anchor_id'] ?? null,
            'aspect_ratio' => $clean['aspect_ratio'] ?? '9:16',
            'duration_seconds' => $clean['duration_seconds'] ?? 0,
            'status' => $clean['status'] ?? 'draft',
            'folder_path' => "videos/{$user['id']}/" . uniqid(),
        ]);

        $video = Database::fetch('SELECT * FROM videos WHERE id = ?', [$id]);

        http_response_code(201);
        echo json_encode(['video' => $video]);
    }

    /** GET /api/videos/{id} — get a single video. */
    public function show(array $params, array $body): void
    {
        $user = Auth::requireScope('videos:read');
        $video = Database::fetch(
            'SELECT * FROM videos WHERE id = ? AND user_id = ?',
            [$params['id'], $user['id']]
        );

        if (!$video) {
            http_response_code(404);
            echo json_encode(['error' => 'Video not found']);
            return;
        }

        echo json_encode(['video' => $video]);
    }

    /** PUT /api/videos/{id} — update video record. */
    public function update(array $params, array $body): void
    {
        $user = Auth::requireScope('videos:write');

        $clean = InputValidator::sanitize($body, [
            'title'              => 'string|max:300|nullable',
            'status'             => 'string|max:30|in:draft,rendering,completed,failed|nullable',
            'script_json'        => 'array|nullable',
            'art_style'          => 'string|max:50|nullable',
            'voice_profile_id'   => 'int|nullable',
            'character_anchor_id' => 'int|nullable',
            'aspect_ratio'       => 'string|max:10|in:9:16,16:9,1:1|nullable',
            'duration_seconds'   => 'int|min:0|nullable',
            'style_mode'         => 'string|max:30|nullable',
            'mp4_path'           => 'string|max:500|nullable',
            'thumbnail_path'     => 'string|max:500|nullable',
            'render_started_at'  => 'string|max:30|nullable',
            'render_completed_at' => 'string|max:30|nullable',
        ]);

        $video = Database::fetch(
            'SELECT * FROM videos WHERE id = ? AND user_id = ?',
            [$params['id'], $user['id']]
        );

        if (!$video) {
            http_response_code(404);
            echo json_encode(['error' => 'Video not found']);
            return;
        }

        $allowed = ['title', 'status', 'script_json', 'art_style', 'voice_profile_id',
            'character_anchor_id', 'aspect_ratio', 'duration_seconds', 'style_mode',
            'mp4_path', 'thumbnail_path', 'render_started_at', 'render_completed_at'];

        $data = [];
        foreach ($allowed as $field) {
            if (array_key_exists($field, $clean)) {
                $data[$field] = $field === 'script_json' ? json_encode($clean[$field]) : $clean[$field];
            }
        }

        if (!empty($data)) {
            Database::update('videos', $data, 'id = ?', [$params['id']]);
        }

        $video = Database::fetch('SELECT * FROM videos WHERE id = ?', [$params['id']]);
        echo json_encode(['video' => $video]);
    }

    /** DELETE /api/videos/{id} — soft-delete by changing status. */
    public function destroy(array $params, array $body): void
    {
        $user = Auth::requireScope('videos:write');
        $video = Database::fetch(
            'SELECT * FROM videos WHERE id = ? AND user_id = ?',
            [$params['id'], $user['id']]
        );

        if (!$video) {
            http_response_code(404);
            echo json_encode(['error' => 'Video not found']);
            return;
        }

        Database::delete('videos', 'id = ?', [$params['id']]);

        // Clean up file if exists
        if ($video['mp4_path'] && file_exists($video['mp4_path'])) {
            unlink($video['mp4_path']);
        }

        echo json_encode(['success' => true]);
    }

    /** POST /api/videos/{id}/upload — receive MP4 blob from browser renderer. */
    public function upload(array $params, array $body): void
    {
        $user = Auth::requireScope('videos:write');
        $video = Database::fetch(
            'SELECT * FROM videos WHERE id = ? AND user_id = ?',
            [$params['id'], $user['id']]
        );

        if (!$video) {
            http_response_code(404);
            echo json_encode(['error' => 'Video not found']);
            return;
        }

        if (!isset($_FILES['file'])) {
            http_response_code(400);
            echo json_encode(['error' => 'No file uploaded']);
            return;
        }

        $file = $_FILES['file'];
        $maxSize = 500 * 1024 * 1024; // 500MB

        if ($file['size'] > $maxSize) {
            http_response_code(413);
            echo json_encode(['error' => 'File too large. Maximum 500MB.']);
            return;
        }

        // Validate MIME type
        $finfo = new \finfo(FILEINFO_MIME_TYPE);
        $mimeType = $finfo->file($file['tmp_name']);
        if (!in_array($mimeType, ['video/mp4', 'video/webm', 'application/octet-stream'])) {
            http_response_code(415);
            echo json_encode(['error' => 'Invalid file type. Only MP4/WebM accepted.']);
            return;
        }

        // Save file
        $uploadDir = __DIR__ . '/../../uploads/' . $video['folder_path'];
        if (!is_dir($uploadDir)) {
            mkdir($uploadDir, 0755, true);
        }

        $filename = 'video_' . time() . '.mp4';
        $filepath = $uploadDir . '/' . $filename;

        if (!move_uploaded_file($file['tmp_name'], $filepath)) {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to save file']);
            return;
        }

        // Update video record
        $publicPath = '/uploads/' . $video['folder_path'] . '/' . $filename;
        Database::update('videos', [
            'mp4_path' => $publicPath,
            'status' => 'completed',
            'render_completed_at' => date('Y-m-d H:i:s'),
            'duration_seconds' => $body['duration_seconds'] ?? $video['duration_seconds'],
        ], 'id = ?', [$params['id']]);

        // Update user storage
        Database::query(
            'UPDATE users SET storage_used_bytes = storage_used_bytes + ? WHERE id = ?',
            [$file['size'], $user['id']]
        );

        $video = Database::fetch('SELECT * FROM videos WHERE id = ?', [$params['id']]);
        echo json_encode(['video' => $video, 'path' => $publicPath]);
    }

    /** GET /api/videos/{id}/comments — list comments on a video. */
    public function comments(array $params, array $body): void
    {
        $user = Auth::requireScope('videos:read');

        $comments = Database::fetchAll(
            'SELECT vc.*, u.name as author_name FROM video_comments vc
             JOIN users u ON u.id = vc.user_id
             WHERE vc.video_id = ?
             ORDER BY vc.created_at ASC',
            [$params['id']]
        );

        echo json_encode(['comments' => $comments]);
    }

    /** POST /api/videos/{id}/comments — add a comment. */
    public function addComment(array $params, array $body): void
    {
        $user = Auth::requireScope('videos:write');

        $clean = InputValidator::sanitize($body, [
            'body'              => 'required|string|max:2000|min:1',
            'timestamp_seconds' => 'int|min:0|nullable',
        ]);

        $id = Database::insert('video_comments', [
            'video_id' => $params['id'],
            'user_id' => $user['id'],
            'body' => $clean['body'],
            'timestamp_seconds' => $clean['timestamp_seconds'] ?? null,
        ]);

        $comment = Database::fetch('SELECT * FROM video_comments WHERE id = ?', [$id]);
        http_response_code(201);
        echo json_encode(['comment' => $comment]);
    }
}
