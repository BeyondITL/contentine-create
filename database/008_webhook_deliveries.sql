-- =============================================
-- Migration 008 — R5 distribution/API additions (WS-10)
-- Webhook delivery log for the event-driven dispatcher (SA-04 / F-29).
-- Additive only.
-- =============================================

CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    webhook_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    event VARCHAR(50) NOT NULL,
    payload MEDIUMTEXT NOT NULL,
    status ENUM('pending','delivered','failed') NOT NULL DEFAULT 'pending',
    attempts INT UNSIGNED NOT NULL DEFAULT 0,
    max_attempts INT UNSIGNED NOT NULL DEFAULT 5,
    response_code INT NULL,
    last_error VARCHAR(500) NULL,
    next_attempt_at TIMESTAMP NULL,
    delivered_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (webhook_id) REFERENCES webhooks(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_delivery_due (status, next_attempt_at),
    INDEX idx_delivery_webhook (webhook_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- api_keys: columns the auth/key-management code relies on. Guarded so this
-- migration is safe to re-run and safe against schemas that already have them.
-- (MySQL 8.0.29+ supports IF NOT EXISTS on ADD COLUMN; on older 8.0 these will
--  error harmlessly if the column already exists — run once on a fresh api_keys.)
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMP NULL AFTER expires_at;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMP NULL AFTER revoked_at;

-- webhooks: status code recorded by the dispatcher / test delivery.
ALTER TABLE webhooks ADD COLUMN IF NOT EXISTS last_status_code INT NULL AFTER last_triggered_at;
