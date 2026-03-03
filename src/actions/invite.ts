"use server"

import { createClient as createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { getCurrentUser } from "./auth"
import { adminDb } from "@/lib/db"
import { profiles } from "@/lib/db/schema"

/**
 * inviteTeamMember — sends an email invite with a pre-assigned role.
 *
 * Only owners can invite team members. The invite flow:
 * 1. Owner calls this action with email and role
 * 2. Supabase sends an invite email (one-time token, NOT PKCE)
 * 3. Invitee clicks link → /auth/callback exchanges token → authenticated
 * 4. app_metadata.role and app_metadata.org_id already set → JWT has correct claims
 * 5. Invitee lands on their role-appropriate page
 *
 * CRITICAL: Uses SUPABASE_SERVICE_ROLE_KEY — server-only, NEVER exposed to client.
 * The service role key bypasses RLS for system-level operations.
 *
 * NOTE: inviteUserByEmail does NOT support PKCE. The invite link contains
 * a direct one-time token. This is by Supabase design — handle gracefully.
 */
export async function inviteTeamMember(
  email: string,
  role: "office" | "tech" | "customer"
): Promise<{ success: boolean; error?: string }> {
  // 1. Verify the caller is an owner
  const callingUser = await getCurrentUser()
  if (!callingUser) {
    return { success: false, error: "You must be logged in to invite team members." }
  }
  if (callingUser.role !== "owner") {
    return { success: false, error: "Only account owners can invite team members." }
  }

  // 2. Create Supabase admin client using service role key (server-only)
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

  if (!serviceRoleKey || !supabaseUrl) {
    console.error("[inviteTeamMember] Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL")
    return { success: false, error: "Server configuration error. Please contact support." }
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  // 3. Send invite email
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? supabaseUrl
  const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
    email,
    {
      redirectTo: `${appUrl}/auth/callback?type=invite`,
    }
  )

  if (inviteError) {
    console.error("[inviteTeamMember] inviteUserByEmail error:", inviteError.message)
    // Provide user-friendly messages for common cases
    if (inviteError.message.includes("already been invited")) {
      return { success: false, error: "This email has already been invited." }
    }
    if (inviteError.message.includes("already registered")) {
      return { success: false, error: "A user with this email already exists." }
    }
    return { success: false, error: inviteError.message }
  }

  if (!inviteData.user) {
    return { success: false, error: "Failed to create invitation. Please try again." }
  }

  // 4. Immediately set app_metadata with role and org_id
  // This ensures the invited user's JWT has the correct claims from first login
  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
    inviteData.user.id,
    {
      app_metadata: {
        role: role,
        org_id: callingUser.org_id,
      },
    }
  )

  if (updateError) {
    console.error("[inviteTeamMember] updateUserById app_metadata error:", updateError.message)
    // Non-fatal: user can still sign in; trigger may set metadata on first login
    // But log it as a warning since it's unexpected
  }

  // 5. Pre-create the profile row to satisfy RLS and org membership
  // Use adminDb (bypasses RLS) since the invited user isn't authenticated yet
  try {
    await adminDb.insert(profiles).values({
      id: inviteData.user.id,
      org_id: callingUser.org_id,
      full_name: email.split("@")[0], // Placeholder — user can update after first login
      email: email,
      role: role,
    })
  } catch (dbError) {
    console.error("[inviteTeamMember] profile insert error:", dbError)
    // Non-fatal: profile may already exist or trigger will create it
    // The invite email was already sent — treat as success
  }

  return { success: true }
}

/**
 * revokeInvite — removes an invited (but not yet activated) team member.
 * Owner-only operation.
 */
export async function revokeInvite(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const callingUser = await getCurrentUser()
  if (!callingUser || callingUser.role !== "owner") {
    return { success: false, error: "Only owners can revoke invitations." }
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

  if (!serviceRoleKey || !supabaseUrl) {
    return { success: false, error: "Server configuration error." }
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)
  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}
