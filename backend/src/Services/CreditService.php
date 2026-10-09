<?php
declare(strict_types=1);

namespace Contentine\Services;

use Contentine\Database;

/** Manages feature credit costs, user balances, and atomic deductions. */
class CreditService
{
    /** Check if user can afford a feature. Returns cost (0 = free). Throws if feature is inactive. */
    public function getFeatureCost(string $featureKey): int
    {
        $config = Database::fetch(
            "SELECT credit_cost, is_active FROM feature_credit_config WHERE feature_key = ?",
            [$featureKey]
        );
        if (!$config) {
            return 0; // Unknown features are free (fail-open for new features)
        }
        if (!$config['is_active']) {
            throw new \RuntimeException("Feature '{$featureKey}' is currently disabled.");
        }
        return (int) $config['credit_cost'];
    }

    /** Get user's current balance. Creates record if none exists. */
    public function getBalance(int $userId): int
    {
        $row = Database::fetch("SELECT balance FROM user_credits WHERE user_id = ?", [$userId]);
        if (!$row) {
            Database::query("INSERT INTO user_credits (user_id, balance) VALUES (?, 0)", [$userId]);
            return 0;
        }
        return (int) $row['balance'];
    }

    /** Get the tier multiplier for a feature. Returns multiplier value for the given tier. */
    public function getTierMultiplier(string $featureKey, string $tier): float
    {
        if ($tier === 'browser') return 1.0;

        $config = Database::fetch(
            "SELECT api_multiplier, byok_multiplier FROM feature_credit_config WHERE feature_key = ?",
            [$featureKey]
        );
        if (!$config) return 1.0;

        return match ($tier) {
            'api'  => (float) ($config['api_multiplier'] ?? 3.0),
            'byok' => (float) ($config['byok_multiplier'] ?? 1.0),
            default => 1.0,
        };
    }

    /** Check if user can use a feature. Tier-aware: applies multiplier for api/byok tiers. */
    public function canUseFeature(int $userId, string $featureKey, string $tier = 'browser'): array
    {
        $baseCost = $this->getFeatureCost($featureKey);
        $multiplier = $this->getTierMultiplier($featureKey, $tier);
        $cost = (int) ceil($baseCost * $multiplier);

        if ($cost === 0) {
            return ['allowed' => true, 'cost' => 0, 'balance' => $this->getBalance($userId), 'is_promo' => true, 'tier' => $tier];
        }
        $balance = $this->getBalance($userId);
        return [
            'allowed'  => $balance >= $cost,
            'cost'     => $cost,
            'balance'  => $balance,
            'is_promo' => false,
            'tier'     => $tier,
        ];
    }

    /** Deduct credits for using a feature. Tier-aware with multiplier. Atomic with transaction. */
    public function deductForFeature(int $userId, string $featureKey, string $tier = 'browser', ?string $referenceId = null): array
    {
        $baseCost = $this->getFeatureCost($featureKey);
        $multiplier = $this->getTierMultiplier($featureKey, $tier);
        $cost = (int) ceil($baseCost * $multiplier);

        if ($cost === 0) {
            return ['deducted' => true, 'cost' => 0, 'balance' => $this->getBalance($userId), 'is_promo' => true, 'tier' => $tier];
        }

        $pdo = Database::connection();
        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare("SELECT balance FROM user_credits WHERE user_id = ? FOR UPDATE");
            $stmt->execute([$userId]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);

            if (!$row || (int)$row['balance'] < $cost) {
                $pdo->rollBack();
                return [
                    'deducted'  => false, 'cost' => $cost,
                    'balance'   => $row ? (int)$row['balance'] : 0,
                    'shortfall' => $cost - ($row ? (int)$row['balance'] : 0),
                    'is_promo'  => false,
                    'tier'      => $tier,
                ];
            }

            $newBalance = (int)$row['balance'] - $cost;
            Database::query(
                "UPDATE user_credits SET balance = ?, lifetime_spent = lifetime_spent + ? WHERE user_id = ?",
                [$newBalance, $cost, $userId]
            );
            Database::query(
                "INSERT INTO credit_transactions (user_id, type, amount, balance_after, feature_key, reference_id, description) VALUES (?, 'deduction', ?, ?, ?, ?, ?)",
                [$userId, -$cost, $newBalance, $featureKey, $referenceId, "Used: {$featureKey} (tier: {$tier})"]
            );

            $pdo->commit();
            return ['deducted' => true, 'cost' => $cost, 'balance' => $newBalance, 'is_promo' => false, 'tier' => $tier];
        } catch (\Exception $e) {
            $pdo->rollBack();
            throw $e;
        }
    }

    /**
     * Refund a failed job's credits (F-50 auto-refund). Idempotent per reference_id: refunds the
     * exact amount of the original deduction at most once. A no-op when no deduction exists for the
     * reference (e.g. browser-native work is never metered, so nothing to give back).
     */
    public function refund(int $userId, string $referenceId, ?string $reason = null): array
    {
        $pdo = Database::connection();
        $pdo->beginTransaction();
        try {
            // The charge to reverse: the original deduction for this reference (negative amount).
            $stmt = $pdo->prepare(
                "SELECT amount, feature_key FROM credit_transactions
                 WHERE user_id = ? AND reference_id = ? AND type = 'deduction'
                 ORDER BY id ASC LIMIT 1 FOR UPDATE"
            );
            $stmt->execute([$userId, $referenceId]);
            $deduction = $stmt->fetch(\PDO::FETCH_ASSOC);

            if (!$deduction) {
                $pdo->commit();
                return ['refunded' => false, 'reason' => 'no_matching_charge', 'amount' => 0];
            }

            // Idempotency: a reference is refunded once.
            $existing = $pdo->prepare(
                "SELECT id FROM credit_transactions WHERE user_id = ? AND reference_id = ? AND type = 'refund' LIMIT 1"
            );
            $existing->execute([$userId, $referenceId]);
            if ($existing->fetch(\PDO::FETCH_ASSOC)) {
                $pdo->commit();
                return ['refunded' => false, 'reason' => 'already_refunded', 'amount' => 0];
            }

            $amount = abs((int) $deduction['amount']); // deduction stored negative → refund positive
            $featureKey = $deduction['feature_key'];

            $balStmt = $pdo->prepare("SELECT balance FROM user_credits WHERE user_id = ? FOR UPDATE");
            $balStmt->execute([$userId]);
            $row = $balStmt->fetch(\PDO::FETCH_ASSOC);
            $current = $row ? (int) $row['balance'] : 0;
            $newBalance = $current + $amount;

            if ($row) {
                Database::query(
                    "UPDATE user_credits SET balance = ?, lifetime_spent = GREATEST(0, lifetime_spent - ?) WHERE user_id = ?",
                    [$newBalance, $amount, $userId]
                );
            } else {
                Database::query("INSERT INTO user_credits (user_id, balance) VALUES (?, ?)", [$userId, $newBalance]);
            }

            Database::query(
                "INSERT INTO credit_transactions (user_id, type, amount, balance_after, feature_key, reference_id, description)
                 VALUES (?, 'refund', ?, ?, ?, ?, ?)",
                [$userId, $amount, $newBalance, $featureKey, $referenceId, $reason ?? "Auto-refund: failed job ({$featureKey})"]
            );

            $pdo->commit();
            return ['refunded' => true, 'amount' => $amount, 'balance' => $newBalance, 'feature_key' => $featureKey];
        } catch (\Exception $e) {
            $pdo->rollBack();
            throw $e;
        }
    }

    /** Add credits from pack purchase. */
    public function addCredits(int $userId, int $amount, string $type = 'purchase', ?string $referenceId = null, ?string $description = null): int
    {
        $pdo = Database::connection();
        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare("SELECT balance FROM user_credits WHERE user_id = ? FOR UPDATE");
            $stmt->execute([$userId]);
            $row = $stmt->fetch(\PDO::FETCH_ASSOC);

            if (!$row) {
                Database::query(
                    "INSERT INTO user_credits (user_id, balance, lifetime_purchased) VALUES (?, ?, ?)",
                    [$userId, $amount, $type === 'purchase' ? $amount : 0]
                );
                $newBalance = $amount;
            } else {
                $newBalance = (int)$row['balance'] + $amount;
                Database::query(
                    "UPDATE user_credits SET balance = ?, lifetime_purchased = lifetime_purchased + ? WHERE user_id = ?",
                    [$newBalance, $type === 'purchase' ? $amount : 0, $userId]
                );
            }
            Database::query(
                "INSERT INTO credit_transactions (user_id, type, amount, balance_after, reference_id, description) VALUES (?, ?, ?, ?, ?, ?)",
                [$userId, $type, $amount, $newBalance, $referenceId, $description ?? "Added {$amount} credits"]
            );
            $pdo->commit();
            return $newBalance;
        } catch (\Exception $e) {
            $pdo->rollBack();
            throw $e;
        }
    }

    /** Get all feature configs (for admin dashboard). */
    public function getAllFeatureConfigs(): array
    {
        return Database::fetchAll("SELECT * FROM feature_credit_config ORDER BY feature_group, feature_label");
    }

    /** Admin: update credit cost for a feature. */
    public function updateFeatureCost(string $featureKey, int $cost, ?string $promoLabel = null): bool
    {
        if ($promoLabel !== null) {
            Database::query(
                "UPDATE feature_credit_config SET credit_cost = ?, promo_label = ? WHERE feature_key = ?",
                [$cost, $promoLabel, $featureKey]
            );
        } else {
            Database::query(
                "UPDATE feature_credit_config SET credit_cost = ? WHERE feature_key = ?",
                [$cost, $featureKey]
            );
        }
        return true;
    }

    /** Get transaction history for a user. */
    public function getTransactions(int $userId, int $limit = 50, int $offset = 0): array
    {
        return Database::fetchAll(
            "SELECT * FROM credit_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
            [$userId, $limit, $offset]
        );
    }

    /** Get all credit packs (active). */
    public function getActivePacks(): array
    {
        return Database::fetchAll("SELECT * FROM credit_packs WHERE is_active = 1 ORDER BY sort_order");
    }

    /** Admin: get all packs. */
    public function getAllPacks(): array
    {
        return Database::fetchAll("SELECT * FROM credit_packs ORDER BY sort_order");
    }

    /** Admin: create a new credit pack. */
    public function createPack(array $data): int
    {
        return Database::insert('credit_packs', $data);
    }

    /** Admin: update a credit pack. */
    public function updatePack(int $id, array $data): void
    {
        Database::update('credit_packs', $data, 'id = ?', [$id]);
    }

    /** Admin: delete a credit pack. */
    public function deletePack(int $id): void
    {
        Database::delete('credit_packs', 'id = ?', [$id]);
    }

    /** Admin: get aggregated stats. */
    public function getStats(): array
    {
        $totalSold = Database::fetch(
            "SELECT COALESCE(SUM(amount), 0) AS total FROM credit_transactions WHERE type = 'purchase'"
        );
        $totalRevenue = Database::fetch(
            "SELECT COALESCE(SUM(price_cents), 0) AS total FROM credit_packs WHERE is_active = 1"
        );
        $totalUsers = Database::fetch("SELECT COUNT(*) AS total FROM user_credits WHERE balance > 0");
        $topFeatures = Database::fetchAll(
            "SELECT feature_key, COUNT(*) AS usage_count, SUM(ABS(amount)) AS credits_spent FROM credit_transactions WHERE type = 'deduction' GROUP BY feature_key ORDER BY usage_count DESC LIMIT 10"
        );
        return [
            'total_credits_sold'  => (int) ($totalSold['total'] ?? 0),
            'active_credit_users' => (int) ($totalUsers['total'] ?? 0),
            'top_features'        => $topFeatures,
        ];
    }
}
