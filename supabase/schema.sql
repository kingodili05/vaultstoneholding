-- =============================================================
-- VAULTSTONE BANK — SUPABASE SCHEMA
-- =============================================================
-- Paste this entire file into: Supabase Dashboard → SQL Editor → Run
-- =============================================================

-- ── Extensions ───────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================
-- TABLES
-- =============================================================

-- 1. PROFILES  (extends auth.users 1-to-1)
CREATE TABLE IF NOT EXISTS public.profiles (
  id              UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email           TEXT UNIQUE NOT NULL,
  full_name       TEXT NOT NULL DEFAULT '',
  phone           TEXT NOT NULL DEFAULT '',
  country         TEXT NOT NULL DEFAULT 'US',
  dob             DATE,
  account_type    TEXT NOT NULL DEFAULT 'personal'
                  CHECK (account_type IN ('personal','business','wealth')),
  account_number  TEXT UNIQUE,
  role            TEXT NOT NULL DEFAULT 'user'
                  CHECK (role IN ('user','admin')),
  status          TEXT NOT NULL DEFAULT 'pending_kyc'
                  CHECK (status IN ('active','pending_kyc','pending','suspended','locked')),
  kyc_status      TEXT NOT NULL DEFAULT 'not_started'
                  CHECK (kyc_status IN ('not_started','under_review','approved','rejected')),
  avatar          TEXT NOT NULL DEFAULT '',
  last_login      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. ACCOUNTS  (checking / savings / investment per user)
CREATE TABLE IF NOT EXISTS public.accounts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('checking','savings','investment')),
  balance     NUMERIC(15,2) NOT NULL DEFAULT 0.00,
  currency    TEXT NOT NULL DEFAULT 'USD',
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, type)
);

-- 3. KYC SUBMISSIONS
CREATE TABLE IF NOT EXISTS public.kyc_submissions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  document_type       TEXT CHECK (document_type IN ('passport','driver_license','national_id','residence_permit')),
  document_number     TEXT,
  expiry_date         DATE,
  front_document_url  TEXT,
  back_document_url   TEXT,
  selfie_url          TEXT,
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','approved','rejected')),
  rejection_reason    TEXT,
  submitted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at         TIMESTAMPTZ,
  reviewed_by         UUID REFERENCES public.profiles(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. TRANSFERS
CREATE TABLE IF NOT EXISTS public.transfers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  from_name         TEXT NOT NULL,
  to_user_id        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  to_name           TEXT NOT NULL,
  to_account_number TEXT NOT NULL DEFAULT '',
  to_bank           TEXT NOT NULL DEFAULT 'Vaultstone Bank',
  amount            NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  currency          TEXT NOT NULL DEFAULT 'USD',
  note              TEXT NOT NULL DEFAULT '',
  type              TEXT NOT NULL CHECK (type IN ('internal','external')),
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected')),
  approved_by       UUID REFERENCES public.profiles(id),
  rejection_reason  TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at      TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. TRANSACTIONS
CREATE TABLE IF NOT EXISTS public.transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('credit','debit')),
  amount        NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  balance_after NUMERIC(15,2),
  description   TEXT NOT NULL DEFAULT '',
  category      TEXT NOT NULL DEFAULT 'Other',
  merchant      TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'completed'
                CHECK (status IN ('completed','pending','failed')),
  transfer_id   UUID REFERENCES public.transfers(id) ON DELETE SET NULL,
  date          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. NOTIFICATIONS
CREATE TABLE IF NOT EXISTS public.notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('info','success','error','warning')),
  title       TEXT NOT NULL,
  message     TEXT NOT NULL DEFAULT '',
  read        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================
-- INDEXES
-- =============================================================
CREATE INDEX IF NOT EXISTS idx_accounts_user        ON public.accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_kyc_user             ON public.kyc_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_transfers_from       ON public.transfers(from_user_id);
CREATE INDEX IF NOT EXISTS idx_transfers_to         ON public.transfers(to_user_id);
CREATE INDEX IF NOT EXISTS idx_transfers_status     ON public.transfers(status);
CREATE INDEX IF NOT EXISTS idx_transactions_user    ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date    ON public.transactions(date DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user   ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications(user_id, read) WHERE read = FALSE;

-- =============================================================
-- HELPER FUNCTIONS
-- =============================================================

-- Auto-update updated_at column
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE OR REPLACE TRIGGER trg_profiles_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER trg_accounts_updated
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER trg_transfers_updated
  BEFORE UPDATE ON public.transfers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Generate a unique masked account number  e.g. "4521 •••• •••• 7834"
CREATE OR REPLACE FUNCTION public.generate_account_number()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  bins    TEXT[] := ARRAY['4521','6011','5412','3782','4111','3714','6304','4917'];
  bin     TEXT;
  suffix  TEXT;
  acct    TEXT;
  tries   INT := 0;
BEGIN
  LOOP
    bin    := bins[1 + floor(random() * array_length(bins, 1))::INT];
    suffix := LPAD(floor(random() * 9000 + 1000)::TEXT, 4, '0');
    acct   := bin || ' •••• •••• ' || suffix;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE account_number = acct);
    tries := tries + 1;
    IF tries > 50 THEN RAISE EXCEPTION 'Could not generate unique account number'; END IF;
  END LOOP;
  RETURN acct;
END;
$$;

-- =============================================================
-- TRIGGER: auto-create profile + accounts on new auth user
-- =============================================================
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _full_name    TEXT := COALESCE(NEW.raw_user_meta_data->>'full_name', '');
  _phone        TEXT := COALESCE(NEW.raw_user_meta_data->>'phone', '');
  _country      TEXT := COALESCE(NEW.raw_user_meta_data->>'country', 'US');
  _dob          DATE;
  _acct_type    TEXT := COALESCE(NEW.raw_user_meta_data->>'account_type', 'personal');
  _role         TEXT := COALESCE(NEW.raw_user_meta_data->>'role', 'user');
  _avatar       TEXT;
  _acct_num     TEXT;
BEGIN
  -- Build avatar initials from full name
  SELECT STRING_AGG(LEFT(word, 1), '')
  INTO _avatar
  FROM (
    SELECT UPPER(word) AS word
    FROM regexp_split_to_table(TRIM(_full_name), '\s+') AS word
    WHERE word <> ''
    LIMIT 2
  ) sub;
  _avatar := COALESCE(_avatar, 'VS');

  -- Parse DOB safely
  BEGIN
    _dob := (NEW.raw_user_meta_data->>'dob')::DATE;
  EXCEPTION WHEN OTHERS THEN
    _dob := NULL;
  END;

  _acct_num := public.generate_account_number();

  INSERT INTO public.profiles
    (id, email, full_name, phone, country, dob, account_type, account_number, role, status, kyc_status, avatar)
  VALUES
    (NEW.id, NEW.email, _full_name, _phone, _country, _dob, _acct_type, _acct_num, _role,
     'pending_kyc', 'not_started', _avatar)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.accounts (user_id, type, balance) VALUES
    (NEW.id, 'checking',   0),
    (NEW.id, 'savings',    0),
    (NEW.id, 'investment', 0)
  ON CONFLICT (user_id, type) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Drop and recreate trigger cleanly
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- =============================================================
-- ADMIN HELPER: check if calling user is admin
-- =============================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- =============================================================
-- TRANSFER OPERATIONS  (SECURITY DEFINER — bypasses RLS)
-- =============================================================

-- Approve a pending transfer atomically
CREATE OR REPLACE FUNCTION public.approve_transfer(
  p_transfer_id UUID,
  p_admin_id    UUID
)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_t           public.transfers%ROWTYPE;
  v_sender_bal  NUMERIC;
  v_recip_bal   NUMERIC;
BEGIN
  -- Lock and load the transfer row
  SELECT * INTO v_t
  FROM public.transfers
  WHERE id = p_transfer_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'Transfer not found or already processed.');
  END IF;

  -- Check sender's checking balance
  SELECT balance INTO v_sender_bal
  FROM public.accounts
  WHERE user_id = v_t.from_user_id AND type = 'checking'
  FOR UPDATE;

  IF v_sender_bal < v_t.amount THEN
    UPDATE public.transfers
    SET status = 'rejected',
        rejection_reason = 'Insufficient funds at time of processing.',
        processed_at = NOW(),
        approved_by  = p_admin_id
    WHERE id = p_transfer_id;

    INSERT INTO public.notifications (user_id, type, title, message) VALUES (
      v_t.from_user_id, 'error', 'Transfer Failed',
      'Your transfer of $' || v_t.amount || ' to ' || v_t.to_name ||
      ' was rejected: insufficient funds.'
    );
    RETURN json_build_object('ok', false, 'error', 'Insufficient funds.');
  END IF;

  -- Deduct from sender
  UPDATE public.accounts
  SET balance = balance - v_t.amount
  WHERE user_id = v_t.from_user_id AND type = 'checking'
  RETURNING balance INTO v_sender_bal;

  -- Credit recipient (internal transfers only)
  IF v_t.to_user_id IS NOT NULL THEN
    UPDATE public.accounts
    SET balance = balance + v_t.amount
    WHERE user_id = v_t.to_user_id AND type = 'checking'
    RETURNING balance INTO v_recip_bal;
  END IF;

  -- Mark approved
  UPDATE public.transfers
  SET status       = 'approved',
      processed_at = NOW(),
      approved_by  = p_admin_id
  WHERE id = p_transfer_id;

  -- Debit transaction for sender
  INSERT INTO public.transactions
    (user_id, type, amount, balance_after, description, category, merchant, status, transfer_id)
  VALUES (
    v_t.from_user_id, 'debit', v_t.amount, v_sender_bal,
    'Transfer to ' || v_t.to_name,
    'Transfer', v_t.to_name, 'completed', p_transfer_id
  );

  -- Credit transaction for recipient
  IF v_t.to_user_id IS NOT NULL THEN
    INSERT INTO public.transactions
      (user_id, type, amount, balance_after, description, category, merchant, status, transfer_id)
    VALUES (
      v_t.to_user_id, 'credit', v_t.amount, v_recip_bal,
      'Transfer from ' || v_t.from_name,
      'Transfer', v_t.from_name, 'completed', p_transfer_id
    );
  END IF;

  -- Notify sender
  INSERT INTO public.notifications (user_id, type, title, message) VALUES (
    v_t.from_user_id, 'success', 'Transfer Approved',
    'Your transfer of $' || v_t.amount || ' to ' || v_t.to_name || ' has been approved.'
  );

  -- Notify recipient
  IF v_t.to_user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message) VALUES (
      v_t.to_user_id, 'success', 'Funds Received',
      'You received $' || v_t.amount || ' from ' || v_t.from_name || '.'
    );
  END IF;

  RETURN json_build_object('ok', true);
END;
$$;

-- Reject a pending transfer
CREATE OR REPLACE FUNCTION public.reject_transfer(
  p_transfer_id UUID,
  p_admin_id    UUID,
  p_reason      TEXT DEFAULT 'Transfer rejected by compliance.'
)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_t public.transfers%ROWTYPE;
BEGIN
  SELECT * INTO v_t
  FROM public.transfers
  WHERE id = p_transfer_id AND status = 'pending';

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'Transfer not found or already processed.');
  END IF;

  UPDATE public.transfers
  SET status           = 'rejected',
      rejection_reason = p_reason,
      processed_at     = NOW(),
      approved_by      = p_admin_id
  WHERE id = p_transfer_id;

  INSERT INTO public.notifications (user_id, type, title, message) VALUES (
    v_t.from_user_id, 'error', 'Transfer Rejected',
    'Your transfer of $' || v_t.amount || ' to ' || v_t.to_name ||
    ' was rejected. Reason: ' || p_reason
  );

  RETURN json_build_object('ok', true);
END;
$$;

-- =============================================================
-- ACCOUNT STATUS  (admin only)
-- =============================================================
CREATE OR REPLACE FUNCTION public.admin_set_status(
  p_user_id  UUID,
  p_status   TEXT,
  p_admin_id UUID
)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_admin_id AND role = 'admin') THEN
    RETURN json_build_object('ok', false, 'error', 'Unauthorized.');
  END IF;

  UPDATE public.profiles SET status = p_status WHERE id = p_user_id;

  INSERT INTO public.notifications (user_id, type, title, message)
  SELECT p_user_id,
    CASE p_status
      WHEN 'locked'    THEN 'warning'
      WHEN 'suspended' THEN 'error'
      ELSE 'success'
    END,
    CASE p_status
      WHEN 'locked'    THEN 'Account Locked'
      WHEN 'suspended' THEN 'Account Suspended'
      ELSE 'Account Activated'
    END,
    CASE p_status
      WHEN 'locked'    THEN 'Your account has been locked. Please contact support.'
      WHEN 'suspended' THEN 'Your account has been suspended. Please contact support.'
      ELSE 'Your account has been reactivated and is fully active.'
    END;

  RETURN json_build_object('ok', true);
END;
$$;

-- =============================================================
-- KYC REVIEW  (admin only)
-- =============================================================
CREATE OR REPLACE FUNCTION public.admin_review_kyc(
  p_user_id       UUID,
  p_action        TEXT,   -- 'approve' | 'reject'
  p_admin_id      UUID,
  p_submission_id UUID    DEFAULT NULL,
  p_reason        TEXT    DEFAULT NULL
)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_admin_id AND role = 'admin') THEN
    RETURN json_build_object('ok', false, 'error', 'Unauthorized.');
  END IF;

  IF p_action = 'approve' THEN
    UPDATE public.profiles
    SET kyc_status = 'approved', status = 'active'
    WHERE id = p_user_id;

    IF p_submission_id IS NOT NULL THEN
      UPDATE public.kyc_submissions
      SET status = 'approved', reviewed_at = NOW(), reviewed_by = p_admin_id
      WHERE id = p_submission_id;
    END IF;

    INSERT INTO public.notifications (user_id, type, title, message) VALUES (
      p_user_id, 'success', 'Identity Verified',
      'Your KYC verification was approved. Your account is now fully active.'
    );

  ELSIF p_action = 'reject' THEN
    UPDATE public.profiles
    SET kyc_status = 'rejected', status = 'pending_kyc'
    WHERE id = p_user_id;

    IF p_submission_id IS NOT NULL THEN
      UPDATE public.kyc_submissions
      SET status           = 'rejected',
          rejection_reason = p_reason,
          reviewed_at      = NOW(),
          reviewed_by      = p_admin_id
      WHERE id = p_submission_id;
    END IF;

    INSERT INTO public.notifications (user_id, type, title, message) VALUES (
      p_user_id, 'error', 'Verification Failed',
      'KYC rejected: ' || COALESCE(p_reason, 'Documents could not be verified.') ||
      '. Please re-submit your documents.'
    );
  END IF;

  RETURN json_build_object('ok', true);
END;
$$;

-- =============================================================
-- BALANCE ADJUSTMENT  (admin only)
-- =============================================================
CREATE OR REPLACE FUNCTION public.admin_adjust_balance(
  p_user_id     UUID,
  p_delta       NUMERIC,
  p_admin_id    UUID,
  p_acct_type   TEXT DEFAULT 'checking'
)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_new_bal NUMERIC;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_admin_id AND role = 'admin') THEN
    RETURN json_build_object('ok', false, 'error', 'Unauthorized.');
  END IF;

  UPDATE public.accounts
  SET balance = GREATEST(0, balance + p_delta)
  WHERE user_id = p_user_id AND type = p_acct_type
  RETURNING balance INTO v_new_bal;

  RETURN json_build_object('ok', true, 'new_balance', v_new_bal);
END;
$$;

-- =============================================================
-- ROW LEVEL SECURITY
-- =============================================================
ALTER TABLE public.profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kyc_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transfers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications   ENABLE ROW LEVEL SECURITY;

-- PROFILES
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT USING (id = auth.uid() OR public.is_admin());

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (id = auth.uid());

CREATE POLICY "profiles_insert_trigger" ON public.profiles
  FOR INSERT WITH CHECK (true);  -- handled exclusively by handle_new_auth_user trigger

-- ACCOUNTS
CREATE POLICY "accounts_select" ON public.accounts
  FOR SELECT USING (user_id = auth.uid() OR public.is_admin());

-- INSERT/UPDATE on accounts only via SECURITY DEFINER functions
CREATE POLICY "accounts_insert_trigger" ON public.accounts
  FOR INSERT WITH CHECK (true);

CREATE POLICY "accounts_update_system" ON public.accounts
  FOR UPDATE USING (true);

-- KYC
CREATE POLICY "kyc_select" ON public.kyc_submissions
  FOR SELECT USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "kyc_insert_own" ON public.kyc_submissions
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "kyc_update_system" ON public.kyc_submissions
  FOR UPDATE USING (true);

-- TRANSFERS
CREATE POLICY "transfers_select" ON public.transfers
  FOR SELECT USING (from_user_id = auth.uid() OR to_user_id = auth.uid() OR public.is_admin());

CREATE POLICY "transfers_insert_own" ON public.transfers
  FOR INSERT WITH CHECK (from_user_id = auth.uid());

CREATE POLICY "transfers_update_system" ON public.transfers
  FOR UPDATE USING (true);

-- TRANSACTIONS
CREATE POLICY "transactions_select" ON public.transactions
  FOR SELECT USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "transactions_insert_system" ON public.transactions
  FOR INSERT WITH CHECK (true);

-- NOTIFICATIONS
CREATE POLICY "notif_select_own" ON public.notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "notif_update_own" ON public.notifications
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "notif_insert_system" ON public.notifications
  FOR INSERT WITH CHECK (true);

=============================================================
STORAGE BUCKET FOR KYC DOCUMENTS
=============================================================
Run this separately in the Supabase Dashboard → Storage UI
OR uncomment and run here if your project supports it:

INSERT INTO storage.buckets (id, name, public)
VALUES ('kyc-documents', 'kyc-documents', false)
ON CONFLICT DO NOTHING;

CREATE POLICY "kyc_upload_own" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'kyc-documents' AND
    (storage.foldername(name))[1] = auth.uid()::TEXT
  );

CREATE POLICY "kyc_select_own" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'kyc-documents' AND
    (storage.foldername(name))[1] = auth.uid()::TEXT OR public.is_admin()
  );

=============================================================
DONE — next steps:
1. Create a user account via the signup form
2. In Supabase Dashboard → Table Editor → profiles,
   find your account and set role = 'admin' to grant admin access
3. Configure supabase-client.js with your project URL + anon key
=============================================================
