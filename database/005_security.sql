-- =============================================
-- Contentine Create — Security Tables
-- Rate limiting + social account encryption migration
-- MySQL 8.0+ | InnoDB | UTF-8mb4
-- =============================================

-- Rate limiting log
CREATE TABLE rate_limit_log (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    identifier VARCHAR(200) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_identifier_created (identifier, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================
-- Migrate social_accounts to encrypted tokens
-- Adds encrypted columns, existing plaintext columns
-- remain until data migration, then get dropped.
-- =============================================

-- Add encrypted token columns to social_accounts
ALTER TABLE social_accounts
    ADD COLUMN IF NOT EXISTS platform_user_id VARCHAR(200) AFTER platform,
    ADD COLUMN IF NOT EXISTS platform_username VARCHAR(200) AFTER platform_user_id,
    ADD COLUMN IF NOT EXISTS display_name VARCHAR(200) AFTER platform_username,
    ADD COLUMN IF NOT EXISTS profile_image_url VARCHAR(500) AFTER display_name,
    ADD COLUMN IF NOT EXISTS encrypted_access_token TEXT AFTER profile_image_url,
    ADD COLUMN IF NOT EXISTS access_token_iv VARCHAR(48) AFTER encrypted_access_token,
    ADD COLUMN IF NOT EXISTS access_token_tag VARCHAR(48) AFTER access_token_iv,
    ADD COLUMN IF NOT EXISTS encrypted_refresh_token TEXT AFTER access_token_tag,
    ADD COLUMN IF NOT EXISTS refresh_token_iv VARCHAR(48) AFTER encrypted_refresh_token,
    ADD COLUMN IF NOT EXISTS refresh_token_tag VARCHAR(48) AFTER refresh_token_iv,
    ADD COLUMN IF NOT EXISTS scopes VARCHAR(500) AFTER token_expires_at,
    ADD COLUMN IF NOT EXISTS is_active TINYINT(1) DEFAULT 1 AFTER scopes,
    ADD COLUMN IF NOT EXISTS connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP AFTER is_active,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER connected_at;

-- CSRF tokens table (optional — can use stateless HMAC instead)
CREATE TABLE IF NOT EXISTS csrf_tokens (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    token VARCHAR(255) NOT NULL UNIQUE,
    user_id INT UNSIGNED NULL,
    ip_address VARCHAR(45),
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_token (token),
    INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Cleanup: Scheduled event to purge old rate limit entries (older than 2 hours)
-- Run manually if MySQL event scheduler is disabled:
-- DELETE FROM rate_limit_log WHERE created_at < DATE_SUB(NOW(), INTERVAL 2 HOUR);
