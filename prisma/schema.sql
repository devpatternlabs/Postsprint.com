-- Postmint Social Studio Database Schema (PostgreSQL)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Platform enum
DO $$ BEGIN
  CREATE TYPE platform_type AS ENUM ('youtube', 'facebook', 'instagram', 'snapchat', 'sharechat');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Account status enum
DO $$ BEGIN
  CREATE TYPE account_status_type AS ENUM ('active', 'expired', 'revoked');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Media type enum
DO $$ BEGIN
  CREATE TYPE media_type_enum AS ENUM ('video', 'image');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Post status enum
DO $$ BEGIN
  CREATE TYPE post_status_enum AS ENUM ('draft', 'queued', 'publishing', 'published', 'failed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Target status enum
DO $$ BEGIN
  CREATE TYPE target_status_enum AS ENUM ('pending', 'success', 'failed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Social Accounts Table
CREATE TABLE IF NOT EXISTS social_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform platform_type NOT NULL,
  external_id VARCHAR(255) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  avatar_url TEXT,
  access_token_enc TEXT NOT NULL,
  refresh_token_enc TEXT,
  expires_at TIMESTAMP WITH TIME ZONE,
  scopes TEXT[] DEFAULT '{}',
  status account_status_type DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_user_platform_external UNIQUE (user_id, platform, external_id)
);

CREATE INDEX IF NOT EXISTS idx_social_accounts_user_id ON social_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_social_accounts_platform_status ON social_accounts(platform, status);

-- 3. Posts Table
CREATE TABLE IF NOT EXISTS posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  media_url TEXT NOT NULL,
  media_type media_type_enum DEFAULT 'video',
  scheduled_at TIMESTAMP WITH TIME ZONE,
  status post_status_enum DEFAULT 'draft',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_posts_user_status ON posts(user_id, status);
CREATE INDEX IF NOT EXISTS idx_posts_scheduled_status ON posts(scheduled_at, status);

-- 4. Post Targets Table
CREATE TABLE IF NOT EXISTS post_targets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  social_account_id UUID NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
  platform_post_id VARCHAR(255),
  status target_status_enum DEFAULT 'pending',
  error_message TEXT,
  published_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_post_targets_post_id ON post_targets(post_id);
CREATE INDEX IF NOT EXISTS idx_post_targets_social_account_id ON post_targets(social_account_id);
CREATE INDEX IF NOT EXISTS idx_post_targets_status ON post_targets(status);
