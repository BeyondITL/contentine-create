-- =============================================
-- Contentine Create — Credit System
-- All features configurable, all start at 0 (promo)
-- MySQL 8.0+ | InnoDB | UTF-8mb4
-- =============================================

-- Admin-configurable credit cost per feature
CREATE TABLE feature_credit_config (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    feature_key VARCHAR(100) NOT NULL UNIQUE,
    feature_label VARCHAR(200) NOT NULL,
    feature_group VARCHAR(100) NOT NULL DEFAULT 'general',
    credit_cost INT UNSIGNED NOT NULL DEFAULT 0,
    description VARCHAR(500),
    is_active TINYINT(1) DEFAULT 1,
    promo_label VARCHAR(100) DEFAULT 'Limited Time — Free!',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_group (feature_group),
    INDEX idx_key (feature_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- User credit balance
CREATE TABLE user_credits (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL UNIQUE,
    balance INT UNSIGNED NOT NULL DEFAULT 0,
    lifetime_purchased INT UNSIGNED NOT NULL DEFAULT 0,
    lifetime_spent INT UNSIGNED NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Credit transaction log (every deduction and purchase)
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

-- Credit packs available for purchase (admin-configurable)
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
-- SEED: All features at 0 credits (Limited Time Promo)
-- =============================================

INSERT INTO feature_credit_config (feature_key, feature_label, feature_group, credit_cost, description, promo_label) VALUES
-- Video Creation
('ai_script_generate',        'AI Script Generation',           'video_creation',    0, 'Generate video scripts using AI',                  'Limited Time — Free!'),
('ai_script_rewrite',         'AI Script Rewrite',              'video_creation',    0, 'Rewrite/improve existing scripts',                 'Limited Time — Free!'),
('video_render',              'Video Render',                   'video_creation',    0, 'Render a complete video from script',               'Limited Time — Free!'),
('video_render_hd',           'HD Video Render (1080p)',        'video_creation',    0, 'Render in full HD resolution',                      'Limited Time — Free!'),
('thumbnail_generate',        'AI Thumbnail Generation',        'video_creation',    0, 'Generate thumbnail with AI',                        'Limited Time — Free!'),
('aspect_ratio_convert',      'Aspect Ratio Conversion',        'video_creation',    0, 'Convert video to different aspect ratio',            'Limited Time — Free!'),

-- AI Image & Visual
('image_generate',            'AI Image Generation',            'ai_visual',         0, 'Generate scene images with AI (DALL-E)',             'Limited Time — Free!'),
('image_style_transfer',      'Style Transfer',                 'ai_visual',         0, 'Apply art style to images',                         'Limited Time — Free!'),
('character_consistency',     'Character Consistency',           'ai_visual',         0, 'Maintain character across scenes',                   'Limited Time — Free!'),
('text_to_scenes',            'Text-to-Scenes',                 'ai_visual',         0, 'Generate visual scene sequence from text',            'Limited Time — Free!'),

-- Voice & Audio
('tts_generate',              'Text-to-Speech',                 'voice_audio',       0, 'Generate speech from text (Kokoro)',                  'Limited Time — Free!'),
('voice_clone',               'Voice Cloning',                  'voice_audio',       0, 'Clone voice from 3-second sample',                   'Limited Time — Free!'),
('auto_caption',              'Auto-Captioning',                'voice_audio',       0, 'Generate captions/subtitles from audio',              'Limited Time — Free!'),

-- Avatar
('avatar_quick',              'Quick Avatar (3D)',              'avatar',            0, 'TalkingHead 3D avatar video',                        'Limited Time — Free!'),
('avatar_photo',              'Photo Avatar (Wav2Lip)',         'avatar',            0, 'Animate photo with lip-sync',                        'Limited Time — Free!'),
('avatar_pro',                'Pro Avatar (D-ID)',              'avatar',            0, 'Photorealistic talking-head video',                   'Limited Time — Free!'),
('multilang_lipsync',         'Multi-Language Lip-Sync',        'avatar',            0, 'Translate + lip-sync to other language',              'Limited Time — Free!'),

-- Content Remix
('remix_extract',             'Content Extraction',             'remix',             0, 'Extract content from URL/PDF/audio/etc',              'Limited Time — Free!'),
('remix_generate',            'Content Remix Generation',       'remix',             0, 'Generate remixed content for platforms',               'Limited Time — Free!'),
('remix_to_video',            'Remix to Video',                 'remix',             0, 'Convert remixed content into video script',            'Limited Time — Free!'),

-- AI Writer
('writer_blog_post',          'AI Writer — Blog Post',          'writer',            0, 'Generate blog post with AI',                          'Limited Time — Free!'),
('writer_article',            'AI Writer — Article',            'writer',            0, 'Generate article with AI',                            'Limited Time — Free!'),
('writer_linkedin',           'AI Writer — LinkedIn Post',      'writer',            0, 'Generate LinkedIn post with AI',                      'Limited Time — Free!'),
('writer_newsletter',         'AI Writer — Newsletter',         'writer',            0, 'Generate newsletter with AI',                         'Limited Time — Free!'),
('writer_product_desc',       'AI Writer — Product Description','writer',            0, 'Generate product description with AI',                 'Limited Time — Free!'),
('writer_press_release',      'AI Writer — Press Release',      'writer',            0, 'Generate press release with AI',                       'Limited Time — Free!'),

-- Publishing & Scheduling
('publish_video',             'Publish to Platform',            'publishing',        0, 'Publish video to a social platform',                  'Limited Time — Free!'),
('bulk_schedule',             'Bulk Schedule',                  'publishing',        0, 'Schedule batch of videos',                             'Limited Time — Free!'),

-- SEO & Discovery
('seo_topic_discover',        'SEO Topic Discovery',            'discovery',         0, 'Discover trending topics with Google Trends',          'Limited Time — Free!'),
('idea_search',               'Idea Search',                    'discovery',         0, 'Search for content ideas across platforms',             'Limited Time — Free!'),

-- Stock Media
('stock_media_download',      'Stock Media Download',           'stock_media',       0, 'Download stock video/photo/audio',                     'Limited Time — Free!'),

-- Marketplace
('marketplace_list',          'List on Marketplace',            'marketplace',       0, 'List an item for sale on marketplace',                 'Limited Time — Free!');

-- =============================================
-- SEED: Default credit packs
-- =============================================

INSERT INTO credit_packs (name, credits, price_cents, badge_label, badge_color, sort_order, is_active, is_featured) VALUES
('Starter Pack',     100,    999,   'Starter',     'primary',    1, 1, 0),
('Creator Pack',     500,   3999,   'Popular',     'secondary',  2, 1, 1),
('Pro Pack',        1500,   9999,   'Best Value',  'accent',     3, 1, 0),
('Studio Pack',     5000,  29999,   'Studio',      'primary',    4, 1, 0),
('Enterprise Pack', 20000, 99999,   'Enterprise',  'dark',       5, 1, 0);
