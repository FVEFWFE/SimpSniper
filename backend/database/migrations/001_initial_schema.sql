-- Initial Schema for Reddit Creator Platform
-- Migration: 001_initial_schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE,
    created_at TIMESTAMP DEFAULT NOW(),
    subscription_tier VARCHAR(50) DEFAULT 'free', -- free, creator, pro, agency
    settings JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Reddit Accounts (users can have multiple)
CREATE TABLE reddit_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    reddit_username VARCHAR(255) NOT NULL,
    reddit_id VARCHAR(255),
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMP,
    post_karma INTEGER DEFAULT 0,
    comment_karma INTEGER DEFAULT 0,
    account_age_days INTEGER,
    is_shadowbanned BOOLEAN DEFAULT FALSE,
    shadowban_checked_at TIMESTAMP,
    is_primary BOOLEAN DEFAULT FALSE,
    status VARCHAR(50) DEFAULT 'active', -- active, warming, backup, banned
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Subreddits master database
CREATE TABLE subreddits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(255),
    subscribers INTEGER,
    active_users INTEGER,
    created_utc TIMESTAMP,
    is_nsfw BOOLEAN DEFAULT TRUE,
    description TEXT,

    -- Clustering/Map Data
    cluster_id VARCHAR(100),
    cluster_name VARCHAR(255),
    x_position FLOAT,
    y_position FLOAT,
    node_size FLOAT,

    -- Engagement Metrics
    avg_upvotes FLOAT,
    median_upvotes FLOAT,
    avg_comments FLOAT,
    posts_per_day FLOAT,
    engagement_score FLOAT,
    competition_score FLOAT,

    -- Requirements
    min_karma INTEGER,
    min_post_karma INTEGER,
    min_comment_karma INTEGER,
    min_account_age_days INTEGER,
    requires_verification BOOLEAN DEFAULT FALSE,
    verification_instructions TEXT,

    -- Rules
    rules_raw TEXT,
    rules_summary TEXT,
    allows_links_in_post BOOLEAN DEFAULT TRUE,
    allows_links_in_comments BOOLEAN DEFAULT TRUE,
    allows_links_in_profile_only BOOLEAN,
    posting_frequency_limit VARCHAR(100),
    posting_frequency_hours INTEGER,
    required_flairs TEXT[],
    banned_words TEXT[],
    content_types_allowed TEXT[],

    -- Metadata
    best_posting_times JSONB,
    niche_tags TEXT[],
    rules_last_updated TIMESTAMP,
    last_scraped TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- User's saved/tracked subreddits
CREATE TABLE user_subreddits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    subreddit_id UUID REFERENCES subreddits(id) ON DELETE CASCADE,
    reddit_account_id UUID REFERENCES reddit_accounts(id) ON DELETE CASCADE,
    is_verified BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMP,
    is_approved_poster BOOLEAN DEFAULT FALSE,
    is_banned BOOLEAN DEFAULT FALSE,
    ban_reason TEXT,
    notes TEXT,
    priority INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, subreddit_id, reddit_account_id)
);

-- Content Vault
CREATE TABLE content_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,

    -- File Info
    filename VARCHAR(500),
    file_type VARCHAR(50), -- 'image', 'video', 'gif'
    file_size INTEGER,
    mime_type VARCHAR(100),
    width INTEGER,
    height INTEGER,
    duration_seconds INTEGER,

    -- Cloud Storage
    cloud_provider VARCHAR(50), -- 'google_drive', 'dropbox', 'local'
    cloud_file_id VARCHAR(500),
    cloud_path TEXT,
    local_path TEXT,
    thumbnail_url TEXT,

    -- Organization
    niche_tags TEXT[],
    content_tags TEXT[],
    custom_tags TEXT[],
    quality_rating INTEGER,
    notes TEXT,

    -- Status Tracking
    status VARCHAR(50) DEFAULT 'fresh', -- fresh, queued, active, cooling, retired
    times_posted INTEGER DEFAULT 0,
    max_uses INTEGER,
    last_posted_at TIMESTAMP,
    cooling_until TIMESTAMP,

    -- Performance
    total_upvotes INTEGER DEFAULT 0,
    total_views INTEGER DEFAULT 0,
    avg_performance_score FLOAT,
    best_subreddit_id UUID REFERENCES subreddits(id),
    best_platform VARCHAR(50),

    -- Metadata
    original_created_at TIMESTAMP,
    imported_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Hosted Media Links (Imgur, Redgifs)
CREATE TABLE media_uploads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    content_item_id UUID REFERENCES content_items(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,

    host VARCHAR(50) NOT NULL, -- 'imgur', 'redgifs'
    host_id VARCHAR(255),
    host_url TEXT NOT NULL,
    host_delete_hash VARCHAR(255),

    -- Hash modification tracking
    original_hash VARCHAR(64),
    modified_hash VARCHAR(64),
    modification_applied VARCHAR(100),

    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP,
    is_deleted BOOLEAN DEFAULT FALSE
);

-- Scheduled Posts
CREATE TABLE scheduled_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    reddit_account_id UUID REFERENCES reddit_accounts(id) ON DELETE CASCADE,
    subreddit_id UUID REFERENCES subreddits(id) ON DELETE CASCADE,
    content_item_id UUID REFERENCES content_items(id),
    media_upload_id UUID REFERENCES media_uploads(id),

    -- Post Content
    title TEXT NOT NULL,
    body TEXT,
    flair_id VARCHAR(100),
    flair_text VARCHAR(255),
    is_nsfw BOOLEAN DEFAULT TRUE,
    is_spoiler BOOLEAN DEFAULT FALSE,
    post_type VARCHAR(50), -- 'link', 'image', 'video', 'text', 'crosspost'
    crosspost_from_id UUID REFERENCES scheduled_posts(id),

    -- Scheduling
    scheduled_for TIMESTAMP NOT NULL,
    timezone VARCHAR(50) DEFAULT 'America/New_York',

    -- Auto-actions
    auto_comment TEXT,
    auto_delete_hours INTEGER,
    auto_delete_if_below_upvotes INTEGER,

    -- Status
    status VARCHAR(50) DEFAULT 'scheduled', -- scheduled, posting, posted, failed, cancelled
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    error_message TEXT,

    -- Compliance
    compliance_checked BOOLEAN DEFAULT FALSE,
    compliance_warnings TEXT[],

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Posted Content History
CREATE TABLE posted_content (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scheduled_post_id UUID REFERENCES scheduled_posts(id),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    reddit_account_id UUID REFERENCES reddit_accounts(id) ON DELETE CASCADE,
    subreddit_id UUID REFERENCES subreddits(id) ON DELETE CASCADE,
    content_item_id UUID REFERENCES content_items(id),

    -- Reddit Data
    reddit_post_id VARCHAR(50),
    reddit_url TEXT,
    permalink TEXT,

    -- Performance
    upvotes INTEGER DEFAULT 0,
    downvotes INTEGER DEFAULT 0,
    score INTEGER DEFAULT 0,
    upvote_ratio FLOAT,
    comments_count INTEGER DEFAULT 0,
    awards_count INTEGER DEFAULT 0,

    -- Tracking
    posted_at TIMESTAMP,
    last_checked_at TIMESTAMP,
    is_removed BOOLEAN DEFAULT FALSE,
    removed_reason TEXT,
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP,
    deleted_reason VARCHAR(100),

    -- Visibility
    is_visible BOOLEAN DEFAULT TRUE,
    visibility_checked_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT NOW()
);

-- Caption Templates
CREATE TABLE caption_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    subreddit_id UUID REFERENCES subreddits(id),

    name VARCHAR(255),
    template_text TEXT NOT NULL,
    variables TEXT[],

    times_used INTEGER DEFAULT 0,
    avg_performance FLOAT,

    is_ai_generated BOOLEAN DEFAULT FALSE,
    is_shared BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMP DEFAULT NOW()
);

-- Auto-Response Templates
CREATE TABLE auto_responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,

    trigger_type VARCHAR(50), -- 'comment', 'dm', 'new_follower'
    trigger_keywords TEXT[],

    response_text TEXT NOT NULL,
    variables TEXT[],

    is_active BOOLEAN DEFAULT TRUE,
    times_triggered INTEGER DEFAULT 0,

    created_at TIMESTAMP DEFAULT NOW()
);

-- Cloud Sync Status
CREATE TABLE cloud_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,

    provider VARCHAR(50) NOT NULL, -- 'google_drive', 'dropbox'
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMP,

    root_folder_id VARCHAR(255),
    root_folder_path TEXT,

    last_sync_at TIMESTAMP,
    sync_status VARCHAR(50) DEFAULT 'idle', -- idle, syncing, error
    sync_error TEXT,

    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Analytics Snapshots
CREATE TABLE analytics_daily (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL,

    -- Reddit
    reddit_posts INTEGER DEFAULT 0,
    reddit_total_upvotes INTEGER DEFAULT 0,
    reddit_total_comments INTEGER DEFAULT 0,
    reddit_profile_clicks INTEGER DEFAULT 0,
    reddit_new_followers INTEGER DEFAULT 0,

    -- Content
    content_items_added INTEGER DEFAULT 0,
    content_items_posted INTEGER DEFAULT 0,

    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, date)
);

-- Indexes for performance
CREATE INDEX idx_reddit_accounts_user ON reddit_accounts(user_id);
CREATE INDEX idx_subreddits_cluster ON subreddits(cluster_id);
CREATE INDEX idx_subreddits_niche ON subreddits USING GIN(niche_tags);
CREATE INDEX idx_user_subreddits_user ON user_subreddits(user_id);
CREATE INDEX idx_content_items_user ON content_items(user_id);
CREATE INDEX idx_content_items_status ON content_items(user_id, status);
CREATE INDEX idx_content_items_tags ON content_items USING GIN(niche_tags);
CREATE INDEX idx_scheduled_posts_user ON scheduled_posts(user_id);
CREATE INDEX idx_scheduled_posts_time ON scheduled_posts(scheduled_for, status);
CREATE INDEX idx_posted_content_user ON posted_content(user_id);
CREATE INDEX idx_posted_content_subreddit ON posted_content(subreddit_id, posted_at);
CREATE INDEX idx_posted_content_account ON posted_content(reddit_account_id);
