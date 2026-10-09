-- =============================================
-- Contentine Database Schema
-- MySQL 8.0+ | InnoDB | UTF-8mb4
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
    timezone VARCHAR(50) DEFAULT 'UTC',
    team_id INT UNSIGNED NULL,
    role ENUM('owner','editor','viewer') DEFAULT 'owner',
    storage_used_bytes BIGINT UNSIGNED DEFAULT 0,
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
    style_mode VARCHAR(50),  -- ai_visuals, video_vault, stock, broll, url, product_url, audio, text_to_scene
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
    user_id INT UNSIGNED NULL,  -- NULL for system presets
    name VARCHAR(100) NOT NULL,
    photo_path VARCHAR(500),
    description_text TEXT,       -- Gemini Vision extracted description
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
    user_id INT UNSIGNED NULL,  -- NULL for system presets
    name VARCHAR(100) NOT NULL,
    kokoro_voice_id VARCHAR(50),  -- e.g. "af_sky", "am_adam"
    embedding_blob MEDIUMBLOB,    -- Serialized voice embedding for clones
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
    source_video_path VARCHAR(500),
    status ENUM('pending','approved','building','complete','rejected') DEFAULT 'pending',
    avatar_id INT UNSIGNED NULL,
    notes TEXT,
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
    account_name VARCHAR(200),
    oauth_token TEXT,
    refresh_token TEXT,
    token_expires_at DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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

-- =============================================
-- Content Remix Tables (3 new tables → 25 total)
-- =============================================

CREATE TABLE remix_projects (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    name VARCHAR(200),
    custom_instructions TEXT,          -- User's per-project instructions (e.g. "Extract top 3 takeaways")
    target_platforms JSON,             -- ["linkedin","twitter","video_script","blog","newsletter"]
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
    source_url VARCHAR(2000),          -- Original URL (for url/youtube/tiktok types)
    source_title VARCHAR(500),         -- Extracted or user-provided title
    extracted_text LONGTEXT,           -- The extracted plain text content
    custom_instruction TEXT,           -- Per-source custom instruction (optional)
    file_path VARCHAR(500),            -- For uploaded files (pdf, audio)
    video_id INT UNSIGNED NULL,        -- Reference to existing Contentine video (for type='video')
    sort_order TINYINT UNSIGNED DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (remix_project_id) REFERENCES remix_projects(id) ON DELETE CASCADE,
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE SET NULL,
    INDEX idx_project (remix_project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE remix_outputs (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    remix_project_id INT UNSIGNED NOT NULL,
    target_platform VARCHAR(30) NOT NULL,   -- 'linkedin','twitter','instagram','facebook','tiktok','threads','blog','video_script','newsletter'
    generated_text LONGTEXT,                -- The generated post/article/script text
    generated_json JSON,                    -- For video_script: full scene-by-scene JSON ready for video pipeline
    is_edited BOOLEAN DEFAULT FALSE,        -- User has manually edited
    status ENUM('generated','scheduled','published') DEFAULT 'generated',
    scheduled_post_id INT UNSIGNED NULL,    -- Link to scheduled_posts if scheduled
    video_id INT UNSIGNED NULL,             -- Link to videos table if sent to video pipeline
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

-- Auth0 + Onboarding additions
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMP NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_data JSON;
ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP NULL;
