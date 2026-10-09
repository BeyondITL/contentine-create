-- =============================================
-- Contentine Create — Three-Tier AI Provider System
-- Browser-native (default) → System API (premium) → BYOK
-- MySQL 8.0+ | InnoDB | UTF-8mb4
-- =============================================

-- 1. Add tier columns to feature_credit_config
ALTER TABLE feature_credit_config
    ADD COLUMN api_multiplier DECIMAL(4,2) NOT NULL DEFAULT 3.00 AFTER credit_cost,
    ADD COLUMN byok_multiplier DECIMAL(4,2) NOT NULL DEFAULT 1.00 AFTER api_multiplier,
    ADD COLUMN supports_browser TINYINT(1) DEFAULT 1 AFTER byok_multiplier,
    ADD COLUMN supports_api TINYINT(1) DEFAULT 1 AFTER supports_browser,
    ADD COLUMN supports_byok TINYINT(1) DEFAULT 1 AFTER supports_api,
    ADD COLUMN browser_engine VARCHAR(50) DEFAULT NULL AFTER supports_byok,
    ADD COLUMN api_service VARCHAR(200) DEFAULT NULL AFTER browser_engine;

-- 2. Create user BYOK keys table
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

-- 3. Add Gemini to system_services (if not exists)
INSERT INTO system_services (service, display_name, documentation_url, default_daily_limit, default_hourly_limit, notes, required) VALUES
('gemini', 'Google Gemini API', 'https://ai.google.dev/docs', 0, 60, 'Gemini Pro/Flash for text. Imagen for images. Good quality, competitive pricing.', 0)
ON DUPLICATE KEY UPDATE display_name = VALUES(display_name);

-- 4. Set all AI providers to required = 0 (optional)
UPDATE system_services SET required = 0 WHERE service IN ('anthropic', 'openai', 'gemini');

-- 5. Update feature engine mappings

-- TEXT features: browser = webllm, cloud = anthropic,gemini,openai
UPDATE feature_credit_config SET browser_engine = 'webllm', api_service = 'anthropic,gemini,openai' WHERE feature_key IN ('ai_script_generate', 'ai_script_rewrite');
UPDATE feature_credit_config SET browser_engine = 'webllm', api_service = 'anthropic,gemini,openai' WHERE feature_key LIKE 'writer_%';
UPDATE feature_credit_config SET browser_engine = 'webllm', api_service = 'anthropic,gemini,openai' WHERE feature_key IN ('remix_generate', 'remix_to_video');
UPDATE feature_credit_config SET browser_engine = 'webllm', api_service = 'anthropic,gemini,openai' WHERE feature_key IN ('seo_topic_discover', 'idea_search');

-- IMAGE features: browser = sd_turbo, cloud = openai (DALL-E), gemini (Imagen)
UPDATE feature_credit_config SET browser_engine = 'sd_turbo', api_service = 'openai,gemini' WHERE feature_key IN ('image_generate', 'image_style_transfer', 'text_to_scenes', 'thumbnail_generate', 'character_consistency');

-- Browser-only features (no API tier)
UPDATE feature_credit_config SET supports_api = 0, supports_byok = 0 WHERE feature_key IN ('tts_generate', 'voice_clone', 'auto_caption', 'avatar_quick', 'avatar_photo', 'video_render', 'video_render_hd', 'aspect_ratio_convert', 'multilang_lipsync', 'remix_extract');

-- Avatar Pro is API-only (D-ID)
UPDATE feature_credit_config SET supports_browser = 0, browser_engine = NULL, api_service = 'did' WHERE feature_key = 'avatar_pro';

-- Publishing, scheduling, stock, marketplace — no AI tier, just credits
UPDATE feature_credit_config SET supports_browser = 0, supports_api = 0, supports_byok = 0 WHERE feature_key IN ('publish_video', 'bulk_schedule', 'stock_media_download', 'marketplace_list');
