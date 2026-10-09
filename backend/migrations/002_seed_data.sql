-- =============================================
-- Contentine Create — Seed Data
-- Realistic test data for development
-- =============================================

-- --- 5 Test Users ---
INSERT INTO users (auth0_sub, email, password_hash, name, plan_tier, timezone, role) VALUES
('auth0|seed001', 'sarah@example.com', '$2y$12$placeholder', 'Sarah Chen', 'professional', 'America/New_York', 'owner'),
('auth0|seed002', 'james@example.com', '$2y$12$placeholder', 'James Rivera', 'starter', 'America/Los_Angeles', 'owner'),
('auth0|seed003', 'aisha@example.com', '$2y$12$placeholder', 'Aisha Patel', 'free', 'Europe/London', 'owner'),
('auth0|seed004', 'marcus@example.com', '$2y$12$placeholder', 'Marcus Johnson', 'business', 'America/Chicago', 'owner'),
('auth0|seed005', 'yuki@example.com', '$2y$12$placeholder', 'Yuki Tanaka', 'professional', 'Asia/Tokyo', 'owner');

-- --- 20 Voice Profiles (Kokoro presets) ---
-- SA-32: every kokoro_voice_id below is a REAL Kokoro-82M v1.0 voice, verified
-- against the sha256-pinned voices/<id>.bin artifact BOM (frontend/src/lib/
-- model-artifacts.ts) intersected with kokoro-js's VOICES table (the 28 en-us/
-- en-gb voices kokoro.generate() accepts). Nine rows previously carried
-- fabricated OpenAI-style ids (am_leo, am_alloy, am_fable, af_shimmer, af_luna,
-- af_aria, am_felix, af_sage, am_dash) that throw "Voice <id> not found".
-- Row ORDER is load-bearing: AUTO_INCREMENT id 1..20 must match the ids in
-- frontend/src/lib/voice-presets.ts (videos.voice_id FKs depend on it).
INSERT INTO voice_profiles (name, kokoro_voice_id, source, language, gender, tone, speed, pitch, style, is_preset) VALUES
('Sky', 'af_sky', 'preset', 'en', 'female', 'warm', 1.00, 0.00, 'conversational', TRUE),
('Bella', 'af_bella', 'preset', 'en', 'female', 'friendly', 1.00, 0.00, 'conversational', TRUE),
('Nicole', 'af_nicole', 'preset', 'en', 'female', 'confident', 1.00, 0.00, 'professional', TRUE),
('Sarah', 'af_sarah', 'preset', 'en', 'female', 'calm', 0.95, 0.00, 'narration', TRUE),
('Heart', 'af_heart', 'preset', 'en', 'female', 'enthusiastic', 1.05, 0.00, 'energetic', TRUE),
('Nova', 'af_nova', 'preset', 'en', 'female', 'modern', 1.00, 0.00, 'casual', TRUE),
('River', 'af_river', 'preset', 'en', 'female', 'soothing', 0.90, 0.00, 'meditation', TRUE),
('Adam', 'am_adam', 'preset', 'en', 'male', 'deep', 1.00, 0.00, 'professional', TRUE),
('Michael', 'am_michael', 'preset', 'en', 'male', 'authoritative', 0.95, 0.00, 'narration', TRUE),
('Echo', 'am_echo', 'preset', 'en', 'male', 'warm', 1.00, 0.00, 'conversational', TRUE),
('Puck', 'am_puck', 'preset', 'en', 'male', 'energetic', 1.10, 0.00, 'social_media', TRUE),
('Onyx', 'am_onyx', 'preset', 'en', 'male', 'smooth', 0.95, 0.00, 'luxury', TRUE),
('Fenrir', 'am_fenrir', 'preset', 'en', 'male', 'neutral', 1.00, 0.00, 'corporate', TRUE),
('Fable', 'bm_fable', 'preset', 'en-GB', 'male', 'storytelling', 0.90, 0.00, 'narration', TRUE),
('Kore', 'af_kore', 'preset', 'en', 'female', 'bright', 1.05, 0.00, 'tutorial', TRUE),
('Aoede', 'af_aoede', 'preset', 'en', 'female', 'mystical', 0.90, 0.00, 'narration', TRUE),
('Emma', 'bf_emma', 'preset', 'en-GB', 'female', 'professional', 1.00, 0.00, 'corporate', TRUE),
('Eric', 'am_eric', 'preset', 'en', 'male', 'casual', 1.05, 0.00, 'social_media', TRUE),
('Alloy', 'af_alloy', 'preset', 'en', 'female', 'wise', 0.90, 0.00, 'educational', TRUE),
('Liam', 'am_liam', 'preset', 'en', 'male', 'fast', 1.20, 0.00, 'energetic', TRUE);

-- --- 30 Avatar Presets ---
INSERT INTO avatar_presets (name, description, gender, age_range, ethnicity, style, photo_path, is_active, sort_order) VALUES
('Corporate Pro', 'Professional business presenter', 'male', '30-40', 'caucasian', 'business', '/avatars/preset/corporate-pro.webp', TRUE, 1),
('Tech Lead', 'Modern tech industry look', 'male', '25-35', 'south-asian', 'casual', '/avatars/preset/tech-lead.webp', TRUE, 2),
('Creative Director', 'Stylish creative professional', 'female', '30-40', 'african-american', 'creative', '/avatars/preset/creative-director.webp', TRUE, 3),
('Wellness Coach', 'Calming health and wellness vibe', 'female', '25-35', 'caucasian', 'wellness', '/avatars/preset/wellness-coach.webp', TRUE, 4),
('News Anchor', 'Professional news presenter', 'male', '35-45', 'caucasian', 'formal', '/avatars/preset/news-anchor.webp', TRUE, 5),
('Social Star', 'Energetic social media personality', 'female', '20-28', 'latino', 'casual', '/avatars/preset/social-star.webp', TRUE, 6),
('Professor', 'Academic and educational', 'male', '45-55', 'caucasian', 'academic', '/avatars/preset/professor.webp', TRUE, 7),
('Startup Founder', 'Young entrepreneur look', 'male', '25-30', 'east-asian', 'tech', '/avatars/preset/startup-founder.webp', TRUE, 8),
('Fitness Trainer', 'Athletic and energetic', 'female', '25-35', 'african-american', 'athletic', '/avatars/preset/fitness-trainer.webp', TRUE, 9),
('Travel Host', 'Adventure and travel vibe', 'female', '28-35', 'south-asian', 'outdoor', '/avatars/preset/travel-host.webp', TRUE, 10),
('Finance Expert', 'Trustworthy financial advisor', 'male', '40-50', 'caucasian', 'formal', '/avatars/preset/finance-expert.webp', TRUE, 11),
('Beauty Guru', 'Fashion and beauty influencer', 'female', '22-30', 'east-asian', 'glam', '/avatars/preset/beauty-guru.webp', TRUE, 12),
('Motivational Speaker', 'Inspiring and dynamic', 'male', '35-45', 'african-american', 'energetic', '/avatars/preset/motivational-speaker.webp', TRUE, 13),
('Food Creator', 'Warm cooking show personality', 'female', '30-40', 'latino', 'warm', '/avatars/preset/food-creator.webp', TRUE, 14),
('Gaming Host', 'Casual gaming and tech', 'male', '20-28', 'caucasian', 'casual', '/avatars/preset/gaming-host.webp', TRUE, 15),
('Yoga Instructor', 'Peaceful and centered', 'female', '28-38', 'south-asian', 'zen', '/avatars/preset/yoga-instructor.webp', TRUE, 16),
('Real Estate Agent', 'Professional property expert', 'male', '30-40', 'caucasian', 'business', '/avatars/preset/real-estate-agent.webp', TRUE, 17),
('Medical Expert', 'Healthcare professional', 'female', '35-45', 'east-asian', 'clinical', '/avatars/preset/medical-expert.webp', TRUE, 18),
('Music Producer', 'Creative music industry look', 'male', '25-35', 'african-american', 'creative', '/avatars/preset/music-producer.webp', TRUE, 19),
('Life Coach', 'Approachable self-help vibe', 'female', '35-45', 'caucasian', 'warm', '/avatars/preset/life-coach.webp', TRUE, 20),
('Science Educator', 'STEM and education focused', 'male', '30-40', 'south-asian', 'academic', '/avatars/preset/science-educator.webp', TRUE, 21),
('Fashion Designer', 'High fashion aesthetic', 'female', '25-35', 'caucasian', 'fashion', '/avatars/preset/fashion-designer.webp', TRUE, 22),
('Sports Analyst', 'Athletic commentary style', 'male', '30-40', 'latino', 'sporty', '/avatars/preset/sports-analyst.webp', TRUE, 23),
('Parenting Expert', 'Friendly family content', 'female', '30-40', 'african-american', 'warm', '/avatars/preset/parenting-expert.webp', TRUE, 24),
('Crypto Trader', 'Modern finance and crypto', 'male', '25-35', 'east-asian', 'tech', '/avatars/preset/crypto-trader.webp', TRUE, 25),
('Meditation Guide', 'Serene and peaceful', 'female', '30-45', 'caucasian', 'zen', '/avatars/preset/meditation-guide.webp', TRUE, 26),
('Sales Coach', 'Dynamic sales personality', 'male', '35-45', 'caucasian', 'business', '/avatars/preset/sales-coach.webp', TRUE, 27),
('DIY Creator', 'Hands-on craft personality', 'female', '25-35', 'latino', 'crafty', '/avatars/preset/diy-creator.webp', TRUE, 28),
('Legal Advisor', 'Professional legal look', 'male', '40-50', 'caucasian', 'formal', '/avatars/preset/legal-advisor.webp', TRUE, 29),
('Pet Expert', 'Animal lover personality', 'female', '25-35', 'caucasian', 'casual', '/avatars/preset/pet-expert.webp', TRUE, 30);

-- --- 20 Videos (for test users) ---
INSERT INTO videos (user_id, title, type, style_mode, aspect_ratio, duration_seconds, status, created_at) VALUES
(1, 'Morning Routine for Productivity', 'faceless', 'ai_visuals', '9:16', 62, 'completed', '2026-02-20 10:00:00'),
(1, '5 Marketing Tips for 2026', 'faceless', 'ai_visuals', '9:16', 48, 'completed', '2026-02-21 14:00:00'),
(1, 'How to Build a Personal Brand', 'faceless', 'stock', '16:9', 95, 'published', '2026-02-22 09:00:00'),
(1, 'Top 10 AI Tools This Week', 'faceless', 'ai_visuals', '9:16', 73, 'draft', '2026-02-23 11:00:00'),
(2, 'React vs Vue in 2026', 'faceless', 'ai_visuals', '16:9', 85, 'completed', '2026-02-19 16:00:00'),
(2, 'CSS Tricks You Need to Know', 'faceless', 'text_to_scene', '9:16', 45, 'completed', '2026-02-20 13:00:00'),
(2, 'Building Your First API', 'avatar', 'ai_visuals', '16:9', 120, 'rendering', '2026-02-24 08:00:00'),
(2, 'TypeScript Best Practices', 'faceless', 'ai_visuals', '9:16', 55, 'draft', '2026-02-25 10:00:00'),
(3, 'Healthy Meal Prep Ideas', 'faceless', 'stock', '9:16', 68, 'completed', '2026-02-18 12:00:00'),
(3, 'Budget Travel Guide Europe', 'faceless', 'ai_visuals', '9:16', 80, 'completed', '2026-02-20 15:00:00'),
(3, 'Minimalist Home Tour', 'faceless', 'ai_visuals', '16:9', 90, 'draft', '2026-02-22 11:00:00'),
(4, 'Leadership Skills for Managers', 'avatar', 'ai_visuals', '16:9', 110, 'published', '2026-02-17 09:00:00'),
(4, 'Remote Team Management', 'faceless', 'ai_visuals', '9:16', 65, 'completed', '2026-02-19 14:00:00'),
(4, 'Quarterly Business Review Template', 'faceless', 'stock', '16:9', 95, 'completed', '2026-02-21 10:00:00'),
(4, 'Hiring Best Practices', 'faceless', 'ai_visuals', '9:16', 50, 'published', '2026-02-23 08:00:00'),
(4, 'OKR Framework Explained', 'faceless', 'text_to_scene', '16:9', 75, 'draft', '2026-02-25 11:00:00'),
(5, 'Japanese Street Food Guide', 'faceless', 'ai_visuals', '9:16', 72, 'completed', '2026-02-16 13:00:00'),
(5, 'Tokyo Hidden Gems', 'faceless', 'stock', '9:16', 58, 'published', '2026-02-18 10:00:00'),
(5, 'Learn Japanese in 30 Days', 'avatar', 'ai_visuals', '16:9', 130, 'completed', '2026-02-20 08:00:00'),
(5, 'Anime Recommendations 2026', 'faceless', 'ai_visuals', '9:16', 45, 'draft', '2026-02-24 15:00:00');

-- --- 10 Scheduled Posts ---
INSERT INTO scheduled_posts (video_id, platform, scheduled_at, status, title) VALUES
(3, 'youtube', '2026-03-01 12:00:00', 'pending', 'How to Build a Personal Brand in 2026'),
(3, 'tiktok', '2026-03-01 14:00:00', 'pending', 'Personal Brand Tips'),
(1, 'instagram', '2026-03-02 10:00:00', 'pending', 'Morning Routine'),
(5, 'youtube', '2026-03-03 09:00:00', 'pending', 'React vs Vue — The Full Comparison'),
(12, 'linkedin', '2026-02-28 08:00:00', 'published', 'Leadership Skills Every Manager Needs'),
(15, 'tiktok', '2026-02-27 18:00:00', 'published', 'Hiring Tips That Work'),
(18, 'instagram', '2026-02-26 12:00:00', 'published', 'Tokyo Hidden Gems You Must Visit'),
(9, 'tiktok', '2026-03-04 15:00:00', 'pending', 'Meal Prep Made Easy'),
(10, 'youtube', '2026-03-05 11:00:00', 'pending', 'Budget Travel: Europe Edition'),
(19, 'youtube', '2026-03-06 09:00:00', 'pending', 'Learn Japanese — Complete Beginner Guide');

-- --- 5 Remix Projects ---
INSERT INTO remix_projects (user_id, name, target_platforms, status, created_at) VALUES
(1, 'Marketing Blog Remix', '["twitter","linkedin","instagram","video_script"]', 'generated', '2026-02-22 10:00:00'),
(2, 'Dev Tutorial Repurpose', '["twitter","tiktok","blog","video_script"]', 'generated', '2026-02-23 14:00:00'),
(3, 'Travel Content Pack', '["instagram","tiktok","facebook","newsletter"]', 'draft', '2026-02-24 09:00:00'),
(4, 'Leadership Series', '["linkedin","twitter","blog","video_script","newsletter"]', 'generated', '2026-02-25 11:00:00'),
(5, 'Japan Culture Content', '["instagram","tiktok","twitter","blog"]', 'generated', '2026-02-26 13:00:00');

-- --- Idea Searches ---
INSERT INTO idea_searches (user_id, query, platform, created_at) VALUES
(1, 'content marketing trends 2026', 'youtube', '2026-02-20 10:00:00'),
(1, 'social media strategy', 'tiktok', '2026-02-21 14:00:00'),
(2, 'react server components', 'youtube', '2026-02-22 09:00:00'),
(3, 'minimalist living tips', 'instagram', '2026-02-23 11:00:00'),
(4, 'remote work productivity', 'linkedin', '2026-02-24 08:00:00'),
(5, 'japanese cooking beginner', 'youtube', '2026-02-25 13:00:00'),
(1, 'email marketing automation', 'twitter', '2026-02-26 10:00:00'),
(2, 'typescript generics tutorial', 'youtube', '2026-02-26 15:00:00'),
(3, 'budget travel hacks', 'tiktok', '2026-02-27 09:00:00'),
(4, 'team building activities', 'linkedin', '2026-02-27 11:00:00');

-- --- Notifications ---
INSERT INTO notifications (user_id, type, title, body, is_read) VALUES
(1, 'render_complete', 'Video ready', 'Morning Routine for Productivity has finished rendering.', TRUE),
(1, 'post_published', 'Published to YouTube', 'How to Build a Personal Brand is now live on YouTube.', FALSE),
(2, 'render_complete', 'Video ready', 'React vs Vue in 2026 has finished rendering.', TRUE),
(4, 'post_published', 'Published to LinkedIn', 'Leadership Skills for Managers is now live.', TRUE),
(5, 'post_published', 'Published to Instagram', 'Tokyo Hidden Gems is now live on Instagram.', FALSE),
(1, 'system', 'Welcome to Contentine Create', 'Start by creating your first AI video or remixing existing content.', TRUE);
