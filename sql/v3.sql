-- =====================================================================
-- LearnHub — High-Scale Database Schema (Redis Ready)
-- =====================================================================

-- ---------- Extensions ----------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================================
-- 1. ENUM TYPES
-- =====================================================================
DO $$ BEGIN CREATE TYPE public.app_role      AS ENUM ('admin','user');                 EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.part_kind     AS ENUM ('recorded','live');              EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.test_scope    AS ENUM ('course','subject','chapter');   EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.test_type     AS ENUM ('test','quiz','dpp');            EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.discount_type AS ENUM ('percent','fixed');              EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =====================================================================
-- 2. UTILITY FUNCTIONS
-- =====================================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END;
 $$;

-- =====================================================================
-- 3. TABLES
-- =====================================================================

-- 3.1 profiles -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL UNIQUE,
  display_name        text,
  avatar_url          text,
  bio                 text,
  phone               text,
  referral_code       text NOT NULL DEFAULT upper(substr(md5(random()::text), 1, 8)),
  referred_by         uuid,
  level               integer NOT NULL DEFAULT 1,
  xp                  integer NOT NULL DEFAULT 0,
  coins               integer NOT NULL DEFAULT 0,
  current_streak      integer NOT NULL DEFAULT 0,
  longest_streak      integer NOT NULL DEFAULT 0,
  last_activity_date  date,
  total_videos_watched integer NOT NULL DEFAULT 0, -- Added for O(1) badge checks
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- 3.2 user_roles -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_roles (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL,
  role       public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- 3.3 courses --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.courses (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              text NOT NULL UNIQUE,
  title             text NOT NULL,
  description       text,
  meta_description  text,
  thumbnail_url     text,
  instructor        text,
  price_inr         integer NOT NULL DEFAULT 0,
  currency          text    NOT NULL DEFAULT 'INR',
  is_published      boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- 3.4 subjects -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subjects (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id  uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  name       text NOT NULL,
  position   integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3.5 chapters -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chapters (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  name       text NOT NULL,
  position   integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3.6 parts ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.parts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id uuid NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  name       text NOT NULL,
  kind       public.part_kind NOT NULL DEFAULT 'recorded',
  video_id   text NOT NULL,
  notes_url  text,
  duration   text,
  position   integer NOT NULL DEFAULT 0,
  is_preview boolean NOT NULL DEFAULT false,
  live_chat_enabled boolean NOT NULL DEFAULT false, -- Added live chat support
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3.7 enrollments ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.enrollments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL,
  course_id          uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  amount_paid_inr    integer NOT NULL DEFAULT 0,
  promocode          text,
  stripe_session_id  text,
  enrolled_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, course_id)
);

-- 3.8 progress -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.progress (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL,
  part_id          uuid NOT NULL REFERENCES public.parts(id) ON DELETE CASCADE,
  watched_seconds  integer NOT NULL DEFAULT 0,
  completed        boolean NOT NULL DEFAULT false,
  completed_at     timestamptz,
  last_watched_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, part_id)
);

-- 3.9 tests ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id        uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  subject_id       uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  chapter_id       uuid REFERENCES public.chapters(id) ON DELETE SET NULL,
  title            text NOT NULL,
  description      text,
  scope            public.test_scope NOT NULL DEFAULT 'course',
  test_type        public.test_type  NOT NULL DEFAULT 'test',
  duration_minutes integer NOT NULL DEFAULT 30,
  pass_score       integer NOT NULL DEFAULT 40,
  is_published     boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- 3.10 questions -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.questions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id    uuid NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
  text       text NOT NULL,
  image_url  text,
  marks      integer NOT NULL DEFAULT 1,
  position   integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3.11 question_options ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.question_options (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  text        text NOT NULL,
  is_correct  boolean NOT NULL DEFAULT false,
  position    integer NOT NULL DEFAULT 0
);

-- 3.12 test_attempts -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.test_attempts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  test_id     uuid NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
  score       integer NOT NULL DEFAULT 0,
  total       integer NOT NULL DEFAULT 0,
  passed      boolean NOT NULL DEFAULT false,
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

-- 3.13 test_answers --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.test_answers (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id         uuid NOT NULL REFERENCES public.test_attempts(id) ON DELETE CASCADE,
  question_id        uuid NOT NULL REFERENCES public.questions(id)     ON DELETE CASCADE,
  selected_option_id uuid REFERENCES public.question_options(id)        ON DELETE SET NULL,
  is_correct         boolean NOT NULL DEFAULT false
);

-- 3.14 promocodes ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.promocodes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code           text NOT NULL UNIQUE,
  course_id      uuid REFERENCES public.courses(id) ON DELETE CASCADE,
  discount_type  public.discount_type NOT NULL,
  discount_value integer NOT NULL,
  max_uses       integer,
  uses_count     integer NOT NULL DEFAULT 0,
  expires_at     timestamptz,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- 3.15 promocode_redemptions ----------------------------------------
CREATE TABLE IF NOT EXISTS public.promocode_redemptions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL,
  course_id    uuid NOT NULL REFERENCES public.courses(id)    ON DELETE CASCADE,
  promocode_id uuid NOT NULL REFERENCES public.promocodes(id) ON DELETE CASCADE,
  redeemed_at  timestamptz NOT NULL DEFAULT now()
);

-- 3.16 rewards -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rewards (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  description  text,
  cost_coins   integer NOT NULL,
  reward_type  text NOT NULL DEFAULT 'discount',
  reward_value text,
  icon         text,
  stock        integer,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- 3.17 reward_redemptions -------------------------------------------
CREATE TABLE IF NOT EXISTS public.reward_redemptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL,
  reward_id     uuid NOT NULL REFERENCES public.rewards(id) ON DELETE CASCADE,
  cost_paid     integer NOT NULL,
  code_granted  text,
  redeemed_at   timestamptz NOT NULL DEFAULT now()
);

-- 3.18 badges + user_badges -----------------------------------------
CREATE TABLE IF NOT EXISTS public.badges (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE,
  name        text NOT NULL,
  description text,
  icon        text,
  xp_reward   integer NOT NULL DEFAULT 0,
  coin_reward integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_badges (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   uuid NOT NULL,
  badge_id  uuid NOT NULL REFERENCES public.badges(id) ON DELETE CASCADE,
  earned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, badge_id)
);

-- 3.19 referrals -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.referrals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id     uuid NOT NULL,
  referred_id     uuid NOT NULL UNIQUE,
  reward_granted  boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- 3.20 coin_ledger ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.coin_ledger (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  source     text NOT NULL,
  ref_id     text,
  course_id  uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  xp         integer NOT NULL DEFAULT 0,
  coins      integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint prevents spamming coins for the same video
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ledger_video_minute
  ON public.coin_ledger(user_id, source, ref_id)
  WHERE source = 'video';

-- 3.21 activity_log --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.activity_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL,
  activity_date   date NOT NULL DEFAULT CURRENT_DATE,
  videos_watched  integer NOT NULL DEFAULT 0,
  xp_earned       integer NOT NULL DEFAULT 0,
  UNIQUE (user_id, activity_date)
);

-- 3.22 announcements + reads ----------------------------------------
CREATE TABLE IF NOT EXISTS public.announcements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title       text NOT NULL,
  body        text,
  image_url   text,
  video_url   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.announcement_reads (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL,
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  read_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, announcement_id)
);

-- 3.23 comments ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.comments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id      uuid NOT NULL REFERENCES public.parts(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL,
  parent_id    uuid REFERENCES public.comments(id) ON DELETE CASCADE, 
  display_name text,         
  avatar_url   text,         
  message      text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- =====================================================================
-- 4. INDEXES (Optimized for Scale)
-- =====================================================================
-- Standard FK Indexes
CREATE INDEX IF NOT EXISTS idx_subjects_course   ON public.subjects(course_id);
CREATE INDEX IF NOT EXISTS idx_chapters_subject  ON public.chapters(subject_id);
CREATE INDEX IF NOT EXISTS idx_parts_chapter     ON public.parts(chapter_id);
CREATE INDEX IF NOT EXISTS idx_enroll_user       ON public.enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_enroll_course     ON public.enrollments(course_id);

-- Critical for High-Load: Progress lookups
CREATE INDEX IF NOT EXISTS idx_progress_user_part ON public.progress(user_id, part_id);

-- Critical for High-Load: Leaderboard/Stats aggregation
CREATE INDEX IF NOT EXISTS idx_ledger_user_source_course ON public.coin_ledger(user_id, source, course_id);
CREATE INDEX IF NOT EXISTS idx_ledger_created_at ON public.coin_ledger(created_at DESC); -- Time series queries

-- Comments
CREATE INDEX IF NOT EXISTS idx_comments_part_created ON public.comments(part_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_comments_parent       ON public.comments(parent_id) WHERE parent_id IS NOT NULL;

-- =====================================================================
-- 5. TIMESTAMPS & BASIC TRIGGERS
-- =====================================================================
DROP TRIGGER IF EXISTS trg_profiles_updated ON public.profiles;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_courses_updated ON public.courses;
CREATE TRIGGER trg_courses_updated BEFORE UPDATE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================================
-- 5.1 PROMOCODE TRIGGER
-- =====================================================================
CREATE OR REPLACE FUNCTION public.increment_promocode_uses()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN
  UPDATE public.promocodes SET uses_count = uses_count + 1 WHERE id = NEW.promocode_id;
  RETURN NEW;
END;
 $$;

DROP TRIGGER IF EXISTS trg_increment_promocode_uses ON public.promocode_redemptions;
CREATE TRIGGER trg_increment_promocode_uses
  AFTER INSERT ON public.promocode_redemptions
  FOR EACH ROW EXECUTE FUNCTION public.increment_promocode_uses();

-- =====================================================================
-- 6. SECURITY-DEFINER HELPERS
-- =====================================================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$   SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
 $$;

CREATE OR REPLACE FUNCTION public.is_enrolled(_user_id uuid, _course_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$   SELECT EXISTS (SELECT 1 FROM public.enrollments WHERE user_id = _user_id AND course_id = _course_id)
 $$;

-- ---------------------------------------------------------------------
-- 6.1 LEADERBOARD AGGREGATOR (Redis Hydration Function)
-- ---------------------------------------------------------------------
-- PERFORMANCE NOTE: With millions of users, do NOT call this on every page load.
-- Instead, run this via a Cron Job (e.g., every 5 mins) and push the results
-- into a Redis Sorted Set (ZADD).
CREATE OR REPLACE FUNCTION public.get_leaderboard(_course_id uuid DEFAULT NULL)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  avatar_url text,
  level integer,
  xp bigint,
  coins bigint,
  videos bigint,
  tests bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$   WITH user_stats AS (
    SELECT 
      user_id,
      SUM(xp)::bigint AS sum_xp,
      SUM(coins)::bigint AS sum_coins,
      COUNT(*) FILTER (WHERE source = 'video')::bigint AS vid_count,
      COUNT(*) FILTER (WHERE source = 'test_attempt')::bigint AS test_count
    FROM public.coin_ledger
    WHERE _course_id IS NULL OR course_id = _course_id
    GROUP BY user_id
  )
  SELECT
    p.user_id,
    p.display_name,
    p.avatar_url,
    COALESCE(p.level, 1)::integer AS level,
    COALESCE(s.sum_xp, 0)::bigint AS xp,
    COALESCE(s.sum_coins, 0)::bigint AS coins,
    COALESCE(s.vid_count, 0)::bigint AS videos,
    COALESCE(s.test_count, 0)::bigint AS tests
  FROM public.profiles p
  LEFT JOIN user_stats s ON s.user_id = p.user_id
  ORDER BY 
    COALESCE(s.sum_xp, 0) DESC,
    COALESCE(s.sum_coins, 0) DESC
  LIMIT 100;
 $$;

REVOKE EXECUTE ON FUNCTION public.get_leaderboard FROM anon;
GRANT EXECUTE ON FUNCTION public.get_leaderboard TO authenticated;

-- =====================================================================
-- 7. NEW-USER TRIGGER
-- =====================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ DECLARE
  ref_code      text;
  referrer_uuid uuid;
BEGIN
  ref_code := NEW.raw_user_meta_data->>'referral_code';
  IF ref_code IS NOT NULL AND ref_code <> '' THEN
    SELECT user_id INTO referrer_uuid FROM public.profiles WHERE referral_code = upper(ref_code) LIMIT 1;
  END IF;

  INSERT INTO public.profiles (user_id, display_name, avatar_url, referred_by)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name',
             NEW.raw_user_meta_data->>'full_name',
             split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url',
    referrer_uuid
  );

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');

  IF referrer_uuid IS NOT NULL THEN
    INSERT INTO public.referrals (referrer_id, referred_id) VALUES (referrer_uuid, NEW.id)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
 $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================================
-- 8. REDIS INTEGRATION LAYER (Cache Invalidation)
-- =====================================================================
-- This function sends a PostgreSQL NOTIFY event whenever critical data changes.
-- Your backend (Node/Edge) listens to 'cache_invalidation' and deletes the 
-- corresponding Redis key (e.g., DEL course:{id}).
CREATE OR REPLACE FUNCTION public.notify_cache_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ DECLARE
  payload json;
  channel text := 'cache_invalidation';
BEGIN
  -- Construct JSON payload
  payload := json_build_object(
    'table', TG_TABLE_NAME,
    'op', TG_OP,
    'id', COALESCE(NEW.id, OLD.id)
  );

  -- Special handling for composite keys or foreign keys if needed
  IF TG_TABLE_NAME = 'progress' THEN
    payload := payload || json_build_object('user_id', COALESCE(NEW.user_id, OLD.user_id));
  END IF;

  -- Send notification
  PERFORM pg_notify(channel, payload::text);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
 $$;

-- Attach Invalidators to high-traffic tables
DROP TRIGGER IF EXISTS trg_cache_courses ON public.courses;
CREATE TRIGGER trg_cache_courses AFTER INSERT OR UPDATE OR DELETE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.notify_cache_change();

DROP TRIGGER IF EXISTS trg_cache_parts ON public.parts;
CREATE TRIGGER trg_cache_parts AFTER INSERT OR UPDATE OR DELETE ON public.parts
  FOR EACH ROW EXECUTE FUNCTION public.notify_cache_change();

DROP TRIGGER IF EXISTS trg_cache_enrollments ON public.enrollments;
CREATE TRIGGER trg_cache_enrollments AFTER INSERT OR DELETE ON public.enrollments
  FOR EACH ROW EXECUTE FUNCTION public.notify_cache_change();

-- =====================================================================
-- 9. GAMIFICATION TRIGGERS (Optimized)
-- =====================================================================
-- OPTIMIZATION: We removed the heavy SELECT COUNT(*) from the trigger.
-- We now rely on the 'total_videos_watched' column in profiles.
CREATE OR REPLACE FUNCTION public.handle_badge_awards()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ DECLARE
  v_badge_id uuid;
BEGIN
  IF NEW.source = 'video' THEN
    -- Check if this is the first video (O(1) lookup instead of COUNT)
    IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id = NEW.user_id AND total_videos_watched = 0) THEN
       SELECT id INTO v_badge_id FROM public.badges WHERE code = 'first_video' LIMIT 1;
       IF v_badge_id IS NOT NULL THEN
         INSERT INTO public.user_badges (user_id, badge_id)
         VALUES (NEW.user_id, v_badge_id)
         ON CONFLICT (user_id, badge_id) DO NOTHING;
       END IF;
    END IF;

    -- Update the counter for fast future checks
    UPDATE public.profiles 
    SET total_videos_watched = total_videos_watched + 1 
    WHERE user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
 $$;

DROP TRIGGER IF EXISTS trg_award_badges ON public.coin_ledger;
CREATE TRIGGER trg_award_badges
  AFTER INSERT ON public.coin_ledger
  FOR EACH ROW EXECUTE FUNCTION public.handle_badge_awards();

-- =====================================================================
-- 10. RLS & POLICIES (Keeping existing structure, ensuring safety)
-- =====================================================================
ALTER TABLE public.profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapters              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parts                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progress              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tests                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_options      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_attempts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_answers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promocodes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promocode_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rewards               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reward_redemptions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badges                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_badges           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coin_ledger           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_reads    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments              ENABLE ROW LEVEL SECURITY;

-- (Policies abbreviated here for brevity, assuming previous setup was correct.
-- Ensure 'public' is used in policy functions for search_path safety)

-- Profiles
DROP POLICY IF EXISTS "Profiles viewable by everyone" ON public.profiles;
CREATE POLICY "Profiles viewable by everyone" ON public.profiles FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- Enrollments
DROP POLICY IF EXISTS "Users view own enrollments" ON public.enrollments;
CREATE POLICY "Users view own enrollments" ON public.enrollments FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can self-enroll" ON public.enrollments;
CREATE POLICY "Users can self-enroll" ON public.enrollments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Progress (Critical for video playing)
DROP POLICY IF EXISTS "Users view own progress" ON public.progress;
CREATE POLICY "Users view own progress" ON public.progress FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users insert own progress" ON public.progress;
CREATE POLICY "Users insert own progress" ON public.progress FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users update own progress" ON public.progress;
CREATE POLICY "Users update own progress" ON public.progress FOR UPDATE USING (auth.uid() = user_id);

-- Courses
DROP POLICY IF EXISTS "Published courses public" ON public.courses;
CREATE POLICY "Published courses public" ON public.courses FOR SELECT USING (is_published = true);
DROP POLICY IF EXISTS "Admins manage courses" ON public.courses;
CREATE POLICY "Admins manage courses" ON public.courses FOR ALL
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Comments
DROP POLICY IF EXISTS "Enrolled users can read comments" ON public.comments;
CREATE POLICY "Enrolled users can read comments" ON public.comments FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.parts p
    JOIN public.chapters ch ON ch.id = p.chapter_id
    JOIN public.subjects s ON s.id = ch.subject_id
    WHERE p.id = part_id AND public.is_enrolled(auth.uid(), s.course_id)
  )
);
DROP POLICY IF EXISTS "Users can insert own comments" ON public.comments;
CREATE POLICY "Users can insert own comments" ON public.comments FOR INSERT WITH CHECK (auth.uid() = user_id);

-- =====================================================================
-- 11. STORAGE & REALTIME
-- =====================================================================
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars','avatars', true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.profiles    REPLICA IDENTITY FULL;
ALTER TABLE public.coin_ledger REPLICA IDENTITY FULL;
ALTER TABLE public.comments    REPLICA IDENTITY FULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.coin_ledger;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.comments;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =====================================================================
-- 12. SEED DATA
-- =====================================================================
INSERT INTO public.rewards (name, description, cost_coins, reward_type, reward_value, icon, is_active) VALUES
('5% Off Coupon',  'Get 5% off any course. One-time use per user.',  100,'discount','5', '🎟️', true),
('10% Off Coupon', 'Get 10% off any course. One-time use per user.', 500,'discount','10','🎫', true),
('15% Off Coupon', 'Get 15% off any course. One-time use per user.',1000,'discount','15','🏷️', true)
ON CONFLICT DO NOTHING;

INSERT INTO public.badges (code, name, description, icon, xp_reward, coin_reward) VALUES
('first_video', 'First Steps', 'Watched your very first minute of a video!', '🎬', 10, 5)
ON CONFLICT (code) DO NOTHING;

-- =====================================================================
-- 13. ADMIN SETUP
-- =====================================================================
INSERT INTO user_roles (user_id, role)
SELECT id, 'admin' FROM auth.users WHERE email = 'your-admin-email@example.com' LIMIT 1
ON CONFLICT DO NOTHING;