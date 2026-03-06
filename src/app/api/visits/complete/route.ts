import { NextRequest, NextResponse } from "next/server"
import { completeStop } from "@/actions/visits"
import type { CompleteStopInput } from "@/actions/visits"

/**
 * POST /api/visits/complete — replay endpoint for offline sync queue.
 *
 * This route is the server-side target for `enqueueWrite()` calls made
 * during offline completion. The sync engine replays the queue to this
 * endpoint when connectivity returns.
 *
 * Same logic as the `completeStop` server action — delegates to it directly.
 *
 * Auth: server action uses getClaims() internally — cookie-based auth is
 * forwarded by the sync queue replay (same session).
 */
export async function POST(req: NextRequest) {
  let body: CompleteStopInput

  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    )
  }

  // Basic validation
  if (
    !body?.visitId ||
    !body?.customerId ||
    !body?.poolId
  ) {
    return NextResponse.json(
      { error: "Missing required fields: visitId, customerId, poolId" },
      { status: 400 }
    )
  }

  const result = await completeStop(body)

  if (!result.success) {
    return NextResponse.json(
      { error: result.error ?? "Unknown error" },
      { status: 500 }
    )
  }

  return NextResponse.json({ success: true }, { status: 200 })
}
