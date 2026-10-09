<?php

declare(strict_types=1);

namespace Contentine\Controllers;

use Contentine\Auth;
use Contentine\Database;

/** Manages character anchors — reusable visual identities for consistent AI characters. */
class CharacterController
{
    /** GET /api/characters — list preset + user's character anchors. */
    public function index(array $params, array $body): void
    {
        $user = Auth::requireUser();

        $characters = Database::fetchAll(
            'SELECT * FROM character_anchors WHERE is_preset = 1 OR user_id = ? ORDER BY is_preset DESC, name ASC',
            [$user['id']]
        );

        echo json_encode(['characters' => $characters]);
    }

    /** POST /api/characters — create a new character anchor. */
    public function store(array $params, array $body): void
    {
        $user = Auth::requireUser();

        $photoPath = null;

        // Handle file upload if present
        if (isset($_FILES['photo'])) {
            $file = $_FILES['photo'];
            $maxSize = 10 * 1024 * 1024;

            if ($file['size'] > $maxSize) {
                http_response_code(413);
                echo json_encode(['error' => 'Photo too large. Maximum 10MB.']);
                return;
            }

            $finfo = new \finfo(FILEINFO_MIME_TYPE);
            $mimeType = $finfo->file($file['tmp_name']);
            if (!in_array($mimeType, ['image/jpeg', 'image/png', 'image/webp'], true)) {
                http_response_code(415);
                echo json_encode(['error' => 'Invalid file type.']);
                return;
            }

            $ext = match ($mimeType) {
                'image/jpeg' => 'jpg',
                'image/png' => 'png',
                'image/webp' => 'webp',
                default => 'jpg',
            };

            $uploadDir = __DIR__ . '/../../uploads/characters/' . $user['id'];
            if (!is_dir($uploadDir)) {
                mkdir($uploadDir, 0755, true);
            }

            $filename = 'char_' . uniqid() . '.' . $ext;
            $filepath = $uploadDir . '/' . $filename;

            if (move_uploaded_file($file['tmp_name'], $filepath)) {
                $photoPath = '/uploads/characters/' . $user['id'] . '/' . $filename;
            }
        }

        $id = Database::insert('character_anchors', [
            'user_id' => $user['id'],
            'name' => $body['name'] ?? 'New Character',
            'photo_path' => $photoPath ?? ($body['photo_path'] ?? null),
            'description_text' => $body['description_text'] ?? null,
            'seed_value' => $body['seed_value'] ?? null,
            'art_style' => $body['art_style'] ?? null,
            'is_preset' => 0,
            'gender' => $body['gender'] ?? null,
            'age_range' => $body['age_range'] ?? null,
            'ethnicity' => $body['ethnicity'] ?? null,
            'style' => $body['style'] ?? null,
        ]);

        $character = Database::fetch('SELECT * FROM character_anchors WHERE id = ?', [$id]);

        http_response_code(201);
        echo json_encode(['character' => $character]);
    }

    /** GET /api/characters/{id} — get a single character anchor. */
    public function show(array $params, array $body): void
    {
        $user = Auth::requireUser();
        $character = Database::fetch(
            'SELECT * FROM character_anchors WHERE id = ? AND (is_preset = 1 OR user_id = ?)',
            [$params['id'], $user['id']]
        );

        if (!$character) {
            http_response_code(404);
            echo json_encode(['error' => 'Character not found']);
            return;
        }

        echo json_encode(['character' => $character]);
    }

    /** PUT /api/characters/{id} — update a character anchor. */
    public function update(array $params, array $body): void
    {
        $user = Auth::requireUser();
        $character = Database::fetch(
            'SELECT * FROM character_anchors WHERE id = ? AND user_id = ? AND is_preset = 0',
            [$params['id'], $user['id']]
        );

        if (!$character) {
            http_response_code(404);
            echo json_encode(['error' => 'Character not found or cannot be edited']);
            return;
        }

        $allowed = ['name', 'description_text', 'art_style', 'gender', 'age_range', 'ethnicity', 'style', 'seed_value'];
        $data = [];
        foreach ($allowed as $field) {
            if (array_key_exists($field, $body)) {
                $data[$field] = $body[$field];
            }
        }

        if (!empty($data)) {
            Database::update('character_anchors', $data, 'id = ?', [$params['id']]);
        }

        $character = Database::fetch('SELECT * FROM character_anchors WHERE id = ?', [$params['id']]);
        echo json_encode(['character' => $character]);
    }

    /** DELETE /api/characters/{id} — delete a user's character anchor. */
    public function destroy(array $params, array $body): void
    {
        $user = Auth::requireUser();
        $character = Database::fetch(
            'SELECT * FROM character_anchors WHERE id = ? AND user_id = ? AND is_preset = 0',
            [$params['id'], $user['id']]
        );

        if (!$character) {
            http_response_code(404);
            echo json_encode(['error' => 'Character not found or cannot be deleted']);
            return;
        }

        // Clean up photo file if it exists
        if ($character['photo_path']) {
            $filepath = __DIR__ . '/../../uploads' . $character['photo_path'];
            if (file_exists($filepath)) {
                unlink($filepath);
            }
        }

        Database::delete('character_anchors', 'id = ?', [$params['id']]);
        echo json_encode(['success' => true]);
    }
}
