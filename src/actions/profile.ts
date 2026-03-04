"use server"

import { getCurrentUser } from "./auth"
import { adminDb } from "@/lib/db"
import { profiles } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

type UpdateProfileInput = {
  full_name: string
}

/**
 * updateProfile — updates the current user's profile data.
 *
 * Phase 1: only full_name is editable. Email changes require support.
 * Uses adminDb for the update since the authenticated user is updating
 * their own row (RLS allows this per profiles_update_policy).
 *
 * NOTE: We use adminDb here as a pragmatic choice — the profiles_update_policy
 * allows users to update their own row. In later phases, switch to withRls()
 * for consistent RLS enforcement patterns.
 */
export async function updateProfile(
  input: UpdateProfileInput
): Promise<{ success: boolean; error?: string }> {
  const user = await getCurrentUser()

  if (!user) {
    return { success: false, error: "You must be logged in." }
  }

  if (!input.full_name.trim()) {
    return { success: false, error: "Name cannot be empty." }
  }

  try {
    await adminDb
      .update(profiles)
      .set({
        full_name: input.full_name.trim(),
        updated_at: new Date(),
      })
      .where(eq(profiles.id, user.id))

    return { success: true }
  } catch (err) {
    console.error("[updateProfile] DB error:", err)
    return { success: false, error: "Failed to save. Please try again." }
  }
}
