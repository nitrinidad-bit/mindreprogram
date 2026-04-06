-- MindReprogram Database Schema
-- PostgreSQL 15+

-- Extensiones
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- ENUMS
-- ============================================

CREATE TYPE subscription_tier AS ENUM ('basic', 'premium', 'pro');
CREATE TYPE subscription_status AS ENUM ('active', 'cancelled', 'expired', 'trial');
CREATE TYPE payment_provider AS ENUM ('stripe', 'paypal');
CREATE TYPE meditation_category AS ENUM ('adhd', 'depression', 'anxiety', 'trauma', 'sleep', 'focus', 'self_compassion', 'anger');
CREATE TYPE neural_target AS ENUM ('theta', 'alpha', 'delta', 'gamma', 'beta');
CREATE TYPE notification_type AS ENUM ('new_meditation', 'reminder', 'achievement', 'streak', 'subscription');

-- ============================================
-- USERS
-- ============================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    telegram_chat_id BIGINT UNIQUE,
    telegram_username VARCHAR(100),
    timezone VARCHAR(50) DEFAULT 'America/Puerto_Rico',
    preferred_voice VARCHAR(50) DEFAULT 'calm_female',
    onboarding_completed BOOLEAN DEFAULT FALSE,
    is_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- SUBSCRIPTIONS
-- ============================================

CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tier subscription_tier NOT NULL DEFAULT 'basic',
    status subscription_status NOT NULL DEFAULT 'trial',
    payment_provider payment_provider,
    provider_subscription_id VARCHAR(255),
    provider_customer_id VARCHAR(255),
    current_period_start TIMESTAMP WITH TIME ZONE,
    current_period_end TIMESTAMP WITH TIME ZONE,
    trial_ends_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '3 days'),
    cancelled_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_provider ON subscriptions(payment_provider, provider_subscription_id);

-- ============================================
-- ACCESS TOKENS (for bot validation)
-- ============================================

CREATE TABLE access_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    tier subscription_tier NOT NULL,
    categories meditation_category[] NOT NULL DEFAULT '{}',
    max_level INTEGER NOT NULL DEFAULT 2,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_revoked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_tokens_user ON access_tokens(user_id);
CREATE INDEX idx_tokens_hash ON access_tokens(token_hash);

-- ============================================
-- MEDITATIONS
-- ============================================

CREATE TABLE meditations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(200) NOT NULL,
    description TEXT,
    category meditation_category NOT NULL,
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes BETWEEN 1 AND 120),
    unlock_level INTEGER NOT NULL DEFAULT 1 CHECK (unlock_level BETWEEN 1 AND 12),
    min_tier subscription_tier NOT NULL DEFAULT 'basic',
    audio_s3_key VARCHAR(500) NOT NULL,
    thumbnail_s3_key VARCHAR(500),
    binaural_frequency DECIMAL,
    neural_target neural_target DEFAULT 'alpha',
    tags TEXT[] DEFAULT '{}',
    script TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    listen_count INTEGER DEFAULT 0,
    avg_rating DECIMAL(3,2) DEFAULT 0,
    created_by UUID REFERENCES users(id),
    published_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_meditations_category ON meditations(category);
CREATE INDEX idx_meditations_level ON meditations(unlock_level);
CREATE INDEX idx_meditations_active ON meditations(is_active, published_at);

-- ============================================
-- USER PROGRESSION
-- ============================================

CREATE TABLE user_progression (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    current_level INTEGER NOT NULL DEFAULT 1 CHECK (current_level BETWEEN 1 AND 12),
    total_minutes INTEGER NOT NULL DEFAULT 0,
    total_sessions INTEGER NOT NULL DEFAULT 0,
    streak_days INTEGER NOT NULL DEFAULT 0,
    longest_streak INTEGER NOT NULL DEFAULT 0,
    consistency_score DECIMAL(4,3) NOT NULL DEFAULT 0.000,
    last_session_at TIMESTAMP WITH TIME ZONE,
    next_level_unlocks_at TIMESTAMP WITH TIME ZONE,
    categories_unlocked meditation_category[] DEFAULT '{adhd}',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_progression_user ON user_progression(user_id);

-- ============================================
-- MEDITATION SESSIONS (listening history)
-- ============================================

CREATE TABLE meditation_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    meditation_id UUID NOT NULL REFERENCES meditations(id) ON DELETE CASCADE,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_listened INTEGER DEFAULT 0, -- seconds
    completed BOOLEAN DEFAULT FALSE,
    mood_before INTEGER CHECK (mood_before BETWEEN 1 AND 10),
    mood_after INTEGER CHECK (mood_after BETWEEN 1 AND 10),
    rating INTEGER CHECK (rating BETWEEN 1 AND 5),
    notes TEXT
);

CREATE INDEX idx_sessions_user ON meditation_sessions(user_id);
CREATE INDEX idx_sessions_date ON meditation_sessions(started_at);

-- ============================================
-- ASSESSMENTS (therapeutic questionnaires)
-- ============================================

CREATE TABLE assessments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assessment_type VARCHAR(20) NOT NULL, -- 'PHQ9', 'GAD7', 'ASRS'
    score INTEGER NOT NULL,
    answers JSONB NOT NULL,
    recommended_categories meditation_category[],
    taken_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_assessments_user ON assessments(user_id);

-- ============================================
-- NOTIFICATIONS LOG
-- ============================================

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type notification_type NOT NULL,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    meditation_id UUID REFERENCES meditations(id),
    sent_via VARCHAR(20) DEFAULT 'telegram',
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    read_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_notifications_user ON notifications(user_id, sent_at);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Calculate duration based on level
CREATE OR REPLACE FUNCTION get_level_duration(level INTEGER)
RETURNS INTEGER AS $$
BEGIN
    RETURN CASE
        WHEN level = 1 THEN 5
        WHEN level = 2 THEN 8
        WHEN level = 3 THEN 10
        WHEN level BETWEEN 4 AND 6 THEN 15
        WHEN level BETWEEN 7 AND 9 THEN 25
        WHEN level BETWEEN 10 AND 11 THEN 40
        WHEN level = 12 THEN 60
        ELSE 5
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER subscriptions_updated BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER meditations_updated BEFORE UPDATE ON meditations
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER progression_updated BEFORE UPDATE ON user_progression
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();
