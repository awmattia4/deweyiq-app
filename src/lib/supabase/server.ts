import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

export async function createClient() {
  const cookieStore = await cookies()

  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component — cookies are read-only; cookie mutations
            // are handled by the proxy. Silently ignore.
          }
        },
      },
    }
  )

  // Patch getClaims to fall back to getUser() when JWT local decode fails.
  // On hosted Supabase, getClaims() can fail if the JWT uses ES256 (asymmetric)
  // instead of HS256, since the anon key can't verify ES256 signatures.
  const originalGetClaims = client.auth.getClaims.bind(client.auth)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client.auth.getClaims = (async (...args: any[]) => {
    const result = await originalGetClaims(...args)
    if (result.data?.claims) return result

    // Fallback: build claims from getUser() + app_metadata
    const { data: { user } } = await client.auth.getUser()
    if (!user) return result

    const meta = user.app_metadata ?? {}
    const claims = {
      sub: user.id,
      org_id: meta.org_id,
      user_role: meta.role ?? meta.user_role,
      role: "authenticated",
      email: user.email,
      aud: "authenticated",
      iss: process.env.NEXT_PUBLIC_SUPABASE_URL,
    }
    return {
      data: { claims, header: {}, signature: new Uint8Array() },
      error: null,
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any

  return client
}
