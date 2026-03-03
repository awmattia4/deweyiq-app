-- =============================================================================
-- Custom Access Token Hook
-- =============================================================================
-- PURPOSE: Promote org_id and role from app_metadata into top-level JWT claims.
--
-- WHY: Supabase JWTs include app_metadata nested inside the token. RLS policies
-- using auth.jwt() need to access these values at the top level without digging
-- into nested JSON on every query evaluation.
--
-- SETUP INSTRUCTIONS:
-- 1. Run this SQL in Supabase Dashboard > SQL Editor
-- 2. Enable the hook in Dashboard > Authentication > Hooks > Custom Access Token Hook
--    - Schema: public
--    - Function: custom_access_token_hook
--
-- CLAIMS PROMOTED:
-- - org_id: UUID of the user's organization (used by every RLS policy)
-- - user_role: 'owner' | 'office' | 'tech' | 'customer' (avoids conflict with
--   Supabase's built-in 'role' claim which is always 'authenticated')
-- =============================================================================

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  claims jsonb;
  app_metadata jsonb;
  org_id text;
  user_role text;
BEGIN
  -- Extract the current claims from the event
  claims := event -> 'claims';
  app_metadata := claims -> 'app_metadata';

  -- Read org_id and role from app_metadata (set by org-creation-trigger.sql
  -- on signup, or by the invite handler when adding team members)
  org_id := app_metadata ->> 'org_id';
  user_role := app_metadata ->> 'role';

  -- Promote org_id to top-level claim if it exists
  IF org_id IS NOT NULL THEN
    claims := jsonb_set(claims, '{org_id}', to_jsonb(org_id));
  END IF;

  -- Promote role as user_role to top-level claim (avoids collision with
  -- Supabase's reserved 'role' claim which is always 'authenticated')
  IF user_role IS NOT NULL THEN
    claims := jsonb_set(claims, '{user_role}', to_jsonb(user_role));
  END IF;

  -- Return the modified event with updated claims
  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

-- Grant execute permission to supabase_auth_admin (the role that calls hooks)
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;

-- Revoke execute from public roles (this function must only be called by auth system)
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM anon;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM public;
