<?php
declare(strict_types=1);

namespace Contentine\Controllers;

use Contentine\Auth;
use Contentine\Database;
use Contentine\Services\DidService;
use Contentine\Services\CreditService;

/** Pro Avatar controller — D-ID API-powered photorealistic talking-head (Tier 3, paid plans only). */
class ProAvatarController
{
    private DidService $didService;
    private CreditService $creditService;

    public function __construct()
    {
        $this->didService = new DidService();
        $this->creditService = new CreditService();
    }

    /** POST /api/avatar/pro/generate — Generate a pro avatar video via D-ID. */
    public function generate(array $params, array $body): void
    {
        $user = Auth::requireUser();
        $userId = (int) $user['id'];

        // Gate: paid plans only
        if (($user['plan_tier'] ?? 'free') === 'free') {
            http_response_code(403);
            echo json_encode(['error' => 'Pro avatars require a paid plan. Upgrade to access photorealistic avatars.']);
            return;
        }

        // Gate: D-ID must be configured
        if (!$this->didService->isAvailable()) {
            http_response_code(503);
            echo json_encode(['error' => 'Pro avatar service not configured. Use 3D avatars (Tier 1) or photo avatars (Tier 2) instead.']);
            return;
        }

        $imageUrl = $body['image_url'] ?? '';
        $audioUrl = $body['audio_url'] ?? '';

        if (!$imageUrl || !$audioUrl) {
            http_response_code(400);
            echo json_encode(['error' => 'image_url and audio_url are required']);
            return;
        }

        // Deduct credits
        $deduction = $this->creditService->deductForFeature($userId, 'avatar_pro', 'api');
        if (!($deduction['deducted'] ?? false) && !($deduction['is_promo'] ?? false)) {
            http_response_code(402);
            echo json_encode(['error' => 'insufficient_credits', 'required' => $deduction['cost'] ?? 0, 'balance' => $deduction['balance'] ?? 0]);
            return;
        }

        try {
            $result = $this->didService->createTalkingHead($imageUrl, $audioUrl);
            echo json_encode([
                'talk_id' => $result['id'],
                'status' => $result['status'],
                'credits' => ['cost' => $deduction['cost'] ?? 0, 'balance' => $deduction['balance'] ?? 0],
            ]);
        } catch (\Throwable $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Pro avatar generation failed: ' . $e->getMessage()]);
        }
    }

    /** GET /api/avatar/pro/status/{id} — Poll D-ID for video completion. */
    public function status(array $params, array $body): void
    {
        Auth::requireUser();
        $talkId = $params['id'] ?? '';

        if (!$talkId) {
            http_response_code(400);
            echo json_encode(['error' => 'Talk ID required']);
            return;
        }

        try {
            $result = $this->didService->getStatus($talkId);
            echo json_encode($result);
        } catch (\Throwable $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
    }

    /** GET /api/avatar/pro/available — Check if D-ID Pro is available. */
    public function available(array $params, array $body): void
    {
        $user = Auth::requireUser();
        echo json_encode([
            'available' => $this->didService->isAvailable(),
            'paid_plan' => ($user['plan_tier'] ?? 'free') !== 'free',
        ]);
    }
}
