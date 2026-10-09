-- =============================================
-- PRD v2.2 Schema Additions (MySQL 8.0+)
-- Run after 001_initial_schema.sql
-- =============================================

-- AI Writer documents
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

-- Stock media cache (keyed by cache_key for flexible caching)
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

-- User API keys for REST API access
CREATE TABLE IF NOT EXISTS api_keys (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    name VARCHAR(100) NOT NULL,
    key_hash VARCHAR(255) NOT NULL,
    key_prefix VARCHAR(10) NOT NULL,
    scopes JSON DEFAULT NULL,
    last_used_at TIMESTAMP NULL,
    expires_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_api_keys_prefix (key_prefix)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Webhooks for automation
CREATE TABLE IF NOT EXISTS webhooks (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    url VARCHAR(500) NOT NULL,
    events JSON NOT NULL,
    secret VARCHAR(255) NOT NULL,
    is_active TINYINT(1) DEFAULT 1,
    last_triggered_at TIMESTAMP NULL,
    failure_count INT UNSIGNED DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_webhooks_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Marketplace listings
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

-- Marketplace purchases
CREATE TABLE IF NOT EXISTS marketplace_purchases (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    buyer_id INT UNSIGNED NOT NULL,
    listing_id INT UNSIGNED NOT NULL,
    stripe_payment_id VARCHAR(100),
    price_cents INT UNSIGNED NOT NULL,
    platform_fee_cents INT UNSIGNED NOT NULL,
    purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (buyer_id) REFERENCES users(id),
    FOREIGN KEY (listing_id) REFERENCES marketplace_listings(id),
    UNIQUE KEY uq_buyer_listing (buyer_id, listing_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Marketplace reviews
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

-- Enterprise leads
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
