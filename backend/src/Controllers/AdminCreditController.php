<?php
declare(strict_types=1);

namespace Contentine\Controllers;

use Contentine\Auth;
use Contentine\Database;
use Contentine\Services\CreditService;
use Contentine\Middleware\AdminMiddleware;
use Contentine\Middleware\InputValidator;

/** Admin credit management: feature pricing, packs, grants, stats. */
class AdminCreditController
{
    private CreditService $credits;

    public function __construct()
    {
        $this->credits = new CreditService();
    }

    /** GET /api/admin/credits/features — List all feature credit configs. */
    public function features(array $params, array $body): void
    {
        Auth::requireUser();
        AdminMiddleware::verify();
        echo json_encode(['features' => $this->credits->getAllFeatureConfigs()]);
    }

    /** PUT /api/admin/credits/features/{key} — Update credit cost and multipliers for a feature. */
    public function updateFeature(array $params, array $body): void
    {
        Auth::requireUser();
        AdminMiddleware::verify();

        $featureKey = $params['key'] ?? '';
        $data = InputValidator::sanitize($body, [
            'credit_cost'     => 'required|int|min:0',
            'api_multiplier'  => 'nullable|numeric',
            'byok_multiplier' => 'nullable|numeric',
            'promo_label'     => 'nullable|string|max:100',
        ]);

        // Update base cost + promo
        $this->credits->updateFeatureCost($featureKey, (int) $data['credit_cost'], $data['promo_label'] ?? null);

        // Update multipliers if provided
        $updates = [];
        if (isset($data['api_multiplier'])) {
            $updates['api_multiplier'] = (float) $data['api_multiplier'];
        }
        if (isset($data['byok_multiplier'])) {
            $updates['byok_multiplier'] = (float) $data['byok_multiplier'];
        }
        if (!empty($updates)) {
            $sets = [];
            $vals = [];
            foreach ($updates as $col => $val) {
                $sets[] = "{$col} = ?";
                $vals[] = $val;
            }
            $vals[] = $featureKey;
            Database::query(
                "UPDATE feature_credit_config SET " . implode(', ', $sets) . " WHERE feature_key = ?",
                $vals
            );
        }

        echo json_encode(['success' => true]);
    }

    /** GET /api/admin/credits/packs — List all credit packs (including inactive). */
    public function packs(array $params, array $body): void
    {
        Auth::requireUser();
        AdminMiddleware::verify();
        echo json_encode(['packs' => $this->credits->getAllPacks()]);
    }

    /** POST /api/admin/credits/packs — Create a new credit pack. */
    public function createPack(array $params, array $body): void
    {
        Auth::requireUser();
        AdminMiddleware::verify();

        $data = InputValidator::sanitize($body, [
            'name'        => 'required|string|max:100',
            'credits'     => 'required|int|min:1',
            'price_cents' => 'required|int|min:1',
            'badge_label' => 'nullable|string|max:50',
            'badge_color' => 'nullable|string|max:20',
            'sort_order'  => 'nullable|int',
            'is_featured' => 'nullable|bool',
        ]);

        $id = $this->credits->createPack($data);
        echo json_encode(['id' => $id, 'success' => true]);
    }

    /** PUT /api/admin/credits/packs/{id} — Update a credit pack. */
    public function updatePack(array $params, array $body): void
    {
        Auth::requireUser();
        AdminMiddleware::verify();

        $id = (int) ($params['id'] ?? 0);
        $data = InputValidator::sanitize($body, [
            'name'        => 'nullable|string|max:100',
            'credits'     => 'nullable|int|min:1',
            'price_cents' => 'nullable|int|min:1',
            'badge_label' => 'nullable|string|max:50',
            'badge_color' => 'nullable|string|max:20',
            'sort_order'  => 'nullable|int',
            'is_active'   => 'nullable|bool',
            'is_featured' => 'nullable|bool',
        ]);

        $this->credits->updatePack($id, array_filter($data, fn($v) => $v !== null));
        echo json_encode(['success' => true]);
    }

    /** DELETE /api/admin/credits/packs/{id} — Delete a credit pack. */
    public function deletePack(array $params, array $body): void
    {
        Auth::requireUser();
        AdminMiddleware::verify();

        $id = (int) ($params['id'] ?? 0);
        $this->credits->deletePack($id);
        echo json_encode(['success' => true]);
    }

    /** POST /api/admin/credits/grant — Grant credits to a user. */
    public function grantCredits(array $params, array $body): void
    {
        Auth::requireUser();
        AdminMiddleware::verify();

        $data = InputValidator::sanitize($body, [
            'user_id' => 'required|int',
            'amount'  => 'required|int|min:1',
            'note'    => 'nullable|string|max:500',
        ]);

        $newBalance = $this->credits->addCredits(
            (int) $data['user_id'],
            (int) $data['amount'],
            'admin_grant',
            null,
            $data['note'] ?? 'Admin grant'
        );

        echo json_encode(['success' => true, 'new_balance' => $newBalance]);
    }

    /** GET /api/admin/credits/stats — Get aggregated credit stats. */
    public function stats(array $params, array $body): void
    {
        Auth::requireUser();
        AdminMiddleware::verify();
        echo json_encode($this->credits->getStats());
    }
}
