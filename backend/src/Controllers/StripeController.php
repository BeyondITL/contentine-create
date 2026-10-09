<?php

declare(strict_types=1);

namespace Contentine\Controllers;

use Contentine\Auth;
use Contentine\Database;
use Contentine\Services\ApiKeyService;

/** Handles Stripe checkout, billing portal, webhook events, and plan listing for subscription management. */
class StripeController
{
    private ApiKeyService $keyService;
    private array $config;

    public function __construct()
    {
        $this->keyService = new ApiKeyService();
        $this->config = require __DIR__ . '/../../config.php';
    }

    /** Plan ID → plan tier mapping. */
    private const PRICE_TO_TIER = [
        'price_starter_monthly'      => 'starter',
        'price_professional_monthly' => 'professional',
        'price_business_monthly'     => 'business',
        'price_enterprise_monthly'   => 'enterprise',
    ];

    /** Static plan details returned by getPlans(). */
    private const PLANS = [
        [
            'id'          => 'starter',
            'name'        => 'Starter',
            'price'       => 19,
            'currency'    => 'usd',
            'interval'    => 'month',
            'price_id'    => 'price_starter_monthly',
            'recommended' => false,
            'features'    => [
                'Unlimited video creation',
                '50+ AI voices',
                '30+ avatar presets',
                'Content Remix Hub',
                'AI Writer (6 content types)',
                'Idea discovery (8 platforms)',
                '3 social account connections',
                '720p export',
            ],
        ],
        [
            'id'          => 'professional',
            'name'        => 'Professional',
            'price'       => 49,
            'currency'    => 'usd',
            'interval'    => 'month',
            'price_id'    => 'price_professional_monthly',
            'recommended' => true,
            'features'    => [
                'Everything in Starter',
                '1080p export',
                'Unlimited social accounts',
                'Bulk scheduling (CSV import)',
                'Analytics dashboard',
                'Performance alerts',
                'Thumbnail generator',
                'Priority rendering',
            ],
        ],
        [
            'id'          => 'business',
            'name'        => 'Business',
            'price'       => 99,
            'currency'    => 'usd',
            'interval'    => 'month',
            'price_id'    => 'price_business_monthly',
            'recommended' => false,
            'features'    => [
                'Everything in Professional',
                '4K export',
                'Team workspace (up to 5 members)',
                'Team activity log',
                'Custom CTA templates',
                'Real avatar clone requests',
                'API access',
                'Dedicated support',
            ],
        ],
        [
            'id'          => 'enterprise',
            'name'        => 'Enterprise',
            'price'       => 249,
            'currency'    => 'usd',
            'interval'    => 'month',
            'price_id'    => 'price_enterprise_monthly',
            'recommended' => false,
            'features'    => [
                'Everything in Business',
                'Unlimited team members',
                'White-label export',
                'Custom AI model fine-tuning',
                'SSO / SAML',
                'Dedicated account manager',
                'Custom integrations',
                'SLA guarantee',
            ],
        ],
    ];

    // ──────────────────────────────────────────────
    // Checkout Session
    // ──────────────────────────────────────────────

    /** POST /api/stripe/checkout — Create a Stripe Checkout session for plan upgrade. */
    public function createCheckoutSession(array $params, array $body): void
    {
        $user = Auth::requireUser();

        $plan = $body['plan'] ?? '';
        $validPlans = ['starter', 'professional', 'business', 'enterprise'];

        if (!in_array($plan, $validPlans, true)) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid plan. Must be one of: ' . implode(', ', $validPlans)]);
            return;
        }

        $keyInfo = $this->keyService->getKey('stripe');
        if (!$keyInfo) {
            http_response_code(500);
            echo json_encode(['error' => 'Stripe is not configured. Add a Stripe key in Admin → System Keys.']);
            return;
        }

        // Find the price ID for the selected plan
        $priceId = "price_{$plan}_monthly";
        $appUrl = $this->config['app']['url'] ?? 'https://app.contentine.ai';

        try {
            \Stripe\Stripe::setApiKey($keyInfo['api_key']);

            $sessionParams = [
                'mode'                => 'subscription',
                'payment_method_types' => ['card'],
                'line_items'          => [[
                    'price'    => $priceId,
                    'quantity' => 1,
                ]],
                'success_url' => "{$appUrl}/settings?tab=billing&session_id={CHECKOUT_SESSION_ID}",
                'cancel_url'  => "{$appUrl}/settings?tab=billing",
                'metadata'    => [
                    'user_id'   => (string) $user['id'],
                    'plan_tier' => $plan,
                ],
                'client_reference_id' => (string) $user['id'],
            ];

            // If user already has a Stripe customer ID, reuse it
            if (!empty($user['stripe_customer_id'])) {
                $sessionParams['customer'] = $user['stripe_customer_id'];
            } else {
                $sessionParams['customer_email'] = $user['email'];
            }

            $session = \Stripe\Checkout\Session::create($sessionParams);

            echo json_encode(['url' => $session->url]);
        } catch (\Stripe\Exception\ApiErrorException $e) {
            error_log("Stripe checkout error: " . $e->getMessage());
            http_response_code(500);
            echo json_encode(['error' => 'Failed to create checkout session. Please try again.']);
        }
    }

    // ──────────────────────────────────────────────
    // Billing Portal
    // ──────────────────────────────────────────────

    /** POST /api/stripe/portal — Create a Stripe Billing Portal session for managing subscriptions. */
    public function createPortalSession(array $params, array $body): void
    {
        $user = Auth::requireUser();

        if (empty($user['stripe_customer_id'])) {
            http_response_code(400);
            echo json_encode(['error' => 'No active subscription found. Please subscribe to a plan first.']);
            return;
        }

        $keyInfo = $this->keyService->getKey('stripe');
        if (!$keyInfo) {
            http_response_code(500);
            echo json_encode(['error' => 'Stripe is not configured. Add a Stripe key in Admin → System Keys.']);
            return;
        }

        $appUrl = $this->config['app']['url'] ?? 'https://app.contentine.ai';

        try {
            \Stripe\Stripe::setApiKey($keyInfo['api_key']);

            $session = \Stripe\BillingPortal\Session::create([
                'customer'   => $user['stripe_customer_id'],
                'return_url' => "{$appUrl}/settings?tab=billing",
            ]);

            echo json_encode(['url' => $session->url]);
        } catch (\Stripe\Exception\ApiErrorException $e) {
            error_log("Stripe portal error: " . $e->getMessage());
            http_response_code(500);
            echo json_encode(['error' => 'Failed to open billing portal. Please try again.']);
        }
    }

    // ──────────────────────────────────────────────
    // Webhook
    // ──────────────────────────────────────────────

    /** POST /api/stripe/webhook — Handle Stripe webhook events. No auth required; verified by signature. */
    public function webhook(array $params, array $body): void
    {
        $keyInfo = $this->keyService->getKey('stripe');
        $webhookSecret = $this->config['stripe']['webhook_secret'] ?? '';

        if (!$keyInfo || !$webhookSecret) {
            http_response_code(500);
            echo json_encode(['error' => 'Stripe webhook not configured']);
            return;
        }

        \Stripe\Stripe::setApiKey($keyInfo['api_key']);

        $payload = file_get_contents('php://input');
        $sigHeader = $_SERVER['HTTP_STRIPE_SIGNATURE'] ?? '';

        try {
            $event = \Stripe\Webhook::constructEvent($payload, $sigHeader, $webhookSecret);
        } catch (\Stripe\Exception\SignatureVerificationException $e) {
            error_log("Stripe webhook signature verification failed: " . $e->getMessage());
            http_response_code(400);
            echo json_encode(['error' => 'Invalid signature']);
            return;
        } catch (\UnexpectedValueException $e) {
            error_log("Stripe webhook invalid payload: " . $e->getMessage());
            http_response_code(400);
            echo json_encode(['error' => 'Invalid payload']);
            return;
        }

        // Idempotency: never process the same event twice (Stripe retries with backoff).
        $seen = Database::fetch('SELECT id FROM stripe_events WHERE event_id = ?', [$event->id]);
        if ($seen) {
            echo json_encode(['received' => true, 'duplicate' => true]);
            return;
        }

        try {
            match ($event->type) {
                'checkout.session.completed'      => $this->handleCheckoutCompleted($event->data->object),
                'customer.subscription.updated'   => $this->handleSubscriptionUpdated($event->data->object),
                'customer.subscription.deleted'   => $this->handleSubscriptionDeleted($event->data->object),
                'invoice.payment_failed'          => $this->handlePaymentFailed($event->data->object),
                'account.updated'                 => $this->handleAccountUpdated($event->data->object),
                'charge.refunded'                 => $this->handleChargeRefunded($event->data->object),
                default                           => null, // Ignore unhandled events
            };
        } catch (\Exception $e) {
            // Do NOT record the event or ack success — let Stripe retry (skill §webhook.5).
            error_log("Stripe webhook handler error [{$event->type}]: " . $e->getMessage());
            http_response_code(500);
            echo json_encode(['error' => 'Handler failed; will retry']);
            return;
        }

        // Record the event only after successful handling, then acknowledge.
        try {
            Database::insert('stripe_events', ['event_id' => $event->id, 'type' => $event->type]);
        } catch (\Exception $e) {
            // A concurrent delivery may have inserted first — the unique key makes this a safe no-op.
            error_log("Stripe event idempotency insert skipped [{$event->id}]: " . $e->getMessage());
        }

        echo json_encode(['received' => true]);
    }

    // ──────────────────────────────────────────────
    // Plans
    // ──────────────────────────────────────────────

    /** GET /api/stripe/plans — Return available subscription plans. No auth required. */
    public function getPlans(array $params, array $body): void
    {
        echo json_encode(['plans' => self::PLANS]);
    }

    // ──────────────────────────────────────────────
    // Webhook Event Handlers
    // ──────────────────────────────────────────────

    /** Handle checkout.session.completed — subscription upgrade or marketplace purchase. */
    private function handleCheckoutCompleted(object $session): void
    {
        // Marketplace destination-charge checkouts carry a type marker in metadata.
        if (($session->metadata->type ?? null) === 'marketplace_purchase') {
            $this->handleMarketplacePurchaseCompleted($session);
            return;
        }

        $userId = $session->client_reference_id ?? ($session->metadata->user_id ?? null);

        if (!$userId) {
            error_log("Stripe checkout completed but no user_id found in session");
            return;
        }

        $user = Database::fetch('SELECT * FROM users WHERE id = ?', [(int) $userId]);
        if (!$user) {
            error_log("Stripe checkout completed but user {$userId} not found in database");
            return;
        }

        $customerId = $session->customer;
        $subscriptionId = $session->subscription;
        $planTier = $session->metadata->plan_tier ?? null;

        // If plan_tier not in metadata, resolve from subscription
        if (!$planTier && $subscriptionId) {
            $planTier = $this->resolvePlanTierFromSubscription((string) $subscriptionId);
        }

        if (!$planTier) {
            $planTier = 'starter'; // Fallback
        }

        Database::update('users', [
            'plan_tier'               => $planTier,
            'stripe_customer_id'      => (string) $customerId,
            'stripe_subscription_id'  => (string) $subscriptionId,
        ], 'id = ?', [(int) $userId]);

        // Create a welcome notification
        Database::insert('notifications', [
            'user_id'      => (int) $userId,
            'type'         => 'system',
            'title'        => 'Welcome to Contentine Create ' . ucfirst($planTier) . '!',
            'body'         => 'Your subscription is now active. Enjoy unlimited video creation and all ' . ucfirst($planTier) . ' features.',
            'is_read'      => false,
            'related_type' => 'subscription',
        ]);
    }

    /** Handle customer.subscription.updated — sync plan tier from price ID. */
    private function handleSubscriptionUpdated(object $subscription): void
    {
        $customerId = $subscription->customer;

        $user = Database::fetch('SELECT * FROM users WHERE stripe_customer_id = ?', [(string) $customerId]);
        if (!$user) {
            error_log("Stripe subscription updated but customer {$customerId} not found");
            return;
        }

        // Get the current price ID from the subscription items
        $priceId = $subscription->items->data[0]->price->id ?? null;
        $planTier = self::PRICE_TO_TIER[$priceId] ?? null;

        if ($planTier) {
            Database::update('users', [
                'plan_tier'              => $planTier,
                'stripe_subscription_id' => (string) $subscription->id,
            ], 'id = ?', [$user['id']]);
        }
    }

    /** Handle customer.subscription.deleted — downgrade user to free tier. */
    private function handleSubscriptionDeleted(object $subscription): void
    {
        $customerId = $subscription->customer;

        $user = Database::fetch('SELECT * FROM users WHERE stripe_customer_id = ?', [(string) $customerId]);
        if (!$user) {
            error_log("Stripe subscription deleted but customer {$customerId} not found");
            return;
        }

        Database::update('users', [
            'plan_tier'              => 'free',
            'stripe_subscription_id' => null,
        ], 'id = ?', [$user['id']]);

        Database::insert('notifications', [
            'user_id'      => $user['id'],
            'type'         => 'system',
            'title'        => 'Subscription cancelled',
            'body'         => 'Your subscription has been cancelled. You can resubscribe at any time from Settings.',
            'is_read'      => false,
            'related_type' => 'subscription',
        ]);
    }

    /** Handle invoice.payment_failed — notify user of payment failure. */
    private function handlePaymentFailed(object $invoice): void
    {
        $customerId = $invoice->customer;

        $user = Database::fetch('SELECT * FROM users WHERE stripe_customer_id = ?', [(string) $customerId]);
        if (!$user) {
            error_log("Stripe payment failed but customer {$customerId} not found");
            return;
        }

        Database::insert('notifications', [
            'user_id'      => $user['id'],
            'type'         => 'alert',
            'title'        => 'Payment failed',
            'body'         => 'Your latest payment could not be processed. Please update your payment method in Settings to avoid service interruption.',
            'is_read'      => false,
            'related_type' => 'subscription',
        ]);
    }

    /** Record a marketplace purchase after its destination-charge checkout completes (F-25/F-30). */
    private function handleMarketplacePurchaseCompleted(object $session): void
    {
        $meta = $session->metadata;
        $listingId = (int) ($meta->listing_id ?? 0);
        $buyerId   = (int) ($meta->buyer_id ?? 0);
        $sellerId  = (int) ($meta->seller_id ?? 0);
        $earning   = (int) ($meta->seller_earning_cents ?? 0);
        $fee       = (int) ($meta->platform_fee_cents ?? 0);

        if (!$listingId || !$buyerId) {
            error_log('Marketplace checkout completed but listing/buyer missing in metadata');
            return;
        }

        // Guard against a duplicate (retry or double-checkout); the unique key also protects us.
        $existing = Database::fetch(
            'SELECT id FROM marketplace_purchases WHERE listing_id = ? AND buyer_id = ?',
            [$listingId, $buyerId]
        );
        if ($existing) {
            return;
        }

        $paymentIntentId = is_string($session->payment_intent ?? null) ? $session->payment_intent : null;
        $amountTotal = (int) ($session->amount_total ?? 0);

        Database::insert('marketplace_purchases', [
            'listing_id'                 => $listingId,
            'buyer_id'                   => $buyerId,
            'seller_id'                  => $sellerId ?: null,
            'price_cents'                => $amountTotal,
            'platform_fee_cents'         => $fee,
            'seller_earning_cents'       => $earning,
            'stripe_payment_id'          => $paymentIntentId,
            'stripe_checkout_session_id' => $session->id ?? null,
            'status'                     => 'completed',
        ]);

        Database::query(
            'UPDATE marketplace_listings SET downloads = downloads + 1 WHERE id = ?',
            [$listingId]
        );

        // Notify the seller of the sale.
        if ($sellerId) {
            Database::insert('notifications', [
                'user_id'      => $sellerId,
                'type'         => 'system',
                'title'        => 'You made a sale!',
                'body'         => 'A buyer purchased one of your marketplace listings. Your payout is on the way.',
                'is_read'      => false,
                'related_type' => 'marketplace',
                'related_id'   => $listingId,
            ]);
        }
    }

    /** Handle account.updated — keep the seller's Connect payout flags in sync. */
    private function handleAccountUpdated(object $account): void
    {
        $accountId = $account->id ?? null;
        if (!$accountId) {
            return;
        }

        $user = Database::fetch('SELECT id FROM users WHERE stripe_connect_account_id = ?', [(string) $accountId]);
        if (!$user) {
            return;
        }

        Database::update('users', [
            'connect_charges_enabled'   => !empty($account->charges_enabled) ? 1 : 0,
            'connect_payouts_enabled'   => !empty($account->payouts_enabled) ? 1 : 0,
            'connect_details_submitted' => !empty($account->details_submitted) ? 1 : 0,
        ], 'id = ?', [$user['id']]);
    }

    /** Handle charge.refunded — mark a refunded marketplace purchase so entitlements/reviews reflect it. */
    private function handleChargeRefunded(object $charge): void
    {
        $paymentIntentId = is_string($charge->payment_intent ?? null) ? $charge->payment_intent : null;
        if (!$paymentIntentId) {
            return;
        }

        $purchase = Database::fetch(
            'SELECT id, listing_id FROM marketplace_purchases WHERE stripe_payment_id = ?',
            [$paymentIntentId]
        );
        if (!$purchase) {
            return; // Not a marketplace charge (e.g. a subscription invoice refund).
        }

        Database::update('marketplace_purchases', ['status' => 'refunded'], 'id = ?', [$purchase['id']]);
    }

    // ──────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────

    /** Resolve plan tier from a Stripe subscription ID by fetching its price. */
    private function resolvePlanTierFromSubscription(string $subscriptionId): ?string
    {
        try {
            $subscription = \Stripe\Subscription::retrieve($subscriptionId);
            $priceId = $subscription->items->data[0]->price->id ?? null;
            return self::PRICE_TO_TIER[$priceId] ?? null;
        } catch (\Exception $e) {
            error_log("Failed to resolve plan tier from subscription {$subscriptionId}: " . $e->getMessage());
            return null;
        }
    }
}
