<?php
declare(strict_types=1);

namespace Contentine\Controllers;

use Contentine\Auth;
use Contentine\Services\CreditService;
use Contentine\Middleware\InputValidator;

/** User-facing credit endpoints: balance, transactions, packs, check, deduct, purchase. */
class CreditController
{
    private CreditService $credits;

    public function __construct()
    {
        $this->credits = new CreditService();
    }

    /** GET /api/credits/balance — Get user's credit balance. */
    public function balance(array $params, array $body): void
    {
        $user = Auth::requireUser();
        $balance = $this->credits->getBalance((int) $user['id']);
        echo json_encode(['balance' => $balance]);
    }

    /** GET /api/credits/transactions — Get user's transaction history. */
    public function transactions(array $params, array $body): void
    {
        $user = Auth::requireUser();
        $limit = min(100, max(1, (int) ($_GET['limit'] ?? 50)));
        $offset = max(0, (int) ($_GET['offset'] ?? 0));
        $transactions = $this->credits->getTransactions((int) $user['id'], $limit, $offset);
        echo json_encode(['transactions' => $transactions]);
    }

    /** GET /api/credits/packs — Get available credit packs. */
    public function packs(array $params, array $body): void
    {
        $packs = $this->credits->getActivePacks();
        echo json_encode(['packs' => $packs]);
    }

    /** POST /api/credits/purchase — Purchase a credit pack via Stripe one-time checkout. */
    public function purchase(array $params, array $body): void
    {
        $user = Auth::requireUser();
        $data = InputValidator::sanitize($body, ['pack_id' => 'required|int']);

        $packs = $this->credits->getActivePacks();
        $pack = null;
        foreach ($packs as $p) {
            if ((int) $p['id'] === (int) $data['pack_id']) {
                $pack = $p;
                break;
            }
        }

        if (!$pack) {
            http_response_code(404);
            echo json_encode(['error' => 'Credit pack not found']);
            return;
        }

        // Create Stripe Checkout Session for one-time payment
        $keyService = new \Contentine\Services\ApiKeyService();
        $keyInfo = $keyService->getKey('stripe');
        if (!$keyInfo) {
            http_response_code(500);
            echo json_encode(['error' => 'Payment service not configured']);
            return;
        }

        \Stripe\Stripe::setApiKey($keyInfo['api_key']);

        try {
            $config = require __DIR__ . '/../../config.php';
            $appUrl = $config['app']['url'] ?? 'https://contentine.ai';
            $session = \Stripe\Checkout\Session::create([
                'payment_method_types' => ['card'],
                'line_items' => [[
                    'price_data' => [
                        'currency' => 'usd',
                        'product_data' => [
                            'name' => $pack['name'] . ' — ' . $pack['credits'] . ' Credits',
                        ],
                        'unit_amount' => (int) $pack['price_cents'],
                    ],
                    'quantity' => 1,
                ]],
                'mode' => 'payment',
                'success_url' => $appUrl . '/credits/success?session_id={CHECKOUT_SESSION_ID}',
                'cancel_url'  => $appUrl . '/credits',
                'metadata' => [
                    'user_id' => (string) $user['id'],
                    'pack_id' => (string) $pack['id'],
                    'credits' => (string) $pack['credits'],
                ],
            ]);

            $keyService->recordUsage($keyInfo['key_id'], 'stripe', '/v1/checkout/sessions', 1, 200);
            echo json_encode(['checkout_url' => $session->url]);
        } catch (\Exception $e) {
            $keyService->recordUsage($keyInfo['key_id'], 'stripe', '/v1/checkout/sessions', 1, 500, $e->getMessage());
            http_response_code(500);
            echo json_encode(['error' => 'Failed to create checkout session']);
        }
    }

    /** POST /api/credits/check — Check if user can use a feature (tier-aware quote for F-50). */
    public function check(array $params, array $body): void
    {
        $user = Auth::requireUser();
        $data = InputValidator::sanitize($body, [
            'feature_key' => 'required|string|max:100',
            'tier'        => 'nullable|string|max:20',
        ]);
        $tier = $this->normalizeTier($data['tier'] ?? 'browser');
        $result = $this->credits->canUseFeature((int) $user['id'], $data['feature_key'], $tier);
        echo json_encode($result);
    }

    /** POST /api/credits/deduct — Deduct credits for a feature (tier-aware; records reference_id). */
    public function deduct(array $params, array $body): void
    {
        $user = Auth::requireUser();
        $data = InputValidator::sanitize($body, [
            'feature_key'  => 'required|string|max:100',
            'tier'         => 'nullable|string|max:20',
            'reference_id' => 'nullable|string|max:200',
        ]);

        $tier = $this->normalizeTier($data['tier'] ?? 'browser');
        $result = $this->credits->deductForFeature(
            (int) $user['id'],
            $data['feature_key'],
            $tier,
            $data['reference_id'] ?? null
        );

        if (!$result['deducted'] && !($result['is_promo'] ?? false)) {
            http_response_code(402);
            echo json_encode([
                'error' => 'insufficient_credits',
                'cost' => $result['cost'],
                'balance' => $result['balance'],
                'shortfall' => $result['shortfall'] ?? 0,
            ]);
            return;
        }

        echo json_encode($result);
    }

    /** POST /api/credits/refund — Refund a failed job's credits (F-50 auto-refund; idempotent). */
    public function refund(array $params, array $body): void
    {
        $user = Auth::requireUser();
        $data = InputValidator::sanitize($body, [
            'reference_id' => 'required|string|max:200',
            'reason'       => 'nullable|string|max:200',
        ]);

        $result = $this->credits->refund(
            (int) $user['id'],
            $data['reference_id'],
            $data['reason'] ?? null
        );
        echo json_encode($result);
    }

    /** Clamp a client-supplied tier to the three valid metering tiers. */
    private function normalizeTier(string $tier): string
    {
        return in_array($tier, ['browser', 'api', 'byok'], true) ? $tier : 'browser';
    }
}
