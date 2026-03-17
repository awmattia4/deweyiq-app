/**
 * POST /api/projects/deposit — Create a Stripe PaymentIntent for a project deposit.
 *
 * Public endpoint (no auth required). Proposal token IS the authorization.
 * Uses adminDb because the customer has no Supabase auth session.
 *
 * Body: { proposalToken: string; milestoneId: string; splitDeposit?: boolean }
 *
 * Split deposit support (PROJ-20):
 * When splitDeposit=true, collect the first half now. The second half is tracked
 * as a separate milestone with status='pending' and will be collected later.
 *
 * On payment success (Stripe webhook):
 * - Milestone status → 'paid'
 * - Project stage → 'deposit_received'
 * - Activity log entry added
 *
 * Returns: { clientSecret, amount, splitDeposit, secondHalfAmount?, stripeAccountId }
 */

import { type NextRequest, NextResponse } from "next/server"
import { verifyProposalToken } from "@/lib/projects/proposal-token"
import { adminDb } from "@/lib/db"
import {
  projectProposals,
  projectPaymentMilestones,
  customers,
  projects,
  orgSettings,
} from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { getStripe } from "@/lib/stripe/client"
import { toLocalDateString } from "@/lib/date-utils"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { proposalToken, milestoneId, splitDeposit = false } = body as {
      proposalToken: string
      milestoneId: string
      splitDeposit?: boolean
    }

    if (!proposalToken || !milestoneId) {
      return NextResponse.json(
        { error: "proposalToken and milestoneId are required" },
        { status: 400 }
      )
    }

    // ── 1. Verify proposal token ─────────────────────────────────────────────
    const tokenPayload = await verifyProposalToken(proposalToken)
    if (!tokenPayload) {
      return NextResponse.json(
        { error: "Invalid or expired proposal link" },
        { status: 401 }
      )
    }

    const proposalId = tokenPayload.proposalId

    // ── 2. Fetch proposal ────────────────────────────────────────────────────
    const [proposal] = await adminDb
      .select()
      .from(projectProposals)
      .where(eq(projectProposals.id, proposalId))
      .limit(1)

    if (!proposal) {
      return NextResponse.json({ error: "Proposal not found" }, { status: 404 })
    }

    if (proposal.status !== "approved") {
      return NextResponse.json(
        { error: "Proposal must be approved before payment" },
        { status: 400 }
      )
    }

    // ── 3. Fetch milestone ───────────────────────────────────────────────────
    const [milestone] = await adminDb
      .select()
      .from(projectPaymentMilestones)
      .where(
        and(
          eq(projectPaymentMilestones.id, milestoneId),
          eq(projectPaymentMilestones.proposal_id, proposalId)
        )
      )
      .limit(1)

    if (!milestone) {
      return NextResponse.json({ error: "Milestone not found" }, { status: 404 })
    }

    if (milestone.status === "paid") {
      return NextResponse.json(
        { error: "This milestone has already been paid" },
        { status: 400 }
      )
    }

    // ── 4. Fetch project + customer ──────────────────────────────────────────
    const [project] = await adminDb
      .select()
      .from(projects)
      .where(eq(projects.id, proposal.project_id))
      .limit(1)

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    const [customer] = await adminDb
      .select({
        id: customers.id,
        full_name: customers.full_name,
        email: customers.email,
        stripe_customer_id: customers.stripe_customer_id,
      })
      .from(customers)
      .where(eq(customers.id, project.customer_id))
      .limit(1)

    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 })
    }

    // ── 5. Fetch org settings (Stripe account) ───────────────────────────────
    const [settings] = await adminDb
      .select({
        stripe_account_id: orgSettings.stripe_account_id,
        stripe_onboarding_done: orgSettings.stripe_onboarding_done,
      })
      .from(orgSettings)
      .where(eq(orgSettings.org_id, proposal.org_id))
      .limit(1)

    if (!settings?.stripe_account_id || !settings.stripe_onboarding_done) {
      return NextResponse.json(
        { error: "Online payment is not available for this company" },
        { status: 400 }
      )
    }

    const stripeAccountId = settings.stripe_account_id
    const stripe = getStripe()

    // ── 6. Ensure Stripe Customer exists on connected account ────────────────
    let stripeCustomerId = customer.stripe_customer_id

    if (!stripeCustomerId) {
      const stripeCustomer = await stripe.customers.create(
        {
          email: customer.email ?? undefined,
          name: customer.full_name,
          metadata: {
            deweyiq_customer_id: customer.id,
            org_id: proposal.org_id,
          },
        },
        { stripeAccount: stripeAccountId }
      )
      stripeCustomerId = stripeCustomer.id

      await adminDb
        .update(customers)
        .set({
          stripe_customer_id: stripeCustomerId,
          updated_at: new Date(),
        })
        .where(eq(customers.id, customer.id))
    }

    // ── 7. Calculate amount ──────────────────────────────────────────────────
    const fullAmount = parseFloat(milestone.amount)
    let chargeAmount = fullAmount
    let secondHalfAmount: number | undefined

    if (splitDeposit) {
      // First half charged now, second half tracked separately
      chargeAmount = Math.round(fullAmount / 2 * 100) / 100
      secondHalfAmount = fullAmount - chargeAmount
    }

    const chargeCents = Math.round(chargeAmount * 100)

    // ── 8. Create PaymentIntent on connected account ─────────────────────────
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: chargeCents,
        currency: "usd",
        customer: stripeCustomerId,
        payment_method_types: ["card", "us_bank_account"],
        metadata: {
          proposal_id: proposalId,
          project_id: proposal.project_id,
          milestone_id: milestone.id,
          org_id: proposal.org_id,
          customer_id: customer.id,
          payment_type: "project_deposit",
          split_deposit: splitDeposit ? "true" : "false",
        },
        description: `Deposit for project: ${project.name}`,
      },
      { stripeAccount: stripeAccountId }
    )

    // ── 9. If split deposit, create second-half milestone ────────────────────
    if (splitDeposit && secondHalfAmount !== undefined) {
      const secondDueDate = new Date()
      secondDueDate.setDate(secondDueDate.getDate() + 7)
      const secondDueDateStr = toLocalDateString(secondDueDate)

      // Check if second milestone already exists
      const existingSecond = await adminDb
        .select({ id: projectPaymentMilestones.id })
        .from(projectPaymentMilestones)
        .where(
          and(
            eq(projectPaymentMilestones.project_id, project.id),
            eq(projectPaymentMilestones.name, "Deposit (second half)")
          )
        )
        .limit(1)

      if (!existingSecond[0]) {
        await adminDb.insert(projectPaymentMilestones).values({
          org_id: proposal.org_id,
          project_id: project.id,
          proposal_id: proposalId,
          name: "Deposit (second half)",
          amount: secondHalfAmount.toFixed(2),
          due_date: secondDueDateStr,
          status: "pending",
          sort_order: milestone.sort_order + 1,
        })
      }
    }

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      amount: chargeAmount,
      splitDeposit,
      secondHalfAmount: splitDeposit ? secondHalfAmount : undefined,
      stripeAccountId,
    })
  } catch (err) {
    console.error("[POST /api/projects/deposit]", err)
    return NextResponse.json(
      { error: "Failed to create payment intent" },
      { status: 500 }
    )
  }
}
