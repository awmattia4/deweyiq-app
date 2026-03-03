"use server"

import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

/**
 * Typed authenticated user — derived from JWT app_metadata claims.
 * CRITICAL: Uses getClaims() (local JWT validation), never getSession()
 * (which trusts the cookie without cryptographic verification).
 */
export type AuthUser = {
  id: string
  email: string
  role: "owner" | "office" | "tech" | "customer"
  org_id: string
  full_name: string
}

/**
 * getCurrentUser — returns the authenticated user from JWT claims.
 *
 * Reads org_id and role from app_metadata (promoted to JWT top-level
 * by the Custom Access Token Hook). Returns null if not authenticated.
 *
 * @throws Never — returns null for unauthenticated/invalid sessions.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()

  if (!claimsData?.claims) {
    return null
  }

  const claims = claimsData.claims

  // sub is the user's UUID (auth.users.id)
  const id = claims["sub"] as string | undefined
  if (!id) return null

  // Get email from user object (not in JWT claims by default in Supabase)
  const { data: { user } } = await supabase.auth.getUser()
  const email = user?.email ?? (claims["email"] as string | undefined) ?? ""

  const role = claims["user_role"] as AuthUser["role"] | undefined
  const org_id = claims["org_id"] as string | undefined
  const full_name = (user?.user_metadata?.["full_name"] as string | undefined) ?? ""

  if (!role || !org_id) {
    // JWT missing required claims — user may not have been processed by trigger yet
    return null
  }

  return {
    id,
    email,
    role,
    org_id,
    full_name,
  }
}

/**
 * signOut — signs the user out and redirects to /login.
 * For portal users, call with redirectTo="/portal/login".
 */
export async function signOut(redirectTo = "/login") {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect(redirectTo)
}
