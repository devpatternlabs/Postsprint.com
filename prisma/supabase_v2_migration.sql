-- ==============================================================================
-- POSTSPRINT v2.0 — COMPLETE SUPABASE DATABASE SETUP SCRIPT
-- Execute this script in: https://supabase.com -> SQL Editor -> New query -> Run
-- ==============================================================================

-- 1. PROFILES / USERS TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  email_normalized TEXT UNIQUE NOT NULL,
  name TEXT,
  display_name TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'user', -- 'admin' | 'user'
  auth_provider TEXT DEFAULT 'google',
  plan TEXT DEFAULT 'creator_pro', -- 'free' | 'creator' | 'pro' | 'agency_scale'
  status TEXT DEFAULT 'active',
  account_status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_login TIMESTAMPTZ DEFAULT NOW()
);

-- Seed Initial Super-Admin User for devpatternlabs@gmail.com
INSERT INTO public.profiles (id, email, email_normalized, name, display_name, role, plan, status)
VALUES (
  'usr_admin_devpatternlabs',
  'devpatternlabs@gmail.com',
  'devpatternlabs@gmail.com',
  'DevPatternLabs (Admin)',
  'DevPatternLabs (Admin)',
  'admin',
  'agency_scale',
  'active'
)
ON CONFLICT (email) DO UPDATE SET role = 'admin', plan = 'agency_scale';

-- 2. CONNECTED SOCIAL ACCOUNTS TABLE
CREATE TABLE IF NOT EXISTS public.social_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES public.profiles(id) ON DELETE CASCADE,
  platform TEXT NOT NULL, -- 'youtube' | 'facebook' | 'instagram' | 'threads' | 'whatsapp'
  external_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  page_id TEXT,
  scopes JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, platform, external_id)
);

CREATE INDEX IF NOT EXISTS idx_social_accounts_user ON public.social_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_social_accounts_platform ON public.social_accounts(platform, status);

-- 3. SCHEDULED & PUBLISHED POSTS TABLE
CREATE TABLE IF NOT EXISTS public.posts (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT,
  caption TEXT NOT NULL,
  hashtags TEXT,
  type TEXT DEFAULT 'Post', -- 'Post' | 'Video' | 'Reels' | 'Story'
  ratio TEXT DEFAULT '1:1',
  platforms JSONB NOT NULL DEFAULT '[]'::jsonb,
  scheduled_at TIMESTAMPTZ,
  timezone TEXT DEFAULT 'UTC',
  storage_path TEXT,
  media_url TEXT,
  thumbnail_url TEXT,
  thumbnail_storage_path TEXT,
  thumbnail_fit TEXT DEFAULT 'cover',
  thumbnail_position TEXT DEFAULT 'center',
  status TEXT DEFAULT 'Scheduled', -- 'Draft' | 'Scheduled' | 'Publishing' | 'Published' | 'Failed'
  error TEXT,
  results JSONB DEFAULT '[]'::jsonb,
  metrics JSONB DEFAULT '{"reach":0,"likes":0,"clicks":0,"views":0}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_posts_user ON public.posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_scheduled ON public.posts(status, scheduled_at);

-- 4. CENTRALIZED COMMENTS TABLE
CREATE TABLE IF NOT EXISTS public.social_comments (
  id TEXT PRIMARY KEY,
  post_id TEXT REFERENCES public.posts(id) ON DELETE SET NULL,
  user_id TEXT REFERENCES public.profiles(id) ON DELETE CASCADE,
  platform TEXT NOT NULL, -- 'YouTube' | 'Facebook' | 'Instagram' | 'Threads'
  platform_comment_id TEXT UNIQUE NOT NULL,
  author_name TEXT NOT NULL,
  author_avatar TEXT,
  author_handle TEXT,
  text TEXT NOT NULL,
  like_count INT DEFAULT 0,
  replies JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_comments_post ON public.social_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_social_comments_user ON public.social_comments(user_id);

-- 5. SOCIAL CONVERSATIONS / DIRECT MESSAGES TABLE
CREATE TABLE IF NOT EXISTS public.social_conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES public.profiles(id) ON DELETE CASCADE,
  platform TEXT NOT NULL, -- 'Instagram' | 'Facebook' | 'WhatsApp'
  participant_id TEXT NOT NULL,
  participant_name TEXT NOT NULL,
  participant_avatar TEXT,
  last_message TEXT,
  unread_count INT DEFAULT 0,
  messages JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. POST ANALYTICS & INSIGHTS SNAPSHOT TABLE
CREATE TABLE IF NOT EXISTS public.post_metrics (
  id TEXT PRIMARY KEY,
  post_id TEXT REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES public.profiles(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  impressions INT DEFAULT 0,
  views INT DEFAULT 0,
  reach INT DEFAULT 0,
  clicks INT DEFAULT 0,
  likes INT DEFAULT 0,
  comments INT DEFAULT 0,
  shares INT DEFAULT 0,
  engagement_rate NUMERIC(5,2) DEFAULT 0.00,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. SHORTLINK CLICK TRACKING TABLE (/l/:code)
CREATE TABLE IF NOT EXISTS public.shortlinks (
  code TEXT PRIMARY KEY,
  original_url TEXT NOT NULL,
  post_id TEXT REFERENCES public.posts(id) ON DELETE SET NULL,
  platform TEXT,
  clicks_count INT DEFAULT 0,
  clicks_log JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. STORAGE BUCKET PERMISSIONS
-- Make sure the bucket 'social-videos' exists and is public
INSERT INTO storage.buckets (id, name, public)
VALUES ('social-videos', 'social-videos', true)
ON CONFLICT (id) DO NOTHING;
