<?php

declare(strict_types=1);

namespace Contentine\Controllers;

use Contentine\Auth;
use Contentine\Database;

/** Manages voice profiles (Kokoro TTS presets + user cloned voices). */
class VoiceController
{
    /** GET /api/voices — list all voice profiles for user. */
    public function index(array $params, array $body): void
    {
        Auth::requireUser();

        $voices = Database::fetchAll(
            'SELECT * FROM voice_profiles WHERE is_preset = 1 OR user_id = ? ORDER BY sort_order ASC, name ASC',
            [Auth::requireUser()['id']]
        );

        echo json_encode(['voices' => $voices]);
    }

    /** POST /api/voices — create a custom voice profile. */
    public function store(array $params, array $body): void
    {
        $user = Auth::requireUser();

        $id = Database::insert('voice_profiles', [
            'user_id' => $user['id'],
            'name' => $body['name'] ?? 'Custom Voice',
            'kokoro_voice_id' => $body['kokoro_voice_id'] ?? null,
            'source' => $body['source'] ?? 'cloned',
            'language' => $body['language'] ?? 'en-us',
            'gender' => $body['gender'] ?? null,
            'tone' => $body['tone'] ?? null,
            'speed' => $body['speed'] ?? 1.0,
            'pitch' => $body['pitch'] ?? 1.0,
            'style' => $body['style'] ?? 'neutral',
            'is_preset' => 0,
        ]);

        $voice = Database::fetch('SELECT * FROM voice_profiles WHERE id = ?', [$id]);

        http_response_code(201);
        echo json_encode(['voice' => $voice]);
    }

    /** GET /api/voices/{id} — get a single voice profile. */
    public function show(array $params, array $body): void
    {
        $voice = Database::fetch('SELECT * FROM voice_profiles WHERE id = ?', [$params['id']]);

        if (!$voice) {
            http_response_code(404);
            echo json_encode(['error' => 'Voice not found']);
            return;
        }

        echo json_encode(['voice' => $voice]);
    }

    /** PUT /api/voices/{id} — update a voice profile. */
    public function update(array $params, array $body): void
    {
        $user = Auth::requireUser();
        $voice = Database::fetch(
            'SELECT * FROM voice_profiles WHERE id = ? AND user_id = ?',
            [$params['id'], $user['id']]
        );

        if (!$voice) {
            http_response_code(404);
            echo json_encode(['error' => 'Voice not found or not yours']);
            return;
        }

        $allowed = ['name', 'speed', 'pitch', 'tone', 'style'];
        $data = [];
        foreach ($allowed as $field) {
            if (array_key_exists($field, $body)) {
                $data[$field] = $body[$field];
            }
        }

        if (!empty($data)) {
            Database::update('voice_profiles', $data, 'id = ?', [$params['id']]);
        }

        $voice = Database::fetch('SELECT * FROM voice_profiles WHERE id = ?', [$params['id']]);
        echo json_encode(['voice' => $voice]);
    }

    /** DELETE /api/voices/{id} — delete a user's cloned voice. */
    public function destroy(array $params, array $body): void
    {
        $user = Auth::requireUser();
        $voice = Database::fetch(
            'SELECT * FROM voice_profiles WHERE id = ? AND user_id = ? AND is_preset = 0',
            [$params['id'], $user['id']]
        );

        if (!$voice) {
            http_response_code(404);
            echo json_encode(['error' => 'Voice not found or cannot be deleted']);
            return;
        }

        Database::delete('voice_profiles', 'id = ?', [$params['id']]);
        echo json_encode(['success' => true]);
    }
}
