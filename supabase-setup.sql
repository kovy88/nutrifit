-- ══════════════════════════════════════════════════════════════
-- NutriPlan — Supabase SQL setup (spusť v SQL Editoru)
-- ══════════════════════════════════════════════════════════════

-- 1. Přidat sloupce pro generační limity do profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS generation_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS generation_reset timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS is_premium boolean DEFAULT false;

-- 2. RPC funkce: atomický increment generace s měsíčním resetem
CREATE OR REPLACE FUNCTION increment_generation(uid uuid)
RETURNS json AS $$
DECLARE
  rec profiles%ROWTYPE;
  free_limit int := 3;
BEGIN
  -- Zajisti že profil existuje (důležité pro Google sign-in)
  INSERT INTO profiles (user_id)
    VALUES (uid)
    ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO rec FROM profiles WHERE user_id = uid;

  -- Reset pokud nový měsíc
  IF rec.generation_reset IS NULL
     OR date_trunc('month', rec.generation_reset) < date_trunc('month', now()) THEN
    UPDATE profiles
      SET generation_count = 0, generation_reset = now()
      WHERE user_id = uid;
    rec.generation_count := 0;
    rec.is_premium := COALESCE(rec.is_premium, false);
  END IF;

  -- Premium = bez limitu
  IF rec.is_premium THEN
    UPDATE profiles SET generation_count = rec.generation_count + 1 WHERE user_id = uid;
    RETURN json_build_object('allowed', true, 'count', rec.generation_count + 1, 'limit', -1, 'premium', true);
  END IF;

  -- Free limit check
  IF rec.generation_count >= free_limit THEN
    RETURN json_build_object('allowed', false, 'count', rec.generation_count, 'limit', free_limit, 'premium', false);
  END IF;

  UPDATE profiles SET generation_count = rec.generation_count + 1 WHERE user_id = uid;
  RETURN json_build_object('allowed', true, 'count', rec.generation_count + 1, 'limit', free_limit, 'premium', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. RPC funkce: čtení aktuálního stavu (pro badge, bez inkrementu)
CREATE OR REPLACE FUNCTION get_generation_info(uid uuid)
RETURNS json AS $$
DECLARE
  rec profiles%ROWTYPE;
  free_limit int := 3;
BEGIN
  SELECT * INTO rec FROM profiles WHERE user_id = uid;
  IF NOT FOUND THEN
    RETURN json_build_object('count', 0, 'limit', free_limit, 'premium', false);
  END IF;

  -- Reset pokud nový měsíc (jen čtení, neincrement)
  IF rec.generation_reset IS NULL
     OR date_trunc('month', rec.generation_reset) < date_trunc('month', now()) THEN
    RETURN json_build_object('count', 0, 'limit', free_limit, 'premium', COALESCE(rec.is_premium, false));
  END IF;

  RETURN json_build_object(
    'count', COALESCE(rec.generation_count, 0),
    'limit', free_limit,
    'premium', COALESCE(rec.is_premium, false)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Trigger: cap meal_history na 10 záznamů per user
CREATE OR REPLACE FUNCTION cap_meal_history()
RETURNS trigger AS $$
BEGIN
  DELETE FROM meal_history
    WHERE id IN (
      SELECT id FROM meal_history
        WHERE user_id = NEW.user_id
        ORDER BY created_at DESC
        OFFSET 10
    );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cap_meal_history ON meal_history;
CREATE TRIGGER trg_cap_meal_history
  AFTER INSERT ON meal_history
  FOR EACH ROW EXECUTE FUNCTION cap_meal_history();

-- 5. RLS policies (pokud ještě nemáš)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_history ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can read own profile') THEN
    CREATE POLICY "Users can read own profile" ON profiles FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update own profile') THEN
    CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own profile') THEN
    CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can read own history') THEN
    CREATE POLICY "Users can read own history" ON meal_history FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own history') THEN
    CREATE POLICY "Users can insert own history" ON meal_history FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
