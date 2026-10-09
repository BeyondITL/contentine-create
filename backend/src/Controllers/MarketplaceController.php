<?php

declare(strict_types=1);

namespace Contentine\Controllers;

use Contentine\Auth;
use Contentine\Database;
use Contentine\Services\ApiKeyService;

/** Handles marketplace listings, purchases, reviews, and Stripe Connect for the creator asset marketplace. */
class MarketplaceController
{
    /** Valid listing categories. */
    private const VALID_CATEGORIES = ['template', 'prompt_pack', 'voice_preset', 'style_preset'];

    /** Valid sort options for browsing. */
    private const VALID_SORTS = ['popular', 'newest', 'price_low', 'price_high'];

    /** Platform fee percentage taken from each sale. */
    private const PLATFORM_FEE_PERCENT = 15;

    /** Listings are visible/buyable only in this status (schema enum: draft|active|suspended). */
    private const STATUS_LIVE = 'active';

    private ApiKeyService $keyService;
    private array $config;

    public function __construct()
    {
        $this->keyService = new ApiKeyService();
        $this->config = require __DIR__ . '/../../config.php';
    }

    // ──────────────────────────────────────────────
    // Browse & View
    // ──────────────────────────────────────────────

    /** GET /api/marketplace — Browse marketplace listings with optional category filter and sorting. */
    public function index(array $params, array $body): void
    {
        $page = max(1, (int) ($_GET['page'] ?? 1));
        $limit = min(50, max(1, (int) ($_GET['limit'] ?? 20)));
        $offset = ($page - 1) * $limit;

        $where = 'ml.status = ?';
        $bindings = [self::STATUS_LIVE];

        // Optional category filter
        if (!empty($_GET['category'])) {
            $category = $_GET['category'];
            if (!in_array($category, self::VALID_CATEGORIES, true)) {
                http_response_code(400);
                echo json_encode([
                    'error' => 'category must be one of: ' . implode(', ', self::VALID_CATEGORIES),
                ]);
                return;
            }
            $where .= ' AND ml.category = ?';
            $bindings[] = $category;
        }

        // Optional search
        if (!empty($_GET['q'])) {
            $where .= ' AND (ml.title LIKE ? OR ml.description LIKE ?)';
            $searchTerm = '%' . $_GET['q'] . '%';
            $bindings[] = $searchTerm;
            $bindings[] = $searchTerm;
        }

        // Sort
        $sort = $_GET['sort'] ?? 'popular';
        if (!in_array($sort, self::VALID_SORTS, true)) {
            $sort = 'popular';
        }

        $orderBy = match ($sort) {
            'popular'    => 'ml.downloads DESC',
            'newest'     => 'ml.created_at DESC',
            'price_low'  => 'ml.price_cents ASC',
            'price_high' => 'ml.price_cents DESC',
        };

        $total = Database::fetch(
            "SELECT COUNT(*) as cnt FROM marketplace_listings ml WHERE {$where}",
            $bindings
        )['cnt'];

        $listings = Database::fetchAll(
            "SELECT ml.*, u.name as seller_name, u.email as seller_email
             FROM marketplace_listings ml
             JOIN users u ON u.id = ml.seller_id
             WHERE {$where}
             ORDER BY {$orderBy}
             LIMIT ? OFFSET ?",
            [...$bindings, $limit, $offset]
        );

        echo json_encode([
            'listings' => $listings,
            'total'    => (int) $total,
            'page'     => $page,
            'limit'    => $limit,
        ]);
    }

    /** GET /api/marketplace/{id} — Get a single listing with seller info and reviews. */
    public function show(array $params, array $body): void
    {
        $id = (int) $params['id'];

        $listing = Database::fetch(
            'SELECT ml.*, u.name as seller_name, u.email as seller_email
             FROM marketplace_listings ml
             JOIN users u ON u.id = ml.seller_id
             WHERE ml.id = ?',
            [$id]
        );

        if (!$listing) {
            http_response_code(404);
            echo json_encode(['error' => 'Listing not found']);
            return;
        }

        echo json_encode([
            'listing' => $listing,
            'reviews' => $this->fetchReviewRows($id),
        ]);
    }

    /** GET /api/marketplace/{id}/reviews — List reviews for a listing (standalone refresh endpoint). */
    public function reviews(array $params, array $body): void
    {
        $id = (int) $params['id'];

        $listing = Database::fetch('SELECT id FROM marketplace_listings WHERE id = ?', [$id]);
        if (!$listing) {
            http_response_code(404);
            echo json_encode(['error' => 'Listing not found']);
            return;
        }

        echo json_encode(['reviews' => $this->fetchReviewRows($id)]);
    }

    /** Shared query for a listing's reviews (joins reviewer name via reviewer_id). */
    private function fetchReviewRows(int $listingId): array
    {
        return Database::fetchAll(
            'SELECT mr.*, u.name as reviewer_name
             FROM marketplace_reviews mr
             JOIN users u ON u.id = mr.reviewer_id
             WHERE mr.listing_id = ?
             ORDER BY mr.created_at DESC',
            [$listingId]
        );
    }

    // ──────────────────────────────────────────────
    // Seller CRUD
    // ──────────────────────────────────────────────

    /** POST /api/marketplace — Create a new marketplace listing (defaults to draft status). */
    public function store(array $params, array $body): void
    {
        $user = Auth::requireUser();

        // Validate required fields
        $title = trim($body['title'] ?? '');
        if ($title === '') {
            http_response_code(400);
            echo json_encode(['error' => 'title is required']);
            return;
        }

        if (mb_strlen($title) > 200) {
            http_response_code(400);
            echo json_encode(['error' => 'title must be 200 characters or fewer']);
            return;
        }

        $description = trim($body['description'] ?? '');
        if ($description === '') {
            http_response_code(400);
            echo json_encode(['error' => 'description is required']);
            return;
        }

        $category = $body['category'] ?? '';
        if (!in_array($category, self::VALID_CATEGORIES, true)) {
            http_response_code(400);
            echo json_encode([
                'error' => 'category must be one of: ' . implode(', ', self::VALID_CATEGORIES),
            ]);
            return;
        }

        $priceCents = (int) ($body['price_cents'] ?? 0);
        if ($priceCents < 0) {
            http_response_code(400);
            echo json_encode(['error' => 'price_cents must be zero or greater']);
            return;
        }

        // Paid listings require the seller to have completed Stripe Connect onboarding,
        // otherwise there is nowhere to route the payout (F-25).
        if ($priceCents > 0 && !$this->sellerCanReceivePayouts($user)) {
            http_response_code(409);
            echo json_encode([
                'error' => 'Connect a payout account before listing paid items.',
                'code'  => 'connect_required',
            ]);
            return;
        }

        $id = Database::insert('marketplace_listings', [
            'seller_id'    => $user['id'],
            'title'        => $title,
            'description'  => $description,
            'category'     => $category,
            'price_cents'  => $priceCents,
            'preview_url'  => $body['preview_url'] ?? null,
            'asset_data'   => isset($body['asset_data']) ? json_encode($body['asset_data']) : json_encode(new \stdClass()),
            'status'       => 'draft',
            'downloads'    => 0,
            'rating_avg'   => 0,
            'rating_count' => 0,
        ]);

        $listing = Database::fetch('SELECT * FROM marketplace_listings WHERE id = ?', [$id]);

        http_response_code(201);
        echo json_encode(['listing' => $listing]);
    }

    /** PUT /api/marketplace/{id} — Update a marketplace listing (must be the seller). */
    public function update(array $params, array $body): void
    {
        $user = Auth::requireUser();
        $id = (int) $params['id'];

        $listing = Database::fetch(
            'SELECT * FROM marketplace_listings WHERE id = ? AND seller_id = ?',
            [$id, $user['id']]
        );

        if (!$listing) {
            http_response_code(404);
            echo json_encode(['error' => 'Listing not found or you are not the seller']);
            return;
        }

        $allowed = ['title', 'description', 'category', 'price_cents', 'preview_url', 'asset_data', 'status'];
        $data = [];

        foreach ($allowed as $field) {
            if (array_key_exists($field, $body)) {
                if ($field === 'asset_data' && is_array($body[$field])) {
                    $data[$field] = json_encode($body[$field]);
                } elseif ($field === 'category') {
                    if (!in_array($body[$field], self::VALID_CATEGORIES, true)) {
                        http_response_code(400);
                        echo json_encode([
                            'error' => 'category must be one of: ' . implode(', ', self::VALID_CATEGORIES),
                        ]);
                        return;
                    }
                    $data[$field] = $body[$field];
                } elseif ($field === 'status') {
                    if (!in_array($body[$field], ['draft', 'active', 'suspended'], true)) {
                        http_response_code(400);
                        echo json_encode(['error' => 'status must be one of: draft, active, suspended']);
                        return;
                    }
                    $data[$field] = $body[$field];
                } elseif ($field === 'title') {
                    $title = trim($body[$field]);
                    if ($title === '') {
                        http_response_code(400);
                        echo json_encode(['error' => 'title cannot be empty']);
                        return;
                    }
                    if (mb_strlen($title) > 200) {
                        http_response_code(400);
                        echo json_encode(['error' => 'title must be 200 characters or fewer']);
                        return;
                    }
                    $data[$field] = $title;
                } elseif ($field === 'price_cents') {
                    $priceCents = (int) $body[$field];
                    if ($priceCents < 0) {
                        http_response_code(400);
                        echo json_encode(['error' => 'price_cents must be zero or greater']);
                        return;
                    }
                    $data[$field] = $priceCents;
                } else {
                    $data[$field] = $body[$field];
                }
            }
        }

        if (empty($data)) {
            http_response_code(400);
            echo json_encode(['error' => 'No valid fields to update']);
            return;
        }

        // Guard: cannot publish a paid listing without a payout account (F-25).
        $newStatus = $data['status'] ?? $listing['status'];
        $newPrice = array_key_exists('price_cents', $data) ? $data['price_cents'] : (int) $listing['price_cents'];
        if ($newStatus === self::STATUS_LIVE && $newPrice > 0 && !$this->sellerCanReceivePayouts($user)) {
            http_response_code(409);
            echo json_encode([
                'error' => 'Connect a payout account before publishing paid items.',
                'code'  => 'connect_required',
            ]);
            return;
        }

        Database::update('marketplace_listings', $data, 'id = ?', [$id]);

        $listing = Database::fetch('SELECT * FROM marketplace_listings WHERE id = ?', [$id]);
        echo json_encode(['listing' => $listing]);
    }

    // ──────────────────────────────────────────────
    // Purchase
    // ──────────────────────────────────────────────

    /**
     * POST /api/marketplace/{id}/purchase — Buy a listing.
     * Free listings are recorded immediately. Paid listings open a Stripe Checkout
     * session as a destination charge: the buyer pays, the platform keeps a 15% fee,
     * and the remainder transfers to the seller's connected account. The purchase row
     * is written by the webhook on checkout.session.completed.
     */
    public function purchase(array $params, array $body): void
    {
        $user = Auth::requireUser();
        $listingId = (int) $params['id'];

        $listing = Database::fetch(
            'SELECT * FROM marketplace_listings WHERE id = ? AND status = ?',
            [$listingId, self::STATUS_LIVE]
        );

        if (!$listing) {
            http_response_code(404);
            echo json_encode(['error' => 'Listing not found or not available for purchase']);
            return;
        }

        // Prevent sellers from purchasing their own listing
        if ((int) $listing['seller_id'] === (int) $user['id']) {
            http_response_code(400);
            echo json_encode(['error' => 'You cannot purchase your own listing']);
            return;
        }

        // Check if the user already purchased this listing
        $existingPurchase = Database::fetch(
            'SELECT id FROM marketplace_purchases WHERE listing_id = ? AND buyer_id = ?',
            [$listingId, $user['id']]
        );

        if ($existingPurchase) {
            http_response_code(409);
            echo json_encode(['error' => 'You have already purchased this listing']);
            return;
        }

        $priceCents = (int) $listing['price_cents'];
        $platformFeeCents = (int) round($priceCents * self::PLATFORM_FEE_PERCENT / 100);
        $sellerEarningsCents = $priceCents - $platformFeeCents;

        // Free listing — record immediately, no payment step.
        if ($priceCents === 0) {
            $purchaseId = Database::insert('marketplace_purchases', [
                'listing_id'           => $listingId,
                'buyer_id'             => $user['id'],
                'seller_id'            => $listing['seller_id'],
                'price_cents'          => 0,
                'platform_fee_cents'   => 0,
                'seller_earning_cents' => 0,
                'stripe_payment_id'    => null,
                'status'               => 'completed',
            ]);
            Database::query(
                'UPDATE marketplace_listings SET downloads = downloads + 1 WHERE id = ?',
                [$listingId]
            );
            $purchase = Database::fetch('SELECT * FROM marketplace_purchases WHERE id = ?', [$purchaseId]);

            http_response_code(201);
            echo json_encode(['purchase' => $purchase, 'free' => true]);
            return;
        }

        // Paid listing — the seller must be able to receive payouts.
        $seller = Database::fetch('SELECT * FROM users WHERE id = ?', [(int) $listing['seller_id']]);
        if (!$seller || !$this->sellerCanReceivePayouts($seller)) {
            http_response_code(409);
            echo json_encode([
                'error' => 'This seller is not currently accepting payments.',
                'code'  => 'seller_payouts_disabled',
            ]);
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

            $session = \Stripe\Checkout\Session::create([
                'mode'                 => 'payment',
                'payment_method_types' => ['card'],
                'line_items'           => [[
                    'quantity'   => 1,
                    'price_data' => [
                        'currency'     => 'usd',
                        'unit_amount'  => $priceCents,
                        'product_data' => [
                            'name'        => $listing['title'],
                            'description' => mb_substr((string) ($listing['description'] ?? ''), 0, 300),
                        ],
                    ],
                ]],
                'payment_intent_data' => [
                    'application_fee_amount' => $platformFeeCents,
                    'transfer_data'          => [
                        'destination' => $seller['stripe_connect_account_id'],
                    ],
                    'metadata' => [
                        'type'       => 'marketplace_purchase',
                        'listing_id' => (string) $listingId,
                        'buyer_id'   => (string) $user['id'],
                        'seller_id'  => (string) $listing['seller_id'],
                    ],
                ],
                'success_url' => "{$appUrl}/marketplace?purchase=success&listing={$listingId}",
                'cancel_url'  => "{$appUrl}/marketplace?purchase=cancelled&listing={$listingId}",
                'customer_email' => $user['email'] ?? null,
                'metadata' => [
                    'type'                 => 'marketplace_purchase',
                    'listing_id'           => (string) $listingId,
                    'buyer_id'             => (string) $user['id'],
                    'seller_id'            => (string) $listing['seller_id'],
                    'seller_earning_cents' => (string) $sellerEarningsCents,
                    'platform_fee_cents'   => (string) $platformFeeCents,
                ],
            ]);

            echo json_encode(['checkout_url' => $session->url]);
        } catch (\Stripe\Exception\ApiErrorException $e) {
            error_log('Marketplace checkout error: ' . $e->getMessage());
            http_response_code(500);
            echo json_encode(['error' => 'Failed to start checkout. Please try again.']);
        }
    }

    // ──────────────────────────────────────────────
    // Reviews
    // ──────────────────────────────────────────────

    /** POST /api/marketplace/{id}/review — Leave a rating and review (one per buyer per listing, must have purchased). */
    public function review(array $params, array $body): void
    {
        $user = Auth::requireUser();
        $listingId = (int) $params['id'];

        // Verify listing exists
        $listing = Database::fetch(
            'SELECT * FROM marketplace_listings WHERE id = ?',
            [$listingId]
        );

        if (!$listing) {
            http_response_code(404);
            echo json_encode(['error' => 'Listing not found']);
            return;
        }

        // Verify the user has purchased this listing
        $purchase = Database::fetch(
            'SELECT id FROM marketplace_purchases WHERE listing_id = ? AND buyer_id = ?',
            [$listingId, $user['id']]
        );

        if (!$purchase) {
            http_response_code(403);
            echo json_encode(['error' => 'You must purchase this listing before leaving a review']);
            return;
        }

        // Enforce one review per reviewer per listing
        $existingReview = Database::fetch(
            'SELECT id FROM marketplace_reviews WHERE listing_id = ? AND reviewer_id = ?',
            [$listingId, $user['id']]
        );

        if ($existingReview) {
            http_response_code(409);
            echo json_encode(['error' => 'You have already reviewed this listing']);
            return;
        }

        // Validate rating
        $rating = (int) ($body['rating'] ?? 0);
        if ($rating < 1 || $rating > 5) {
            http_response_code(400);
            echo json_encode(['error' => 'rating must be between 1 and 5']);
            return;
        }

        $reviewText = trim($body['review_text'] ?? '');
        if (mb_strlen($reviewText) > 2000) {
            http_response_code(400);
            echo json_encode(['error' => 'review_text must be 2000 characters or fewer']);
            return;
        }

        $reviewId = Database::insert('marketplace_reviews', [
            'listing_id'  => $listingId,
            'reviewer_id' => $user['id'],
            'rating'      => $rating,
            'review_text' => $reviewText !== '' ? $reviewText : null,
        ]);

        // Recalculate rating_avg and rating_count on the listing
        $stats = Database::fetch(
            'SELECT COUNT(*) as cnt, AVG(rating) as avg_rating FROM marketplace_reviews WHERE listing_id = ?',
            [$listingId]
        );

        Database::update('marketplace_listings', [
            'rating_avg'   => round((float) $stats['avg_rating'], 2),
            'rating_count' => (int) $stats['cnt'],
        ], 'id = ?', [$listingId]);

        $review = Database::fetch(
            'SELECT mr.*, u.name as reviewer_name
             FROM marketplace_reviews mr JOIN users u ON u.id = mr.reviewer_id
             WHERE mr.id = ?',
            [$reviewId]
        );

        http_response_code(201);
        echo json_encode(['review' => $review]);
    }

    // ──────────────────────────────────────────────
    // Stripe Connect (seller onboarding + payout status)
    // ──────────────────────────────────────────────

    /**
     * POST /api/marketplace/connect — Create (or reuse) a Stripe Connect Express account
     * for the seller and return an onboarding link. Handles the refresh/return round-trip.
     */
    public function stripeConnect(array $params, array $body): void
    {
        $user = Auth::requireUser();

        $keyInfo = $this->keyService->getKey('stripe');
        if (!$keyInfo) {
            http_response_code(500);
            echo json_encode(['error' => 'Stripe is not configured. Add a Stripe key in Admin → System Keys.']);
            return;
        }

        $appUrl = $this->config['app']['url'] ?? 'https://app.contentine.ai';

        try {
            \Stripe\Stripe::setApiKey($keyInfo['api_key']);

            $accountId = $user['stripe_connect_account_id'] ?? null;

            // Create an Express connected account on first onboarding.
            if (!$accountId) {
                $account = \Stripe\Account::create([
                    'type'          => 'express',
                    'email'         => $user['email'] ?? null,
                    'capabilities'  => [
                        'transfers' => ['requested' => true],
                    ],
                    'business_type' => 'individual',
                    'metadata'      => ['user_id' => (string) $user['id']],
                ]);
                $accountId = $account->id;
                Database::update('users', [
                    'stripe_connect_account_id' => $accountId,
                ], 'id = ?', [$user['id']]);
            }

            // refresh_url is hit if the link expires; return_url when onboarding finishes.
            $link = \Stripe\AccountLink::create([
                'account'     => $accountId,
                'refresh_url' => "{$appUrl}/marketplace?connect=refresh",
                'return_url'  => "{$appUrl}/marketplace?connect=return",
                'type'        => 'account_onboarding',
            ]);

            echo json_encode(['url' => $link->url]);
        } catch (\Stripe\Exception\ApiErrorException $e) {
            error_log('Stripe Connect onboarding error: ' . $e->getMessage());
            http_response_code(500);
            echo json_encode(['error' => 'Failed to start Stripe onboarding. Please try again.']);
        }
    }

    /**
     * GET /api/marketplace/connect/status — Return the seller's payout readiness, syncing
     * charges/payouts flags from Stripe. Called by the seller UI and after the return redirect.
     */
    public function connectStatus(array $params, array $body): void
    {
        $user = Auth::requireUser();
        $accountId = $user['stripe_connect_account_id'] ?? null;

        if (!$accountId) {
            echo json_encode([
                'connected'         => false,
                'charges_enabled'   => false,
                'payouts_enabled'   => false,
                'details_submitted' => false,
            ]);
            return;
        }

        $keyInfo = $this->keyService->getKey('stripe');
        if (!$keyInfo) {
            // Report last-known DB state honestly rather than pretending it's live.
            echo json_encode([
                'connected'         => true,
                'charges_enabled'   => (bool) ($user['connect_charges_enabled'] ?? false),
                'payouts_enabled'   => (bool) ($user['connect_payouts_enabled'] ?? false),
                'details_submitted' => (bool) ($user['connect_details_submitted'] ?? false),
                'stale'             => true,
            ]);
            return;
        }

        try {
            \Stripe\Stripe::setApiKey($keyInfo['api_key']);
            $account = \Stripe\Account::retrieve($accountId);

            $chargesEnabled = (bool) $account->charges_enabled;
            $payoutsEnabled = (bool) $account->payouts_enabled;
            $detailsSubmitted = (bool) $account->details_submitted;

            Database::update('users', [
                'connect_charges_enabled'   => $chargesEnabled ? 1 : 0,
                'connect_payouts_enabled'   => $payoutsEnabled ? 1 : 0,
                'connect_details_submitted' => $detailsSubmitted ? 1 : 0,
            ], 'id = ?', [$user['id']]);

            echo json_encode([
                'connected'         => true,
                'account_id'        => $accountId,
                'charges_enabled'   => $chargesEnabled,
                'payouts_enabled'   => $payoutsEnabled,
                'details_submitted' => $detailsSubmitted,
            ]);
        } catch (\Stripe\Exception\ApiErrorException $e) {
            error_log('Stripe Connect status error: ' . $e->getMessage());
            http_response_code(500);
            echo json_encode(['error' => 'Failed to load payout status.']);
        }
    }

    /** True if the given user row can receive marketplace payouts (Connect charges enabled). */
    private function sellerCanReceivePayouts(array $user): bool
    {
        return !empty($user['stripe_connect_account_id'])
            && (bool) ($user['connect_charges_enabled'] ?? false);
    }

    // ──────────────────────────────────────────────
    // My Listings & Purchases
    // ──────────────────────────────────────────────

    /** GET /api/marketplace/my-listings — Get the authenticated seller's own listings. */
    public function myListings(array $params, array $body): void
    {
        $user = Auth::requireUser();

        $page = max(1, (int) ($_GET['page'] ?? 1));
        $limit = min(50, max(1, (int) ($_GET['limit'] ?? 20)));
        $offset = ($page - 1) * $limit;

        $total = Database::fetch(
            'SELECT COUNT(*) as cnt FROM marketplace_listings WHERE seller_id = ?',
            [$user['id']]
        )['cnt'];

        $listings = Database::fetchAll(
            'SELECT * FROM marketplace_listings WHERE seller_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
            [$user['id'], $limit, $offset]
        );

        echo json_encode([
            'listings' => $listings,
            'total'    => (int) $total,
            'page'     => $page,
            'limit'    => $limit,
        ]);
    }

    /** GET /api/marketplace/my-purchases — Get the authenticated buyer's purchased items with listing details. */
    public function myPurchases(array $params, array $body): void
    {
        $user = Auth::requireUser();

        $page = max(1, (int) ($_GET['page'] ?? 1));
        $limit = min(50, max(1, (int) ($_GET['limit'] ?? 20)));
        $offset = ($page - 1) * $limit;

        $total = Database::fetch(
            'SELECT COUNT(*) as cnt FROM marketplace_purchases WHERE buyer_id = ?',
            [$user['id']]
        )['cnt'];

        $purchases = Database::fetchAll(
            'SELECT mp.*, ml.title as listing_title, ml.description as listing_description,
                    ml.category as listing_category, ml.preview_url as listing_preview_url,
                    ml.asset_data as listing_asset_data, u.name as seller_name
             FROM marketplace_purchases mp
             JOIN marketplace_listings ml ON ml.id = mp.listing_id
             JOIN users u ON u.id = ml.seller_id
             WHERE mp.buyer_id = ?
             ORDER BY mp.purchased_at DESC
             LIMIT ? OFFSET ?',
            [$user['id'], $limit, $offset]
        );

        echo json_encode([
            'purchases' => $purchases,
            'total'     => (int) $total,
            'page'      => $page,
            'limit'     => $limit,
        ]);
    }
}
