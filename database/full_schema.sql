-- =============================================
-- Contentine Create v2.2 — Full Combined Schema
-- MySQL 8.0+ | InnoDB | UTF-8mb4
-- Generated: 2026-03-01
--
-- This file combines ALL migration files in order:
--   001_initial_schema.sql
--   002_v22_additions.sql
--   003_credit_system.sql
--   004_api_key_management.sql
--   005_security.sql
--   006_ai_provider_tiers.sql
--
-- For fresh installs: run this single file.
-- For upgrades: run individual migration files in order.
-- =============================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- =============================================
-- 001: INITIAL SCHEMA (25 tables)
-- =============================================

CREATE TABLE users (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    auth0_sub VARCHAR(100) UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100),
    plan_tier ENUM('free','starter','professional','business','enterprise') DEFAULT 'free',
    stripe_customer_id VARCHAR(100),
    stripe_subscription_id VARCHAR(100),
    stripe_connect_account_id VARCHAR(100),
    connect_charges_enabled TINYINT(1) NOT NULL DEFAULT 0,
    connect_payouts_enabled TINYINT(1) NOT NULL DEFAULT 0,
    connect_details_submitted TINYINT(1) NOT NULL DEFAULT 0,
    timezone VARCHAR(50) DEFAULT 'UTC',
    team_id INT UNSIGNED NULL,
    role ENUM('owner','editor','viewer') DEFAULT 'owner',
    storage_used_bytes BIGINT UNSIGNED DEFAULT 0,
    onboarding_completed_at TIMESTAMP NULL,
    onboarding_data JSON,
    trial_ends_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_team (team_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE teams (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    owner_id INT UNSIGNED NOT NULL,
    plan_tier ENUM('business','enterprise') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE projects (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    team_id INT UNSIGNED NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE videos (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    project_id INT UNSIGNED NULL,
    title VARCHAR(300) NOT NULL,
    type ENUM('faceless','avatar') NOT NULL,
    style_mode VARCHAR(50),
    script_json JSON,
    art_style VARCHAR(50),
    voice_profile_id INT UNSIGNED NULL,
    character_anchor_id INT UNSIGNED NULL,
    aspect_ratio ENUM('9:16','16:9','1:1') DEFAULT '9:16',
    duration_seconds INT UNSIGNED DEFAULT 0,
    status ENUM('draft','rendering','completed','published','failed') DEFAULT 'draft',
    mp4_path VARCHAR(500),
    thumbnail_path VARCHAR(500),
    folder_path VARCHAR(200) DEFAULT '/',
    render_started_at TIMESTAMP NULL,
    render_completed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_status (user_id, status),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE character_anchors (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NULL,
    name VARCHAR(100) NOT NULL,
    photo_path VARCHAR(500),
    description_text TEXT,
    seed_value INT UNSIGNED,
    art_style VARCHAR(50),
    is_preset BOOLEAN DEFAULT FALSE,
    gender VARCHAR(20),
    age_range VARCHAR(20),
    ethnicity VARCHAR(50),
    style VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user (user_id),
    INDEX idx_preset (is_preset)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE voice_profiles (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NULL,
    name VARCHAR(100) NOT NULL,
    kokoro_voice_id VARCHAR(50),
    embedding_blob MEDIUMBLOB,
    source ENUM('preset','cloned') DEFAULT 'preset',
    language VARCHAR(10) DEFAULT 'en',
    gender VARCHAR(20),
    tone VARCHAR(50),
    speed DECIMAL(3,2) DEFAULT 1.00,
    pitch DECIMAL(5,2) DEFAULT 0.00,
    style VARCHAR(50) DEFAULT 'conversational',
    is_preset BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user (user_id),
    INDEX idx_preset (is_preset)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE avatar_presets (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    gender VARCHAR(20),
    age_range VARCHAR(20),
    ethnicity VARCHAR(50),
    style VARCHAR(50),
    photo_path VARCHAR(500) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE real_clone_requests (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    consent_video_path VARCHAR(500),
    consent_recorded TINYINT(1) NOT NULL DEFAULT 0,
    source_video_path VARCHAR(500),
    status ENUM('pending','approved','building','complete','rejected') DEFAULT 'pending',
    avatar_id INT UNSIGNED NULL,
    notes TEXT,
    admin_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE scheduled_posts (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    video_id INT UNSIGNED NOT NULL,
    platform ENUM('youtube','tiktok','instagram','facebook','linkedin','threads','twitter') NOT NULL,
    scheduled_at DATETIME NOT NULL,
    status ENUM('pending','publishing','published','failed') DEFAULT 'pending',
    published_url VARCHAR(500),
    cta_template_id INT UNSIGNED NULL,
    title VARCHAR(300),
    description TEXT,
    tags JSON,
    hashtags JSON,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
    INDEX idx_scheduled (scheduled_at, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE cta_templates (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    name VARCHAR(100) NOT NULL,
    cta_text TEXT NOT NULL,
    links JSON,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE social_accounts (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    platform ENUM('youtube','tiktok','instagram','facebook','linkedin','threads','twitter') NOT NULL,
    platform_user_id VARCHAR(200),
    platform_username VARCHAR(200),
    display_name VARCHAR(200),
    profile_image_url VARCHAR(500),
    encrypted_access_token TEXT,
    access_token_iv VARCHAR(48),
    access_token_tag VARCHAR(48),
    encrypted_refresh_token TEXT,
    refresh_token_iv VARCHAR(48),
    refresh_token_tag VARCHAR(48),
    account_name VARCHAR(200),
    oauth_token TEXT,
    refresh_token TEXT,
    token_expires_at DATETIME,
    scopes VARCHAR(500),
    is_active TINYINT(1) DEFAULT 1,
    connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uk_user_platform (user_id, platform)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE idea_searches (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    query VARCHAR(300) NOT NULL,
    platform VARCHAR(30) NOT NULL,
    results_json JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_date (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE favourite_topics (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    topic_text VARCHAR(300) NOT NULL,
    source_platform VARCHAR(30),
    search_volume INT UNSIGNED,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uk_user_topic (user_id, topic_text)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE analytics_snapshots (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    video_id INT UNSIGNED NOT NULL,
    platform VARCHAR(30) NOT NULL,
    views INT UNSIGNED DEFAULT 0,
    likes INT UNSIGNED DEFAULT 0,
    comments INT UNSIGNED DEFAULT 0,
    shares INT UNSIGNED DEFAULT 0,
    ctr DECIMAL(5,4) DEFAULT 0,
    demographics_json JSON,
    snapshot_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
    UNIQUE KEY uk_video_platform_date (video_id, platform, snapshot_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE analytics_alerts (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    metric VARCHAR(50) NOT NULL,
    threshold INT UNSIGNED NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    last_triggered_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE asset_library (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    type ENUM('image','video','audio') NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    source ENUM('generated','uploaded','stock') NOT NULL,
    tags JSON,
    original_video_id INT UNSIGNED NULL,
    file_size_bytes INT UNSIGNED DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_type (user_id, type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE bulk_jobs (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    type ENUM('topic','csv','manual') NOT NULL,
    config_json JSON,
    total_count INT UNSIGNED DEFAULT 0,
    completed_count INT UNSIGNED DEFAULT 0,
    status ENUM('queued','processing','completed','failed') DEFAULT 'queued',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE thumbnails (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    video_id INT UNSIGNED NULL,
    prompt TEXT NOT NULL,
    image_path VARCHAR(500) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE notifications (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    type ENUM('render_complete','post_published','team_activity','system','alert') NOT NULL,
    title VARCHAR(200) NOT NULL,
    body TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    related_type VARCHAR(50),
    related_id INT UNSIGNED,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_unread (user_id, is_read, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE video_comments (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    video_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    comment_text TEXT NOT NULL,
    parent_id INT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES video_comments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE ai_writer_docs (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    type ENUM('blog','caption','email','description','ad','summary') NOT NULL,
    title VARCHAR(300),
    content LONGTEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Content Remix Tables
CREATE TABLE remix_projects (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    name VARCHAR(200),
    custom_instructions TEXT,
    target_platforms JSON,
    status ENUM('draft','generated','published') DEFAULT 'draft',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_date (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE remix_sources (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    remix_project_id INT UNSIGNED NOT NULL,
    source_type ENUM('text','url','youtube','tiktok','pdf','audio','video') NOT NULL,
    source_url VARCHAR(2000),
    source_title VARCHAR(500),
    extracted_text LONGTEXT,
    custom_instruction TEXT,
    file_path VARCHAR(500),
    video_id INT UNSIGNED NULL,
    sort_order TINYINT UNSIGNED DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (remix_project_id) REFERENCES remix_projects(id) ON DELETE CASCADE,
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE SET NULL,
    INDEX idx_project (remix_project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE remix_outputs (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    remix_project_id INT UNSIGNED NOT NULL,
    target_platform VARCHAR(30) NOT NULL,
    generated_text LONGTEXT,
    generated_json JSON,
    is_edited BOOLEAN DEFAULT FALSE,
    status ENUM('generated','scheduled','published') DEFAULT 'generated',
    scheduled_post_id INT UNSIGNED NULL,
    video_id INT UNSIGNED NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (remix_project_id) REFERENCES remix_projects(id) ON DELETE CASCADE,
    FOREIGN KEY (scheduled_post_id) REFERENCES scheduled_posts(id) ON DELETE SET NULL,
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE SET NULL,
    INDEX idx_project_platform (remix_project_id, target_platform)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE activity_log (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    team_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    action VARCHAR(50) NOT NULL,
    target_type VARCHAR(50),
    target_id INT UNSIGNED,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_team_date (team_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================
-- 002: PRD v2.2 ADDITIONS
-- =============================================

CREATE TABLE IF NOT EXISTS writer_documents (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    title VARCHAR(300),
    content_type ENUM('blog_post','article','linkedin_post','newsletter','product_description','press_release') NOT NULL,
    topic TEXT,
    tone VARCHAR(50),
    content LONGTEXT,
    word_count INT UNSIGNED DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_writer_docs_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS stock_media_cache (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    cache_key VARCHAR(64) NOT NULL UNIQUE,
    source ENUM('pexels','pixabay','freesound') NOT NULL,
    media_type ENUM('video','photo','audio') DEFAULT NULL,
    response_json JSON NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_source (source),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS api_keys (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    name VARCHAR(100) NOT NULL,
    key_hash VARCHAR(255) NOT NULL,
    key_prefix VARCHAR(10) NOT NULL,
    scopes JSON DEFAULT NULL,
    last_used_at TIMESTAMP NULL,
    expires_at TIMESTAMP NULL,
    revoked_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_api_keys_prefix (key_prefix)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS webhooks (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    url VARCHAR(500) NOT NULL,
    events JSON NOT NULL,
    secret VARCHAR(255) NOT NULL,
    is_active TINYINT(1) DEFAULT 1,
    last_triggered_at TIMESTAMP NULL,
    last_status_code INT NULL,
    failure_count INT UNSIGNED DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_webhooks_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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

CREATE TABLE IF NOT EXISTS marketplace_listings (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    seller_id INT UNSIGNED NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    category ENUM('template','prompt_pack','voice_preset','style_preset') NOT NULL,
    price_cents INT UNSIGNED NOT NULL,
    preview_url VARCHAR(500),
    asset_data JSON NOT NULL,
    downloads INT UNSIGNED DEFAULT 0,
    rating_avg DECIMAL(3,2) DEFAULT 0.00,
    rating_count INT UNSIGNED DEFAULT 0,
    status ENUM('draft','active','suspended') DEFAULT 'draft',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_marketplace_category (category),
    INDEX idx_marketplace_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS marketplace_purchases (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    buyer_id INT UNSIGNED NOT NULL,
    listing_id INT UNSIGNED NOT NULL,
    seller_id INT UNSIGNED NULL,
    stripe_payment_id VARCHAR(100),
    stripe_checkout_session_id VARCHAR(100),
    price_cents INT UNSIGNED NOT NULL,
    platform_fee_cents INT UNSIGNED NOT NULL,
    seller_earning_cents INT UNSIGNED NOT NULL DEFAULT 0,
    status ENUM('pending','completed','refunded') NOT NULL DEFAULT 'completed',
    purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (buyer_id) REFERENCES users(id),
    FOREIGN KEY (listing_id) REFERENCES marketplace_listings(id),
    UNIQUE KEY uq_buyer_listing (buyer_id, listing_id),
    INDEX idx_mp_seller (seller_id),
    INDEX idx_mp_session (stripe_checkout_session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS stripe_events (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    event_id VARCHAR(100) NOT NULL UNIQUE,
    type VARCHAR(100) NOT NULL,
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_stripe_event_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS marketplace_reviews (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    listing_id INT UNSIGNED NOT NULL,
    reviewer_id INT UNSIGNED NOT NULL,
    rating TINYINT UNSIGNED NOT NULL,
    review_text TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (listing_id) REFERENCES marketplace_listings(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewer_id) REFERENCES users(id),
    UNIQUE KEY uq_reviewer_listing (reviewer_id, listing_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS enterprise_leads (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    company_name VARCHAR(200),
    contact_name VARCHAR(100),
    contact_email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    team_size VARCHAR(50),
    message TEXT,
    status ENUM('new','contacted','negotiating','closed_won','closed_lost') DEFAULT 'new',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================
-- 003: CREDIT SYSTEM
-- =============================================

CREATE TABLE feature_credit_config (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    feature_key VARCHAR(100) NOT NULL UNIQUE,
    feature_label VARCHAR(200) NOT NULL,
    feature_group VARCHAR(100) NOT NULL DEFAULT 'general',
    credit_cost INT UNSIGNED NOT NULL DEFAULT 0,
    api_multiplier DECIMAL(4,2) NOT NULL DEFAULT 3.00,
    byok_multiplier DECIMAL(4,2) NOT NULL DEFAULT 1.00,
    supports_browser TINYINT(1) DEFAULT 1,
    supports_api TINYINT(1) DEFAULT 1,
    supports_byok TINYINT(1) DEFAULT 1,
    browser_engine VARCHAR(50) DEFAULT NULL,
    api_service VARCHAR(200) DEFAULT NULL,
    description VARCHAR(500),
    is_active TINYINT(1) DEFAULT 1,
    promo_label VARCHAR(100) DEFAULT 'Limited Time \u2014 Free!',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_group (feature_group),
    INDEX idx_key (feature_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE user_credits (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL UNIQUE,
    balance INT UNSIGNED NOT NULL DEFAULT 0,
    lifetime_purchased INT UNSIGNED NOT NULL DEFAULT 0,
    lifetime_spent INT UNSIGNED NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE credit_transactions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    type ENUM('purchase','deduction','refund','admin_grant','promo') NOT NULL,
    amount INT NOT NULL,
    balance_after INT UNSIGNED NOT NULL,
    feature_key VARCHAR(100) NULL,
    reference_id VARCHAR(200) NULL,
    description VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_created (user_id, created_at),
    INDEX idx_type (type),
    INDEX idx_feature (feature_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE credit_packs (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    credits INT UNSIGNED NOT NULL,
    price_cents INT UNSIGNED NOT NULL,
    stripe_price_id VARCHAR(100),
    badge_label VARCHAR(50),
    badge_color VARCHAR(20) DEFAULT 'primary',
    sort_order INT UNSIGNED DEFAULT 0,
    is_active TINYINT(1) DEFAULT 1,
    is_featured TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================
-- 004: SYSTEM API KEY MANAGEMENT
-- =============================================

CREATE TABLE system_api_keys (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    service VARCHAR(50) NOT NULL,
    label VARCHAR(100) NOT NULL,
    encrypted_key TEXT NOT NULL,
    encryption_iv VARCHAR(48) NOT NULL,
    encryption_tag VARCHAR(48) NOT NULL,
    daily_limit INT UNSIGNED DEFAULT 0,
    hourly_limit INT UNSIGNED DEFAULT 0,
    daily_usage INT UNSIGNED DEFAULT 0,
    hourly_usage INT UNSIGNED DEFAULT 0,
    daily_reset_at TIMESTAMP NULL,
    hourly_reset_at TIMESTAMP NULL,
    priority INT UNSIGNED DEFAULT 0,
    is_active TINYINT(1) DEFAULT 1,
    last_error VARCHAR(500) NULL,
    last_error_at TIMESTAMP NULL,
    last_used_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_service_active (service, is_active, priority),
    INDEX idx_daily_reset (daily_reset_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE api_key_usage_log (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    key_id INT UNSIGNED NOT NULL,
    service VARCHAR(50) NOT NULL,
    endpoint VARCHAR(200),
    units_consumed INT UNSIGNED DEFAULT 1,
    response_code INT UNSIGNED,
    error_message VARCHAR(500) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (key_id) REFERENCES system_api_keys(id) ON DELETE CASCADE,
    INDEX idx_key_created (key_id, created_at),
    INDEX idx_service_created (service, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE system_services (
    service VARCHAR(50) PRIMARY KEY,
    display_name VARCHAR(100) NOT NULL,
    documentation_url VARCHAR(500),
    default_daily_limit INT UNSIGNED DEFAULT 0,
    default_hourly_limit INT UNSIGNED DEFAULT 0,
    notes TEXT,
    required TINYINT(1) DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================
-- 005: SECURITY
-- =============================================

CREATE TABLE rate_limit_log (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    identifier VARCHAR(200) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_identifier_created (identifier, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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

-- =============================================
-- 006: THREE-TIER AI PROVIDER — BYOK KEYS
-- =============================================

CREATE TABLE IF NOT EXISTS user_api_keys (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    service VARCHAR(50) NOT NULL,
    label VARCHAR(100) DEFAULT 'My Key',
    encrypted_key TEXT NOT NULL,
    encryption_iv VARCHAR(48) NOT NULL,
    encryption_tag VARCHAR(48) NOT NULL,
    is_active TINYINT(1) DEFAULT 1,
    last_used_at TIMESTAMP NULL,
    last_error VARCHAR(500) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uq_user_service (user_id, service),
    INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================
-- SEED DATA: System services registry
-- =============================================

INSERT INTO system_services (service, display_name, documentation_url, default_daily_limit, default_hourly_limit, notes, required) VALUES
('anthropic',     'Anthropic (Claude API)',   'https://docs.anthropic.com/',                     0,     60,   'Script gen, remix, AI writer.',           0),
('openai',        'OpenAI (DALL-E)',          'https://platform.openai.com/docs/',               0,     60,   'Image generation.',                       0),
('gemini',        'Google Gemini API',        'https://ai.google.dev/docs',                      0,     60,   'Gemini Pro/Flash for text. Imagen for images.', 0),
('youtube',       'YouTube Data API v3',      'https://developers.google.com/youtube/v3/',       10000, 0,    'Quota units/day.',                        0),
('tiktok',        'TikTok for Developers',    'https://developers.tiktok.com/',                  0,     0,    'Content publishing.',                     0),
('instagram',     'Instagram Graph API',      'https://developers.facebook.com/docs/instagram/', 200,   0,    'Publishing + insights.',                  0),
('facebook',      'Facebook Graph API',       'https://developers.facebook.com/docs/',           200,   0,    'Publishing.',                             0),
('twitter',       'X/Twitter API v2',         'https://developer.x.com/en/docs',                 0,     300,  'Tweets per 15 min.',                      0),
('linkedin',      'LinkedIn Marketing API',   'https://learn.microsoft.com/linkedin/',           100,   0,    'Daily app rate limit.',                   0),
('threads',       'Threads API',              'https://developers.facebook.com/docs/threads/',   0,     250,  'Publishing limits/hr.',                   0),
('pexels',        'Pexels API',               'https://www.pexels.com/api/documentation/',       0,     200,  'Free. 200 req/hr.',                       0),
('pixabay',       'Pixabay API',              'https://pixabay.com/api/docs/',                   0,     0,    'Free. Rate limited.',                     0),
('freesound',     'Freesound API',            'https://freesound.org/docs/api/',                 0,     0,    'Free. CC licensed audio.',                0),
('google_trends', 'Google Trends API',        'https://trends.google.com/',                      0,     0,    'SEO topic discovery.',                    0),
('did',           'D-ID API',                 'https://docs.d-id.com/',                          0,     0,    'Pro avatar. Paid plans only.',            0),
('auth0',         'Auth0',                    'https://auth0.com/docs/',                         0,     0,    'Auth provider.',                          1),
('stripe',        'Stripe',                   'https://stripe.com/docs/api',                     0,     0,    'Payments + Connect.',                     1);

-- =============================================
-- SEED DATA: Feature credit config (all free promo)
-- =============================================

INSERT INTO feature_credit_config (feature_key, feature_label, feature_group, credit_cost, description, promo_label) VALUES
('ai_script_generate',   'AI Script Generation',       'video_creation', 0, 'Generate video scripts using AI',             'Limited Time \u2014 Free!'),
('ai_script_rewrite',    'AI Script Rewrite',          'video_creation', 0, 'Rewrite/improve existing scripts',            'Limited Time \u2014 Free!'),
('video_render',         'Video Render',               'video_creation', 0, 'Render a complete video from script',          'Limited Time \u2014 Free!'),
('video_render_hd',      'HD Video Render (1080p)',    'video_creation', 0, 'Render in full HD resolution',                 'Limited Time \u2014 Free!'),
('thumbnail_generate',   'AI Thumbnail Generation',    'video_creation', 0, 'Generate thumbnail with AI',                   'Limited Time \u2014 Free!'),
('aspect_ratio_convert', 'Aspect Ratio Conversion',    'video_creation', 0, 'Convert video to different aspect ratio',       'Limited Time \u2014 Free!'),
('image_generate',       'AI Image Generation',        'ai_visual',      0, 'Generate scene images with AI (DALL-E)',        'Limited Time \u2014 Free!'),
('image_style_transfer', 'Style Transfer',             'ai_visual',      0, 'Apply art style to images',                    'Limited Time \u2014 Free!'),
('character_consistency','Character Consistency',       'ai_visual',      0, 'Maintain character across scenes',              'Limited Time \u2014 Free!'),
('text_to_scenes',       'Text-to-Scenes',             'ai_visual',      0, 'Generate visual scene sequence from text',       'Limited Time \u2014 Free!'),
('tts_generate',         'Text-to-Speech',             'voice_audio',    0, 'Generate speech from text (Kokoro)',             'Limited Time \u2014 Free!'),
('voice_clone',          'Voice Cloning',              'voice_audio',    0, 'Clone voice from 3-second sample',              'Limited Time \u2014 Free!'),
('auto_caption',         'Auto-Captioning',            'voice_audio',    0, 'Generate captions/subtitles from audio',         'Limited Time \u2014 Free!'),
('avatar_quick',         'Quick Avatar (3D)',           'avatar',         0, 'TalkingHead 3D avatar video',                   'Limited Time \u2014 Free!'),
('avatar_photo',         'Photo Avatar (Wav2Lip)',      'avatar',         0, 'Animate photo with lip-sync',                   'Limited Time \u2014 Free!'),
('avatar_pro',           'Pro Avatar (D-ID)',           'avatar',         0, 'Photorealistic talking-head video',              'Limited Time \u2014 Free!'),
('multilang_lipsync',    'Multi-Language Lip-Sync',     'avatar',         0, 'Translate + lip-sync to other language',         'Limited Time \u2014 Free!'),
('remix_extract',        'Content Extraction',          'remix',          0, 'Extract content from URL/PDF/audio/etc',         'Limited Time \u2014 Free!'),
('remix_generate',       'Content Remix Generation',    'remix',          0, 'Generate remixed content for platforms',          'Limited Time \u2014 Free!'),
('remix_to_video',       'Remix to Video',              'remix',          0, 'Convert remixed content into video script',       'Limited Time \u2014 Free!'),
('writer_blog_post',     'AI Writer \u2014 Blog Post',         'writer',  0, 'Generate blog post with AI',                     'Limited Time \u2014 Free!'),
('writer_article',       'AI Writer \u2014 Article',           'writer',  0, 'Generate article with AI',                       'Limited Time \u2014 Free!'),
('writer_linkedin',      'AI Writer \u2014 LinkedIn Post',     'writer',  0, 'Generate LinkedIn post with AI',                 'Limited Time \u2014 Free!'),
('writer_newsletter',    'AI Writer \u2014 Newsletter',        'writer',  0, 'Generate newsletter with AI',                    'Limited Time \u2014 Free!'),
('writer_product_desc',  'AI Writer \u2014 Product Desc',      'writer',  0, 'Generate product description with AI',            'Limited Time \u2014 Free!'),
('writer_press_release', 'AI Writer \u2014 Press Release',     'writer',  0, 'Generate press release with AI',                  'Limited Time \u2014 Free!'),
('publish_video',        'Publish to Platform',         'publishing',     0, 'Publish video to a social platform',             'Limited Time \u2014 Free!'),
('bulk_schedule',        'Bulk Schedule',               'publishing',     0, 'Schedule batch of videos',                        'Limited Time \u2014 Free!'),
('seo_topic_discover',   'SEO Topic Discovery',         'discovery',      0, 'Discover trending topics with Google Trends',     'Limited Time \u2014 Free!'),
('idea_search',          'Idea Search',                 'discovery',      0, 'Search for content ideas across platforms',        'Limited Time \u2014 Free!'),
('stock_media_download', 'Stock Media Download',        'stock_media',    0, 'Download stock video/photo/audio',                'Limited Time \u2014 Free!'),
('marketplace_list',     'List on Marketplace',         'marketplace',    0, 'List an item for sale on marketplace',            'Limited Time \u2014 Free!');

-- Apply tier engine mappings
UPDATE feature_credit_config SET browser_engine = 'webllm', api_service = 'anthropic,gemini,openai' WHERE feature_key IN ('ai_script_generate', 'ai_script_rewrite');
UPDATE feature_credit_config SET browser_engine = 'webllm', api_service = 'anthropic,gemini,openai' WHERE feature_key LIKE 'writer_%';
UPDATE feature_credit_config SET browser_engine = 'webllm', api_service = 'anthropic,gemini,openai' WHERE feature_key IN ('remix_generate', 'remix_to_video');
UPDATE feature_credit_config SET browser_engine = 'webllm', api_service = 'anthropic,gemini,openai' WHERE feature_key IN ('seo_topic_discover', 'idea_search');
UPDATE feature_credit_config SET browser_engine = 'sd_turbo', api_service = 'openai,gemini' WHERE feature_key IN ('image_generate', 'image_style_transfer', 'text_to_scenes', 'thumbnail_generate', 'character_consistency');
UPDATE feature_credit_config SET supports_api = 0, supports_byok = 0 WHERE feature_key IN ('tts_generate', 'voice_clone', 'auto_caption', 'avatar_quick', 'avatar_photo', 'video_render', 'video_render_hd', 'aspect_ratio_convert', 'multilang_lipsync', 'remix_extract');
UPDATE feature_credit_config SET supports_browser = 0, browser_engine = NULL, api_service = 'did' WHERE feature_key = 'avatar_pro';
UPDATE feature_credit_config SET supports_browser = 0, supports_api = 0, supports_byok = 0 WHERE feature_key IN ('publish_video', 'bulk_schedule', 'stock_media_download', 'marketplace_list');

-- Seed credit packs
INSERT INTO credit_packs (name, credits, price_cents, badge_label, badge_color, sort_order, is_active, is_featured) VALUES
('Starter Pack',     100,    999,   'Starter',     'primary',    1, 1, 0),
('Creator Pack',     500,   3999,   'Popular',     'secondary',  2, 1, 1),
('Pro Pack',        1500,   9999,   'Best Value',  'accent',     3, 1, 0),
('Studio Pack',     5000,  29999,   'Studio',      'primary',    4, 1, 0),
('Enterprise Pack', 20000, 99999,   'Enterprise',  'dark',       5, 1, 0);

SET FOREIGN_KEY_CHECKS = 1;

-- =============================================
-- POST-INSTALL NOTES:
-- 1. Run: mysql -u root -p contentine_create < full_schema.sql
-- 2. Optionally run: backend/migrations/002_seed_data.sql for demo data
-- 3. Generate encryption key: php -r "echo bin2hex(random_bytes(32));"
-- =============================================
