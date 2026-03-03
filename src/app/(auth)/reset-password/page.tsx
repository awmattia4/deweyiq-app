import type { Metadata } from "next"
import { createClient } from "@/lib/supabase/server"
import { ResetPasswordForm } from "@/components/auth/reset-password-form"

export const metadata: Metadata = {
  title: "Reset password",
}

interface ResetPasswordPageProps {
  searchParams: Promise<{ type?: string }>
}

export default async function ResetPasswordPage({
  searchParams,
}: ResetPasswordPageProps) {
  const params = await searchParams
  const isRecovery = params.type === "recovery"

  // If arriving via recovery link, verify the user is authenticated
  // (the callback route exchanged the recovery code for a session before redirecting here)
  if (isRecovery) {
    const supabase = await createClient()
    const { data: claimsData } = await supabase.auth.getClaims()
    // If somehow not authenticated on the recovery path, fall back to request form
    if (!claimsData?.claims) {
      return <ResetPasswordForm isRecovery={false} />
    }
  }

  return <ResetPasswordForm isRecovery={isRecovery} />
}
