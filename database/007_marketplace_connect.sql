-- 007_marketplace_connect.sql
-- WS-9 / R5 — F-25 Stripe Connect seller onboarding + F-30 marketplace purchase repair.
-- Applied manually against /database/ (the authoritative deploy schema; the
-- backend/migrations runner only globs backend/migrations/*.sql). One-time ALTERs —
-- re-running will error on duplicate columns/keys, which is expected for this lane.

-- ── Seller Connect account state on the user ──
ALTER TABLE users
    ADD COLUMN stripe_connect_account_id VARCHAR(100) NULL AFTER stripe_subscription_id,
    ADD COLUMN connect_charges_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER stripe_connect_account_id,
    ADD COLUMN connect_payouts_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER connect_charges_enabled,
    ADD COLUMN connect_details_submitted TINYINT(1) NOT NULL DEFAULT 0 AFTER connect_payouts_enabled;

-- ── Marketplace purchases: seller attribution + earnings + Stripe session tracking ──
-- The controller already writes seller_id / seller_earning_cents; the base schema
-- (002_v22_additions) omitted them, so the INSERT was failing. Add them for real.
ALTER TABLE marketplace_purchases
    ADD COLUMN seller_id INT UNSIGNED NULL AFTER listing_id,
    ADD COLUMN seller_earning_cents INT UNSIGNED NOT NULL DEFAULT 0 AFTER platform_fee_cents,
    ADD COLUMN stripe_checkout_session_id VARCHAR(100) NULL AFTER stripe_payment_id,
    ADD COLUMN status ENUM('pending','completed','refunded') NOT NULL DEFAULT 'completed' AFTER seller_earning_cents,
    ADD INDEX idx_mp_seller (seller_id),
    ADD INDEX idx_mp_session (stripe_checkout_session_id);

-- ── Real Clone L7 consent flag (recorded-consent checkbox is the mandatory artifact;
--    consent_video_path stays optional evidence) ──
-- consent_recorded = the mandatory L7 flag; admin_notes keeps admin review notes separate so
-- they never clobber `notes` (which holds the durable consent affirmation JSON from submission).
ALTER TABLE real_clone_requests
    ADD COLUMN consent_recorded TINYINT(1) NOT NULL DEFAULT 0 AFTER consent_video_path,
    ADD COLUMN admin_notes TEXT NULL AFTER notes;

-- ── Stripe webhook idempotency ledger (shared by subscription + marketplace webhooks) ──
CREATE TABLE IF NOT EXISTS stripe_events (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    event_id VARCHAR(100) NOT NULL UNIQUE,
    type VARCHAR(100) NOT NULL,
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_stripe_event_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
