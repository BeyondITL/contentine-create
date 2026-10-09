<?php
declare(strict_types=1);

namespace Contentine\Services;

use Contentine\Database;

/** Resolves available AI providers for a feature + user combination (three-tier system). */
class AiProviderService
{
    private ApiKeyService $keyService;
    private EncryptionService $crypto;

    public function __construct()
    {
        $this->keyService = new ApiKeyService();
        $this->crypto = new EncryptionService();
    }

    /** Get available AI providers for a feature + user. Returns tiers the user can choose from. */
    public function getAvailableProviders(int $userId, string $featureKey): array
    {
        $config = Database::fetch(
            "SELECT * FROM feature_credit_config WHERE feature_key = ?",
            [$featureKey]
        );

        if (!$config) {
            return ['providers' => [['tier' => 'browser', 'label' => 'Standard (Browser)', 'multiplier' => 1.0, 'credit_cost' => 0]], 'default' => 'browser'];
        }

        $providers = [];
        $baseCost = (int) $config['credit_cost'];

        // Browser-native always available if feature supports it
        if (!empty($config['supports_browser'])) {
            $providers[] = [
                'tier' => 'browser',
                'label' => 'Standard (Browser)',
                'engine' => $config['browser_engine'] ?? null,
                'multiplier' => 1.0,
                'credit_cost' => $baseCost,
            ];
        }

        // System API — check each service in the comma-separated list
        if (!empty($config['supports_api']) && !empty($config['api_service'])) {
            $services = array_map('trim', explode(',', $config['api_service']));
            foreach ($services as $service) {
                $systemKey = $this->keyService->getKey($service);
                if ($systemKey) {
                    $svcInfo = Database::fetch("SELECT display_name FROM system_services WHERE service = ?", [$service]);
                    $providers[] = [
                        'tier' => 'api',
                        'label' => 'Premium — ' . ($svcInfo['display_name'] ?? ucfirst($service)),
                        'service' => $service,
                        'multiplier' => (float) ($config['api_multiplier'] ?? 3.0),
                        'credit_cost' => (int) ceil($baseCost * (float) ($config['api_multiplier'] ?? 3.0)),
                    ];
                }
            }
        }

        // BYOK — check each service for user keys
        if (!empty($config['supports_byok']) && !empty($config['api_service'])) {
            $services = array_map('trim', explode(',', $config['api_service']));
            foreach ($services as $service) {
                $userKey = Database::fetch(
                    "SELECT id FROM user_api_keys WHERE user_id = ? AND service = ? AND is_active = 1",
                    [$userId, $service]
                );
                if ($userKey) {
                    $svcInfo = Database::fetch("SELECT display_name FROM system_services WHERE service = ?", [$service]);
                    $providers[] = [
                        'tier' => 'byok',
                        'label' => 'My Key — ' . ($svcInfo['display_name'] ?? ucfirst($service)),
                        'service' => $service,
                        'multiplier' => (float) ($config['byok_multiplier'] ?? 1.0),
                        'credit_cost' => (int) ceil($baseCost * (float) ($config['byok_multiplier'] ?? 1.0)),
                    ];
                }
            }
        }

        // Default: browser if available, otherwise first available
        $default = 'browser';
        if (empty($providers)) {
            $providers[] = ['tier' => 'browser', 'label' => 'Standard', 'multiplier' => 1.0, 'credit_cost' => 0];
        } elseif (empty($config['supports_browser'])) {
            $default = $providers[0]['tier'] ?? 'browser';
        }

        return ['providers' => $providers, 'default' => $default];
    }

    /** Resolve the API key for a given tier + service. */
    public function resolveApiKey(int $userId, string $service, string $tier): ?string
    {
        if ($tier === 'browser') {
            return null;
        }

        if ($tier === 'api') {
            $keyInfo = $this->keyService->getKey($service);
            return $keyInfo ? $keyInfo['api_key'] : null;
        }

        if ($tier === 'byok') {
            $userKey = Database::fetch(
                "SELECT encrypted_key, encryption_iv, encryption_tag FROM user_api_keys WHERE user_id = ? AND service = ? AND is_active = 1",
                [$userId, $service]
            );
            if (!$userKey) return null;

            // Update last_used_at
            Database::query("UPDATE user_api_keys SET last_used_at = NOW() WHERE user_id = ? AND service = ?", [$userId, $service]);

            return $this->crypto->decrypt($userKey['encrypted_key'], $userKey['encryption_iv'], $userKey['encryption_tag']);
        }

        return null;
    }
}
