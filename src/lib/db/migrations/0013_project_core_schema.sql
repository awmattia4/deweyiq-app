CREATE TABLE "customer_credits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"reason" text NOT NULL,
	"source_type" text DEFAULT 'goodwill' NOT NULL,
	"source_id" uuid,
	"applied_to_invoice_id" uuid,
	"status" text DEFAULT 'available' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer_credits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "payment_plan_installments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"payment_plan_id" uuid NOT NULL,
	"installment_number" integer NOT NULL,
	"due_date" date NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payment_record_id" uuid,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_plan_installments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "payment_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"total_amount" numeric(12, 2) NOT NULL,
	"installment_count" integer NOT NULL,
	"installment_amount" numeric(12, 2) NOT NULL,
	"frequency" text DEFAULT 'monthly' NOT NULL,
	"start_date" date NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "vendor_bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"bill_number" text,
	"bill_date" date NOT NULL,
	"due_date" date NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"category_account_id" uuid,
	"status" text DEFAULT 'unpaid' NOT NULL,
	"scheduled_date" date,
	"payment_method" text,
	"payment_reference" text,
	"paid_at" timestamp with time zone,
	"paid_by" uuid,
	"journal_entry_id" uuid,
	"payment_journal_entry_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vendor_bills" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "checklist_tasks" DROP CONSTRAINT "checklist_tasks_suppresses_task_id_checklist_tasks_id_fk";
--> statement-breakpoint
ALTER TABLE "work_orders" ALTER COLUMN "labor_hours" SET DATA TYPE numeric(6, 2);--> statement-breakpoint
ALTER TABLE "work_orders" ALTER COLUMN "labor_actual_hours" SET DATA TYPE numeric(6, 2);--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "mileage_irs_rate" numeric(6, 4) DEFAULT '0.7250';--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "mileage_road_factor" numeric(4, 2) DEFAULT '1.20';--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "sales_tax_rates" jsonb;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "vendor_name" text;--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "approved_by" uuid;--> statement-breakpoint
ALTER TABLE "customer_credits" ADD CONSTRAINT "customer_credits_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_credits" ADD CONSTRAINT "customer_credits_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_credits" ADD CONSTRAINT "customer_credits_applied_to_invoice_id_invoices_id_fk" FOREIGN KEY ("applied_to_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_credits" ADD CONSTRAINT "customer_credits_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_plan_installments" ADD CONSTRAINT "payment_plan_installments_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_plan_installments" ADD CONSTRAINT "payment_plan_installments_payment_plan_id_payment_plans_id_fk" FOREIGN KEY ("payment_plan_id") REFERENCES "public"."payment_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_plan_installments" ADD CONSTRAINT "payment_plan_installments_payment_record_id_payment_records_id_fk" FOREIGN KEY ("payment_record_id") REFERENCES "public"."payment_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_bills" ADD CONSTRAINT "vendor_bills_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_bills" ADD CONSTRAINT "vendor_bills_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_bills" ADD CONSTRAINT "vendor_bills_category_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("category_account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_bills" ADD CONSTRAINT "vendor_bills_paid_by_profiles_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_bills" ADD CONSTRAINT "vendor_bills_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_credits_org_id_idx" ON "customer_credits" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "customer_credits_customer_id_idx" ON "customer_credits" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customer_credits_status_idx" ON "customer_credits" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ppi_plan_id_idx" ON "payment_plan_installments" USING btree ("payment_plan_id");--> statement-breakpoint
CREATE INDEX "ppi_org_id_idx" ON "payment_plan_installments" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "ppi_status_idx" ON "payment_plan_installments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payment_plans_org_id_idx" ON "payment_plans" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "payment_plans_invoice_id_idx" ON "payment_plans" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "payment_plans_status_idx" ON "payment_plans" USING btree ("status");--> statement-breakpoint
CREATE INDEX "vendor_bills_org_status_idx" ON "vendor_bills" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "vendor_bills_vendor_idx" ON "vendor_bills" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "vendor_bills_due_date_idx" ON "vendor_bills" USING btree ("org_id","due_date");--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_approved_by_profiles_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "time_entries_one_open_shift_idx" ON "time_entries" USING btree ("tech_id","org_id") WHERE clocked_out_at IS NULL;--> statement-breakpoint
CREATE POLICY "customer_credits_select_policy" ON "customer_credits" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "customer_credits_insert_policy" ON "customer_credits" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "customer_credits_update_policy" ON "customer_credits" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "customer_credits_delete_policy" ON "customer_credits" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );--> statement-breakpoint
CREATE POLICY "ppi_select_policy" ON "payment_plan_installments" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "ppi_insert_policy" ON "payment_plan_installments" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "ppi_update_policy" ON "payment_plan_installments" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "ppi_delete_policy" ON "payment_plan_installments" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );--> statement-breakpoint
CREATE POLICY "payment_plans_select_policy" ON "payment_plans" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "payment_plans_insert_policy" ON "payment_plans" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "payment_plans_update_policy" ON "payment_plans" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "payment_plans_delete_policy" ON "payment_plans" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );--> statement-breakpoint
CREATE POLICY "vendor_bills_select_policy" ON "vendor_bills" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );--> statement-breakpoint
CREATE POLICY "vendor_bills_insert_policy" ON "vendor_bills" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );--> statement-breakpoint
CREATE POLICY "vendor_bills_update_policy" ON "vendor_bills" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );--> statement-breakpoint
CREATE POLICY "vendor_bills_delete_policy" ON "vendor_bills" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );--> statement-breakpoint
ALTER POLICY "expenses_select_policy" ON "expenses" TO authenticated USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      );--> statement-breakpoint
ALTER POLICY "expenses_insert_policy" ON "expenses" TO authenticated WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      );