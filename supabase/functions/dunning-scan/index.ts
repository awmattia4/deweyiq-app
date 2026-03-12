// Deno Edge Function — dunning-scan
//
// Triggered by pg_cron daily at 9:00 AM UTC.
// Thin wrapper that calls the Next.js API route /api/cron/dunning.
//
// pg_cron setup (Supabase SQL Editor):
//   SELECT cron.schedule(
//     'dunning-scan',
//     '0 9 * * *',
//     $$SELECT net.http_post(
//       url := 'YOUR_SUPABASE_URL/functions/v1/dunning-scan',
//       headers := '{"Content-Type": "application/json"}'::jsonb,
//       body := '{}'::jsonb
//     )$$
//   );
//
// Deployment:
//   supabase functions deploy dunning-scan
//   supabase secrets set CRON_SECRET=your_secret_here

// ---------------------------------------------------------------------------
// CORS headers
// ---------------------------------------------------------------------------

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    )
  }

  // Read config from environment
  const appUrl = Deno.env.get("APP_URL") || Deno.env.get("NEXT_PUBLIC_APP_URL")
  const cronSecret = Deno.env.get("CRON_SECRET")

  if (!appUrl || !cronSecret) {
    console.error("[dunning-scan] APP_URL or CRON_SECRET not set")
    return new Response(
      JSON.stringify({ error: "Edge Function not configured" }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    )
  }

  try {
    // Call the Next.js API route
    const response = await fetch(`${appUrl}/api/cron/dunning`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cronSecret}`,
      },
    })

    const data = await response.json()

    console.log("[dunning-scan] Result:", JSON.stringify(data))

    return new Response(
      JSON.stringify(data),
      {
        status: response.ok ? 200 : 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    console.error("[dunning-scan] Error calling API:", message)

    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    )
  }
})
