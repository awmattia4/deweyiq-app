-- =============================================================================
-- Org Creation Trigger
-- =============================================================================
-- PURPOSE: Automatically create an organization and owner profile when a new
-- user signs up (not when an invited user accepts their invite).
--
-- SETUP INSTRUCTIONS:
-- 1. Run this SQL in Supabase Dashboard > SQL Editor
--    IMPORTANT: Run AFTER Drizzle migrations have been applied (the orgs and
--    profiles tables must already exist).
-- 2. No additional configuration is needed — the trigger fires automatically
--    on INSERT to auth.users.
--
-- FLOW:
--   signUp({ email, password, options: { data: { company_name: "Splash Pool Co" } } })
--     → auth.users INSERT
--       → handle_new_user() trigger fires
--         → creates orgs row
--         → creates profiles row (role='owner')
--         → sets app_metadata.org_id + app_metadata.role on the user
--           → next JWT issued includes org_id and user_role at top level
--             (via custom-access-token-hook.sql)
--
-- INVITED USERS: The trigger is a no-op for invited users because their
-- app_metadata.org_id is already set by the admin invite handler before they
-- accept. The guard `IF NEW.raw_app_meta_data ->> 'org_id' IS NULL` skips them.
--
-- REQUIRED signup call:
--   supabase.auth.signUp({
--     email, password,
--     options: { data: { company_name: "Splash Pool Co", full_name: "Jane Owner" } }
--   })
-- =============================================================================

-- Function that fires on new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_org_id uuid;
  company_name text;
  full_name text;
BEGIN
  -- GUARD: Skip invited users — they already have org_id in app_metadata
  -- (set by the admin invite handler). Only create org for fresh signups.
  IF NEW.raw_app_meta_data ->> 'org_id' IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Extract user-provided metadata from signUp call
  company_name := COALESCE(
    NEW.raw_user_meta_data ->> 'company_name',
    NEW.email  -- fallback: use email as org name if no company_name provided
  );
  full_name := COALESCE(
    NEW.raw_user_meta_data ->> 'full_name',
    split_part(NEW.email, '@', 1)  -- fallback: use email prefix as name
  );

  -- Step 1: Create the organization
  INSERT INTO public.orgs (name)
  VALUES (company_name)
  RETURNING id INTO new_org_id;

  -- Step 2: Create the owner profile linking user to org
  INSERT INTO public.profiles (id, org_id, full_name, email, role)
  VALUES (
    NEW.id,          -- matches auth.users.id
    new_org_id,
    full_name,
    NEW.email,
    'owner'
  );

  -- Step 3: Set app_metadata so the Custom Access Token Hook can promote
  -- org_id and role into the JWT claims on next token issuance
  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
    'org_id', new_org_id::text,
    'role', 'owner'
  )
  WHERE id = NEW.id;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error but don't block user creation
    RAISE WARNING 'handle_new_user failed for user %: % %', NEW.id, SQLERRM, SQLSTATE;
    RETURN NEW;
END;
$$;

-- Create the trigger on auth.users
-- Uses AFTER INSERT so NEW.id is available and the user row is committed
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
