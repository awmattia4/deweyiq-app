import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { SignupForm } from "@/components/auth/signup-form"

export const metadata: Metadata = {
  title: "Create account",
}

export default async function SignupPage() {
  // Redirect to dashboard if already authenticated
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (claimsData?.claims) {
    redirect("/dashboard")
  }

  return <SignupForm />
}
