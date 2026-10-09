<?php

declare(strict_types=1);

namespace Contentine\Controllers;

/** Lightweight availability probe — responds without touching the DB. */
class HealthController
{
    /**
     * GET /api/health — Returns HTTP 200 {"status":"ok"}.
     * Used by deploy.sh and verify.sh as the API availability gate (WS-8 task #1).
     */
    public function check(array $params, array $body): void
    {
        echo json_encode(['status' => 'ok']);
    }
}
