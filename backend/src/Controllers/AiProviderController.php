<?php
declare(strict_types=1);

namespace Contentine\Controllers;

use Contentine\Auth;
use Contentine\Services\AiProviderService;

/** Returns available AI providers for a feature. */
class AiProviderController
{
    /** GET /api/ai/providers/{feature_key} */
    public function available(array $params): void
    {
        $user = Auth::requireUser();
        $userId = (int) $user['id'];
        $featureKey = $params['feature_key'] ?? '';

        if (!$featureKey) {
            http_response_code(400);
            echo json_encode(['error' => 'feature_key is required']);
            return;
        }

        $providerService = new AiProviderService();
        $result = $providerService->getAvailableProviders($userId, $featureKey);

        echo json_encode($result);
    }
}
