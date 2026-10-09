<?php

declare(strict_types=1);

namespace Contentine\Controllers;

use Contentine\Auth;
use Contentine\Database;

/** Handles avatar preset listing and real-clone uploads. */
class AvatarController
{
    /** GET /api/avatars/presets — list all active avatar presets. */
    public function presets(array $params, array $body): void
    {
        // Avatar presets are public — no auth required for reading
        $avatars = Database::fetchAll(
            'SELECT * FROM avatar_presets WHERE is_active = 1 ORDER BY sort_order ASC, name ASC'
        );

        echo json_encode(['avatars' => $avatars]);
    }

    /**
     * POST /api/avatars/real-clone — submit a Real Clone Studio request
     * (Professional tier, D-24). SA-12 / F-35.
     *
     * Law L7 consent gate (right-of-publicity / ELVIS-Act-class shield): the
     * request is REJECTED (400) unless the user affirms recorded consent that
     * they are the person shown (or hold the rights) and consent to a synthetic
     * likeness. The affirmation is persisted verbatim + audit context into the
     * request row — a recorded consent in the DB is the shield, not optional
     * polish. An optional on-camera consent recording is stronger evidence still.
     *
     * Creates a `real_clone_requests` row (status 'pending') that the admin
     * review queue (RealCloneController) works. multipart/form-data: text fields
     * arrive in $_POST (the router leaves $body empty for multipart), files in
     * $_FILES.
     */
    public function realClone(array $params, array $body): void
    {
        $user = Auth::requireUser();

        // ── Law L7: recorded-consent gate (hard 400 without it) ──
        // Accept either field name (`consent` from the multipart form, or
        // `consent_recorded` from a JSON caller) across either transport.
        $consentRaw = $_POST['consent'] ?? $_POST['consent_recorded']
            ?? $body['consent'] ?? $body['consent_recorded'] ?? null;
        $consentGiven = filter_var($consentRaw, FILTER_VALIDATE_BOOLEAN);
        if (!$consentGiven) {
            http_response_code(400);
            echo json_encode(['error' =>
                'Recorded consent is required. You must affirm that you are the person shown ' .
                '(or hold the rights to their likeness) and consent to Contentine building a ' .
                'synthetic likeness that can generate new video (Law L7 — right of publicity).',
            ]);
            return;
        }

        // ── Required: the source video the clone is built from ──
        if (!isset($_FILES['source_video'])) {
            http_response_code(400);
            echo json_encode(['error' => 'No source video uploaded. Send a "source_video" file field (MP4, WebM, or MOV).']);
            return;
        }

        $uploadDir = __DIR__ . '/../../uploads/real-clone/' . $user['id'];
        $publicBase = '/uploads/real-clone/' . $user['id'];
        if (!is_dir($uploadDir)) {
            mkdir($uploadDir, 0755, true);
        }

        $err = null;
        $sourcePath = $this->saveVideoUpload($_FILES['source_video'], $uploadDir, $publicBase, 'source', $err);
        if ($sourcePath === null) {
            http_response_code($err['code']);
            echo json_encode(['error' => $err['msg']]);
            return;
        }

        // Optional on-camera consent recording (stronger right-of-publicity evidence).
        $consentPath = null;
        if (isset($_FILES['consent_video']) && (($_FILES['consent_video']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE)) {
            $consentPath = $this->saveVideoUpload($_FILES['consent_video'], $uploadDir, $publicBase, 'consent', $err);
            if ($consentPath === null) {
                http_response_code($err['code']);
                echo json_encode(['error' => $err['msg']]);
                return;
            }
        }

        // L7 DB record: the exact affirmation, versioned, with audit context, so a
        // reviewer/auditor sees precisely what was agreed, when, and by whom.
        $consentRecord = [
            'consent_given'         => true,
            'statement'             => (string) ($_POST['consent_statement'] ?? ''),
            'form_version'          => (string) ($_POST['consent_version'] ?? ''),
            'relationship'          => in_array($_POST['consent_relationship'] ?? '', ['self', 'authorized-third-party'], true)
                                        ? $_POST['consent_relationship'] : 'self',
            'signed_at'             => gmdate('c'),
            'ip'                    => $_SERVER['REMOTE_ADDR'] ?? null,
            'user_agent'            => substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 400),
            'has_consent_recording' => $consentPath !== null,
        ];

        $requestId = Database::insert('real_clone_requests', [
            'user_id'            => $user['id'],
            'consent_video_path' => $consentPath,
            'source_video_path'  => $sourcePath,
            // Durable L7 shield (migration 007): the admin approve-gate reads this
            // boolean, and it is never overwritten by later status/notes edits.
            'consent_recorded'   => 1,
            'status'             => 'pending',
            // Full affirmation for audit/display (verbatim statement + version + context).
            'notes'              => json_encode(['consent' => $consentRecord], JSON_UNESCAPED_SLASHES),
        ]);

        $request = Database::fetch('SELECT * FROM real_clone_requests WHERE id = ?', [$requestId]);

        http_response_code(201);
        echo json_encode(['request' => $request]);
    }

    /**
     * Validate + persist an uploaded video. Returns the public path, or null with
     * `$err = ['code' => int, 'msg' => string]` set on any validation failure
     * (honest, specific reasons — never a silent success).
     */
    private function saveVideoUpload(array $file, string $absDir, string $publicBase, string $prefix, ?array &$err): ?string
    {
        $err = null;

        if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            $err = ['code' => 400, 'msg' => 'Upload failed for the ' . $prefix . ' video.'];
            return null;
        }

        $maxSize = 100 * 1024 * 1024; // 100 MB
        if ($file['size'] > $maxSize) {
            $err = ['code' => 413, 'msg' => ucfirst($prefix) . ' video too large. Maximum 100MB.'];
            return null;
        }

        $finfo = new \finfo(FILEINFO_MIME_TYPE);
        $mimeType = $finfo->file($file['tmp_name']);
        $ext = match ($mimeType) {
            'video/mp4'        => 'mp4',
            'video/webm'       => 'webm',
            'video/quicktime'  => 'mov',
            default            => null,
        };
        if ($ext === null) {
            $err = ['code' => 415, 'msg' => 'Invalid ' . $prefix . ' video type. Only MP4, WebM, or MOV accepted.'];
            return null;
        }

        $filename = $prefix . '_' . uniqid() . '.' . $ext;
        $filepath = $absDir . '/' . $filename;
        if (!move_uploaded_file($file['tmp_name'], $filepath)) {
            $err = ['code' => 500, 'msg' => 'Failed to save the ' . $prefix . ' video.'];
            return null;
        }

        return $publicBase . '/' . $filename;
    }
}
