<?php

declare(strict_types=1);

namespace Contentine\Controllers;

use Contentine\Auth;
use Contentine\Database;

/** Manages user asset library (uploaded images, audio, video clips). */
class AssetController
{
    /** GET /api/assets — list user's assets with optional type filter. */
    public function index(array $params, array $body): void
    {
        $user = Auth::requireUser();
        $db = Database::getInstance();

        $type = $_GET['type'] ?? null;
        $page = max(1, (int) ($_GET['page'] ?? 1));
        $perPage = min(50, max(10, (int) ($_GET['per_page'] ?? 20)));
        $offset = ($page - 1) * $perPage;

        $where = 'WHERE user_id = ?';
        $bindings = [$user['id']];

        if ($type && in_array($type, ['image', 'video', 'audio'], true)) {
            $where .= ' AND type = ?';
            $bindings[] = $type;
        }

        $total = (int) $db->fetchOne("SELECT COUNT(*) as c FROM asset_library $where", $bindings)['c'];
        $assets = $db->fetchAll(
            "SELECT id, type, file_path, source, tags, file_size_bytes, created_at FROM asset_library $where ORDER BY created_at DESC LIMIT ? OFFSET ?",
            [...$bindings, $perPage, $offset]
        );

        echo json_encode([
            'assets' => $assets,
            'total' => $total,
            'page' => $page,
            'per_page' => $perPage,
        ]);
    }

    /** POST /api/assets — upload a new asset. */
    public function store(array $params, array $body): void
    {
        $user = Auth::requireUser();
        $db = Database::getInstance();

        if (!isset($_FILES['file'])) {
            http_response_code(400);
            echo json_encode(['error' => 'No file uploaded']);
            return;
        }

        $file = $_FILES['file'];
        $allowedTypes = [
            'image/jpeg', 'image/png', 'image/webp', 'image/gif',
            'video/mp4', 'video/webm',
            'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4',
        ];
        $mime = mime_content_type($file['tmp_name']);
        if (!in_array($mime, $allowedTypes, true)) {
            http_response_code(400);
            echo json_encode(['error' => 'Unsupported file type']);
            return;
        }

        $type = explode('/', $mime)[0]; // image, video, or audio
        $ext = pathinfo($file['name'], PATHINFO_EXTENSION) ?: 'bin';
        $filename = uniqid('asset_') . '.' . $ext;
        $uploadDir = dirname(__DIR__, 2) . '/uploads/assets/' . $user['id'];
        if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);
        $filePath = $uploadDir . '/' . $filename;

        if (!move_uploaded_file($file['tmp_name'], $filePath)) {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to save file']);
            return;
        }

        $relativePath = '/uploads/assets/' . $user['id'] . '/' . $filename;
        $tags = !empty($body['tags']) ? json_encode($body['tags']) : null;

        $db->execute(
            'INSERT INTO asset_library (user_id, type, file_path, source, tags, file_size_bytes) VALUES (?, ?, ?, ?, ?, ?)',
            [$user['id'], $type, $relativePath, 'uploaded', $tags, $file['size']]
        );

        $id = $db->lastInsertId();

        http_response_code(201);
        echo json_encode([
            'asset' => [
                'id' => $id,
                'type' => $type,
                'file_path' => $relativePath,
                'source' => 'uploaded',
                'file_size_bytes' => $file['size'],
            ],
        ]);
    }

    /** DELETE /api/assets/{id} — delete an asset. */
    public function destroy(array $params, array $body): void
    {
        $user = Auth::requireUser();
        $db = Database::getInstance();

        $id = $params['id'] ?? null;
        if (!$id) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing asset ID']);
            return;
        }

        $asset = $db->fetchOne(
            'SELECT id, file_path FROM asset_library WHERE id = ? AND user_id = ?',
            [$id, $user['id']]
        );

        if (!$asset) {
            http_response_code(404);
            echo json_encode(['error' => 'Asset not found']);
            return;
        }

        // Delete file from disk
        $fullPath = dirname(__DIR__, 2) . $asset['file_path'];
        if (file_exists($fullPath)) unlink($fullPath);

        $db->execute('DELETE FROM asset_library WHERE id = ?', [$id]);

        echo json_encode(['success' => true]);
    }
}
