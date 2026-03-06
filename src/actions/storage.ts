"use server"

import { createClient } from "@/lib/supabase/server"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SignedUploadResult {
  signedUrl: string
  token: string
  path: string
}

// ---------------------------------------------------------------------------
// Server action
// ---------------------------------------------------------------------------

/**
 * createPhotoUploadUrl — generates a signed upload URL for Supabase Storage.
 *
 * Storage path: {orgId}/visits/{visitId}/{fileName}
 * Using orgId in the path enables storage RLS to scope access to the org
 * via storage.foldername(name)[1] = org_id from JWT (per Research pitfall 7).
 *
 * Bucket: visit-photos (private, 5MB limit, webp/jpeg/png only)
 *
 * IMPORTANT: This action is called ONLY when online. Offline photos bypass
 * this step — their blob stays in Dexie photoQueue with status "pending"
 * and is uploaded by the photo sync processor when connectivity returns.
 *
 * @param orgId    - Organization ID (first path segment for RLS)
 * @param visitId  - Visit UUID (second path segment)
 * @param fileName - File name (should include extension, e.g. "photo-1234.webp")
 * @returns SignedUploadResult with signedUrl, token, and full storage path
 */
export async function createPhotoUploadUrl(
  orgId: string,
  visitId: string,
  fileName: string
): Promise<SignedUploadResult | null> {
  try {
    const supabase = await createClient()

    // Verify auth
    const { data: claimsData } = await supabase.auth.getClaims()
    if (!claimsData?.claims) {
      console.error("[storage] Not authenticated — cannot create upload URL")
      return null
    }

    // Storage path: orgId/visits/visitId/fileName
    // This structure allows RLS: storage.foldername(name)[1] = org_id from JWT
    const storagePath = `${orgId}/visits/${visitId}/${fileName}`

    const { data, error } = await supabase.storage
      .from("visit-photos")
      .createSignedUploadUrl(storagePath)

    if (error) {
      console.error("[storage] Failed to create signed upload URL:", error)
      return null
    }

    return {
      signedUrl: data.signedUrl,
      token: data.token,
      path: data.path,
    }
  } catch (err) {
    console.error("[storage] createPhotoUploadUrl error:", err)
    return null
  }
}
