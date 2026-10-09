-- =============================================
-- Contentine Create — System API Key Management
-- Multi-key fallback rotation, encrypted at rest
-- MySQL 8.0+ | InnoDB | UTF-8mb4
-- =============================================

-- System API keys — multi-key with fallback rotation, encrypted at rest
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

-- API key usage log
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

-- System services registry
CREATE TABLE system_services (
    service VARCHAR(50) PRIMARY KEY,
    display_name VARCHAR(100) NOT NULL,
    documentation_url VARCHAR(500),
    default_daily_limit INT UNSIGNED DEFAULT 0,
    default_hourly_limit INT UNSIGNED DEFAULT 0,
    notes TEXT,
    required TINYINT(1) DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed service registry
INSERT INTO system_services (service, display_name, documentation_url, default_daily_limit, default_hourly_limit, notes, required) VALUES
('anthropic',     'Anthropic (Claude API)',   'https://docs.anthropic.com/',                     0,     60,   'Script gen, remix, AI writer.',           1),
('openai',        'OpenAI (DALL-E)',          'https://platform.openai.com/docs/',               0,     60,   'Image generation.',                       1),
('youtube',       'YouTube Data API v3',      'https://developers.google.com/youtube/v3/',       10000, 0,    'Quota units/day. Publishing + analytics.',0),
('tiktok',        'TikTok for Developers',    'https://developers.tiktok.com/',                  0,     0,    'Content publishing.',                     0),
('instagram',     'Instagram Graph API',      'https://developers.facebook.com/docs/instagram/', 200,   0,    'Calls/hr/token. Publishing + insights.',  0),
('facebook',      'Facebook Graph API',       'https://developers.facebook.com/docs/',           200,   0,    'Calls/hr/token. Publishing.',             0),
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
