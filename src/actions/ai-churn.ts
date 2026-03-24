"use server"

import { getRlsToken, withRls } from "@/lib/db"
import { customers, serviceVisits, invoices, portalMessages } from "@/lib/db/schema"
import { and, eq, gte, lt, sql, count, max } from "drizzle-orm"
import { getAiClient, AI_MODEL } from "@/lib/ai/client"

// ─── Types ─────────────────────────────────────────────────────────────────────

export type ChurnPrediction = {
  customerId: string
  customerName: string
  riskLevel: "high" | "medium" | "low"
  riskScore: number
  factors: string[]
  lastServiceDate: string | null
  daysSinceLastService: number | null
  recommendation: string
}

export type ChurnSummary = {
  highRisk: number
  mediumRisk: number
  totalCustomers: number
  insight: string
}

export type GetChurnPredictionsResult =
  | { success: true; predictions: ChurnPrediction[]; summary: ChurnSummary }
  | { success: false; error: string }

// ─── Constants ─────────────────────────────────────────────────────────────────

const NOW = () => new Date()
const daysAgo = (n: number) => {
  const d = NOW()
  d.setDate(d.getDate() - n)
  return d
}

// ─── Main action ──────────────────────────────────────────────────────────────

/**
 * getChurnPredictions — Scores all active customers for churn risk and
 * generates AI-powered retention recommendations for the top at-risk customers.
 *
 * Signals:
 * - Visit frequency in last 90 days vs previous 90 days (day 91–180)
 * - Days since last service visit
 * - Overdue invoices outstanding
 * - Open unread portal messages from the customer (unaddressed complaints)
 *
 * Score: 0–100. 70+ = high, 40–70 = medium, <40 = low.
 * Returns top 10 at-risk customers (score >= 30) sorted by score descending.
 * Claude AI generates specific retention recommendations for the top 10.
 */
export async function getChurnPredictions(): Promise<GetChurnPredictionsResult> {
  try {
    const token = await getRlsToken()
    if (!token) {
      return { success: false, error: "Not authenticated" }
    }

    const now = NOW()
    const cutoff90 = daysAgo(90)
    const cutoff180 = daysAgo(180)

    // ── 1. Fetch all active customers ──────────────────────────────────────────
    // Single query using LEFT JOINs and GROUP BY to avoid correlated subqueries
    // (MEMORY.md: never use correlated subqueries inside withRls)
    const customerRows = await withRls(token, (db) =>
      db
        .select({
          id: customers.id,
          full_name: customers.full_name,
        })
        .from(customers)
        .where(eq(customers.status, "active"))
        .orderBy(customers.full_name)
    )

    if (customerRows.length === 0) {
      return {
        success: true,
        predictions: [],
        summary: {
          highRisk: 0,
          mediumRisk: 0,
          totalCustomers: 0,
          insight: "No active customers found.",
        },
      }
    }

    // ── 2. Fetch visit metrics for all customers in two windows ────────────────
    // Window A: last 90 days
    const visitsWindowA = await withRls(token, (db) =>
      db
        .select({
          customerId: serviceVisits.customer_id,
          visitCount: count(serviceVisits.id),
          lastVisitedAt: max(serviceVisits.visited_at),
        })
        .from(serviceVisits)
        .where(
          and(
            gte(serviceVisits.visited_at, cutoff90),
            eq(serviceVisits.status, "complete")
          )
        )
        .groupBy(serviceVisits.customer_id)
    )

    // Window B: previous 90 days (day 91–180 ago)
    const visitsWindowB = await withRls(token, (db) =>
      db
        .select({
          customerId: serviceVisits.customer_id,
          visitCount: count(serviceVisits.id),
        })
        .from(serviceVisits)
        .where(
          and(
            gte(serviceVisits.visited_at, cutoff180),
            lt(serviceVisits.visited_at, cutoff90),
            eq(serviceVisits.status, "complete")
          )
        )
        .groupBy(serviceVisits.customer_id)
    )

    // ── 3. Fetch overdue invoices per customer ─────────────────────────────────
    const overdueInvoiceRows = await withRls(token, (db) =>
      db
        .select({
          customerId: invoices.customer_id,
          overdueCount: count(invoices.id),
        })
        .from(invoices)
        .where(eq(invoices.status, "overdue"))
        .groupBy(invoices.customer_id)
    )

    // ── 4. Fetch open (unread) portal messages from customers ──────────────────
    // Unread customer-sent messages signal unaddressed complaints
    const openMessageRows = await withRls(token, (db) =>
      db
        .select({
          customerId: portalMessages.customer_id,
          msgCount: count(portalMessages.id),
        })
        .from(portalMessages)
        .where(
          and(
            eq(portalMessages.sender_role, "customer"),
            sql`${portalMessages.read_by_office_at} IS NULL`
          )
        )
        .groupBy(portalMessages.customer_id)
    )

    // ── 5. Build lookup maps ────────────────────────────────────────────────────
    const mapA = new Map<string, { visitCount: number; lastVisitedAt: Date | null }>()
    for (const row of visitsWindowA) {
      if (!row.customerId) continue
      mapA.set(row.customerId, {
        visitCount: Number(row.visitCount),
        lastVisitedAt: row.lastVisitedAt ? new Date(row.lastVisitedAt) : null,
      })
    }

    const mapB = new Map<string, number>()
    for (const row of visitsWindowB) {
      if (!row.customerId) continue
      mapB.set(row.customerId, Number(row.visitCount))
    }

    const overdueMap = new Map<string, number>()
    for (const row of overdueInvoiceRows) {
      if (!row.customerId) continue
      overdueMap.set(row.customerId, Number(row.overdueCount))
    }

    const msgMap = new Map<string, number>()
    for (const row of openMessageRows) {
      if (!row.customerId) continue
      msgMap.set(row.customerId, Number(row.msgCount))
    }

    // ── 6. Score each customer ─────────────────────────────────────────────────
    type ScoredCustomer = {
      customerId: string
      customerName: string
      riskScore: number
      factors: string[]
      lastServiceDate: string | null
      daysSinceLastService: number | null
    }

    const scored: ScoredCustomer[] = []

    for (const customer of customerRows) {
      const aData = mapA.get(customer.id)
      const visitsA = aData?.visitCount ?? 0
      const visitsB = mapB.get(customer.id) ?? 0
      const lastVisit = aData?.lastVisitedAt ?? null
      const overdueCount = overdueMap.get(customer.id) ?? 0
      const openMsgs = msgMap.get(customer.id) ?? 0

      let score = 0
      const factors: string[] = []

      // Signal 1 — No visits in last 90 days (strong churn indicator)
      if (visitsA === 0 && visitsB === 0) {
        score += 40
        factors.push("No service visits in 6 months")
      } else if (visitsA === 0) {
        score += 35
        factors.push("No service visits in 90 days")
      }

      // Signal 2 — Declining visit frequency (visits dropped 50%+ between windows)
      if (visitsB > 0 && visitsA < visitsB) {
        const dropPct = ((visitsB - visitsA) / visitsB) * 100
        if (dropPct >= 50) {
          score += 30
          factors.push(`Visit frequency dropped ${Math.round(dropPct)}%`)
        } else if (dropPct >= 25) {
          score += 15
          factors.push(`Visit frequency declining (${Math.round(dropPct)}% fewer)`)
        }
      }

      // Signal 3 — Long gap since last service relative to expected weekly cadence
      const daysSince = lastVisit
        ? Math.floor((now.getTime() - lastVisit.getTime()) / (1000 * 60 * 60 * 24))
        : null

      if (daysSince !== null) {
        if (daysSince > 45) {
          score += 25
          factors.push(`Last service was ${daysSince} days ago`)
        } else if (daysSince > 21) {
          score += 12
          factors.push(`No service in ${daysSince} days`)
        }
      }

      // Signal 4 — Overdue invoices (payment friction increases churn risk)
      if (overdueCount >= 2) {
        score += 20
        factors.push(`${overdueCount} overdue invoices`)
      } else if (overdueCount === 1) {
        score += 10
        factors.push("1 overdue invoice")
      }

      // Signal 5 — Unread messages from customer (unaddressed concerns)
      if (openMsgs >= 3) {
        score += 15
        factors.push(`${openMsgs} unread messages from customer`)
      } else if (openMsgs >= 1) {
        score += 8
        factors.push(`${openMsgs} unread message${openMsgs > 1 ? "s" : ""} from customer`)
      }

      // Cap at 100
      score = Math.min(score, 100)

      const lastServiceDate = lastVisit
        ? lastVisit.toISOString().split("T")[0]
        : null

      scored.push({
        customerId: customer.id,
        customerName: customer.full_name,
        riskScore: score,
        factors,
        lastServiceDate,
        daysSinceLastService: daysSince,
      })
    }

    // ── 7. Sort by score descending, take top 10 at-risk (score >= 30) ─────────
    scored.sort((a, b) => b.riskScore - a.riskScore)
    const atRisk = scored.filter((c) => c.riskScore >= 30).slice(0, 10)

    // ── 8. Get AI retention recommendations for at-risk customers ─────────────
    const recommendations = new Map<string, string>()

    if (atRisk.length > 0) {
      try {
        const ai = getAiClient()

        const customerBlurbs = atRisk
          .map(
            (c, i) =>
              `${i + 1}. ${c.customerName} (risk score: ${c.riskScore}/100)\n` +
              `   Risk signals: ${c.factors.join("; ")}\n` +
              `   Days since last service: ${c.daysSinceLastService ?? "unknown"}`
          )
          .join("\n\n")

        const prompt =
          `You are a customer retention advisor for a pool cleaning and maintenance company.\n\n` +
          `Below are customers flagged as at-risk of canceling their service contract, ` +
          `along with the signals that triggered the flag. For each customer, write a single ` +
          `specific, actionable retention suggestion the office staff can act on today. ` +
          `Keep each suggestion to 1-2 sentences. Be concrete — suggest a real action like ` +
          `"Call to offer a complimentary water test" or "Reach out to resolve the outstanding ` +
          `invoice and offer a payment plan." Address the most important signal for that customer.\n\n` +
          `At-risk customers:\n\n${customerBlurbs}\n\n` +
          `Respond with a JSON array of objects in this exact format (no markdown, raw JSON only):\n` +
          `[{"index": 1, "recommendation": "..."},  {"index": 2, "recommendation": "..."}, ...]`

        const message = await ai.messages.create({
          model: AI_MODEL,
          max_tokens: 1024,
          messages: [{ role: "user", content: prompt }],
        })

        const rawText =
          message.content[0].type === "text" ? message.content[0].text : ""

        // Parse the JSON array from AI response
        const jsonMatch = rawText.match(/\[[\s\S]*\]/)
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as Array<{
            index: number
            recommendation: string
          }>
          for (const item of parsed) {
            const customer = atRisk[item.index - 1]
            if (customer) {
              recommendations.set(customer.customerId, item.recommendation)
            }
          }
        }
      } catch (aiErr) {
        // AI is best-effort — fall back to rule-based recommendations
        console.error("[getChurnPredictions] AI recommendation error:", aiErr)
      }
    }

    // ── 9. Generate AI-powered overall insight ─────────────────────────────────
    let overallInsight = ""
    const highRiskCount = scored.filter((c) => c.riskScore >= 70).length
    const mediumRiskCount = scored.filter((c) => c.riskScore >= 40 && c.riskScore < 70).length

    if (atRisk.length > 0) {
      try {
        const ai = getAiClient()
        const insightPrompt =
          `You are a pool service business advisor. Summarize the churn risk situation ` +
          `in 1 sentence (max 20 words). Stats: ${scored.length} active customers, ` +
          `${highRiskCount} high risk, ${mediumRiskCount} medium risk. ` +
          `The top risk factors are: ${atRisk
            .flatMap((c) => c.factors)
            .slice(0, 5)
            .join(", ")}. ` +
          `Be direct and actionable.`

        const insightMsg = await ai.messages.create({
          model: AI_MODEL,
          max_tokens: 64,
          messages: [{ role: "user", content: insightPrompt }],
        })

        overallInsight =
          insightMsg.content[0].type === "text"
            ? insightMsg.content[0].text.trim()
            : ""
      } catch {
        // Fallback insight
      }
    }

    if (!overallInsight) {
      if (highRiskCount === 0 && mediumRiskCount === 0) {
        overallInsight = "All customers appear healthy — no churn signals detected."
      } else {
        overallInsight = `${highRiskCount + mediumRiskCount} customers need attention — focus on the highest-risk accounts first.`
      }
    }

    // ── 10. Assemble final predictions ─────────────────────────────────────────
    const fallbackRecommendation = (c: ScoredCustomer): string => {
      if (c.factors.some((f) => f.includes("overdue"))) {
        return "Reach out to discuss the outstanding balance and offer a payment arrangement."
      }
      if (c.factors.some((f) => f.includes("message"))) {
        return "Reply to the customer's unread messages to address any concerns before they escalate."
      }
      if (c.factors.some((f) => f.includes("frequency") || f.includes("dropped"))) {
        return "Call to check satisfaction and confirm their service schedule is meeting their needs."
      }
      if (c.daysSinceLastService && c.daysSinceLastService > 30) {
        return "Schedule a check-in call to confirm upcoming service and offer a complimentary water test."
      }
      return "Reach out proactively to confirm their satisfaction and upcoming service schedule."
    }

    const predictions: ChurnPrediction[] = atRisk.map((c) => ({
      customerId: c.customerId,
      customerName: c.customerName,
      riskLevel:
        c.riskScore >= 70 ? "high" : c.riskScore >= 40 ? "medium" : "low",
      riskScore: c.riskScore,
      factors: c.factors,
      lastServiceDate: c.lastServiceDate,
      daysSinceLastService: c.daysSinceLastService,
      recommendation:
        recommendations.get(c.customerId) ?? fallbackRecommendation(c),
    }))

    return {
      success: true,
      predictions,
      summary: {
        highRisk: highRiskCount,
        mediumRisk: mediumRiskCount,
        totalCustomers: scored.length,
        insight: overallInsight,
      },
    }
  } catch (err) {
    console.error("[getChurnPredictions] Error:", err)
    return { success: false, error: "Failed to compute churn predictions" }
  }
}
