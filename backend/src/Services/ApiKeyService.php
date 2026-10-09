<?php
declare(strict_types=1);

namespace Contentine\Services;

use Contentine\Database;

/** Multi-key rotation with automatic fallback for third-party API keys. */
class ApiKeyService
{
    private EncryptionService $encryption;

    public function __construct()
    {
        $this->encryption = new EncryptionService();
    }

    /**
     * Get the best available API key for a service.
     * Picks the active key with lowest usage relative to its limits.
     * Resets expired counters automatically. Returns null if all exhausted.
     */
    public function getKey(string $service): ?array
    {
        $keys = Database::fetchAll(
            "SELECT * FROM system_api_keys WHERE service = ? AND is_active = 1 ORDER BY priority ASC, daily_usage ASC",
            [$service]
        );

        if (empty($keys)) {
            return null;
        }

        $now = new \DateTimeImmutable();

        foreach ($keys as $key) {
            // Reset daily counter if expired
            if ($key['daily_reset_at'] && new \DateTimeImmutable($key['daily_reset_at']) <= $now) {
                Database::query(
                    "UPDATE system_api_keys SET daily_usage = 0, daily_reset_at = DATE_ADD(NOW(), INTERVAL 1 DAY) WHERE id = ?",
                    [$key['id']]
                );
                $key['daily_usage'] = 0;
            }

            // Reset hourly counter if expired
            if ($key['hourly_reset_at'] && new \DateTimeImmutable($key['hourly_reset_at']) <= $now) {
                Database::query(
                    "UPDATE system_api_keys SET hourly_usage = 0, hourly_reset_at = DATE_ADD(NOW(), INTERVAL 1 HOUR) WHERE id = ?",
                    [$key['id']]
                );
                $key['hourly_usage'] = 0;
            }

            // Check limits (0 means unlimited)
            $dailyOk = $key['daily_limit'] === 0 || (int)$key['daily_usage'] < (int)$key['daily_limit'];
            $hourlyOk = $key['hourly_limit'] === 0 || (int)$key['hourly_usage'] < (int)$key['hourly_limit'];

            if ($dailyOk && $hourlyOk) {
                // Decrypt and return
                $decryptedKey = $this->encryption->decrypt(
                    $key['encrypted_key'],
                    $key['encryption_iv'],
                    $key['encryption_tag']
                );

                return [
                    'key_id'  => (int) $key['id'],
                    'api_key' => $decryptedKey,
                    'label'   => $key['label'],
                    'service' => $key['service'],
                ];
            }
        }

        return null; // All keys exhausted
    }

    /** Record API usage for a key. */
    public function recordUsage(int $keyId, string $service, string $endpoint, int $units = 1, int $responseCode = 200, ?string $error = null): void
    {
        Database::query(
            "UPDATE system_api_keys SET daily_usage = daily_usage + ?, hourly_usage = hourly_usage + ?, last_used_at = NOW() WHERE id = ?",
            [$units, $units, $keyId]
        );

        // Initialize reset timers if not set
        Database::query(
            "UPDATE system_api_keys SET daily_reset_at = COALESCE(daily_reset_at, DATE_ADD(NOW(), INTERVAL 1 DAY)), hourly_reset_at = COALESCE(hourly_reset_at, DATE_ADD(NOW(), INTERVAL 1 HOUR)) WHERE id = ?",
            [$keyId]
        );

        Database::query(
            "INSERT INTO api_key_usage_log (key_id, service, endpoint, units_consumed, response_code, error_message) VALUES (?, ?, ?, ?, ?, ?)",
            [$keyId, $service, $endpoint, $units, $responseCode, $error]
        );
    }

    /** Report a key failure for admin visibility. */
    public function reportKeyFailure(int $keyId, string $error): void
    {
        Database::query(
            "UPDATE system_api_keys SET last_error = ?, last_error_at = NOW() WHERE id = ?",
            [substr($error, 0, 500), $keyId]
        );
    }

    /** Add a new encrypted API key. */
    public function addKey(string $service, string $label, string $plaintextKey, int $dailyLimit = 0, int $hourlyLimit = 0, int $priority = 0): int
    {
        $encrypted = $this->encryption->encrypt($plaintextKey);

        return Database::insert('system_api_keys', [
            'service'        => $service,
            'label'          => $label,
            'encrypted_key'  => $encrypted['encrypted'],
            'encryption_iv'  => $encrypted['iv'],
            'encryption_tag' => $encrypted['tag'],
            'daily_limit'    => $dailyLimit,
            'hourly_limit'   => $hourlyLimit,
            'priority'       => $priority,
        ]);
    }

    /** Rotate a key — re-encrypt with a new plaintext key. */
    public function rotateKey(int $keyId, string $newPlaintextKey): void
    {
        $encrypted = $this->encryption->encrypt($newPlaintextKey);

        Database::update('system_api_keys', [
            'encrypted_key'  => $encrypted['encrypted'],
            'encryption_iv'  => $encrypted['iv'],
            'encryption_tag' => $encrypted['tag'],
            'daily_usage'    => 0,
            'hourly_usage'   => 0,
            'last_error'     => null,
            'last_error_at'  => null,
        ], 'id = ?', [$keyId]);
    }

    /** Update key settings (limits, priority, active status). */
    public function updateKeySettings(int $keyId, array $data): void
    {
        $allowed = ['label', 'daily_limit', 'hourly_limit', 'priority', 'is_active'];
        $filtered = array_intersect_key($data, array_flip($allowed));
        if (!empty($filtered)) {
            Database::update('system_api_keys', $filtered, 'id = ?', [$keyId]);
        }
    }

    /** Permanently delete a key. */
    public function deleteKey(int $keyId): void
    {
        Database::delete('system_api_keys', 'id = ?', [$keyId]);
    }

    /** Get all keys for a service (NEVER returns decrypted keys). */
    public function getKeysForService(string $service): array
    {
        $keys = Database::fetchAll(
            "SELECT id, service, label, daily_limit, hourly_limit, daily_usage, hourly_usage, priority, is_active, last_error, last_error_at, last_used_at, created_at FROM system_api_keys WHERE service = ? ORDER BY priority ASC",
            [$service]
        );

        // Add health status
        foreach ($keys as &$key) {
            $key['health'] = $this->calculateHealth($key);
        }

        return $keys;
    }

    /** Get overview of all services with key count and health. */
    public function getServiceOverview(): array
    {
        $services = Database::fetchAll("SELECT * FROM system_services ORDER BY required DESC, display_name ASC");

        foreach ($services as &$service) {
            $keyStats = Database::fetch(
                "SELECT COUNT(*) AS key_count, SUM(is_active) AS active_count, MAX(last_used_at) AS last_used FROM system_api_keys WHERE service = ?",
                [$service['service']]
            );
            $service['key_count'] = (int) ($keyStats['key_count'] ?? 0);
            $service['active_keys'] = (int) ($keyStats['active_count'] ?? 0);
            $service['last_used'] = $keyStats['last_used'];
            $service['health'] = $service['key_count'] > 0
                ? ($service['active_keys'] > 0 ? 'healthy' : 'error')
                : ($service['required'] ? 'missing' : 'not_configured');
        }

        return $services;
    }

    /** Get usage stats for a service over a period. */
    public function getUsageStats(string $service, string $period = '7d'): array
    {
        $interval = match ($period) {
            '24h' => '1 DAY',
            '7d'  => '7 DAY',
            '30d' => '30 DAY',
            default => '7 DAY',
        };

        return Database::fetchAll(
            "SELECT DATE(created_at) AS date, SUM(units_consumed) AS total_units, COUNT(*) AS request_count, SUM(CASE WHEN response_code >= 400 THEN 1 ELSE 0 END) AS error_count FROM api_key_usage_log WHERE service = ? AND created_at > DATE_SUB(NOW(), INTERVAL {$interval}) GROUP BY DATE(created_at) ORDER BY date ASC",
            [$service]
        );
    }

    /** Calculate health status for a key. */
    private function calculateHealth(array $key): string
    {
        if (!$key['is_active']) return 'disabled';
        if ($key['last_error_at'] && strtotime($key['last_error_at']) > strtotime('-1 hour')) return 'error';

        $dailyPercent = $key['daily_limit'] > 0 ? ($key['daily_usage'] / $key['daily_limit']) : 0;
        $hourlyPercent = $key['hourly_limit'] > 0 ? ($key['hourly_usage'] / $key['hourly_limit']) : 0;

        $maxPercent = max($dailyPercent, $hourlyPercent);
        if ($maxPercent >= 0.9) return 'critical';
        if ($maxPercent >= 0.7) return 'warning';
        return 'healthy';
    }
}
