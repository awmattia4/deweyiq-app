import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { LoginForm } from "@/components/auth/login-form"

export const metadata: Metadata = {
  title: "Sign in",
}

export default async function LoginPage() {
  // Redirect already-authenticated users to their role landing page
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()

  if (claimsData?.claims) {
    const role = claimsData.claims["user_role"] as string | undefined
    if (role === "tech") {
      redirect("/routes")
    } else if (role === "customer") {
      redirect("/portal")
    } else {
      // owner, office, or unknown role — go to dashboard
      redirect("/dashboard")
    }
  }

  return <LoginForm />
}
