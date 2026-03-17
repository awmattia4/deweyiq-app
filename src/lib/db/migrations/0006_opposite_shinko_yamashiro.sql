CREATE TABLE "payment_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"method" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"stripe_payment_intent_id" text,
	"qbo_payment_id" text,
	"settled_at" timestamp with time zone,
	"failure_reason" text,
	"attempt_count" integer DEFAULT 1 NOT NULL,
	"next_retry_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "dunning_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"max_retries" integer DEFAULT 3 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dunning_config_org_unique" UNIQUE("org_id")
);
--> statement-breakpoint
ALTER TABLE "dunning_config" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"category" text NOT NULL,
	"description" text,
	"date" date NOT NULL,
	"receipt_url" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "expenses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "notification_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"template_type" text NOT NULL,
	"subject" text,
	"body_html" text,
	"sms_text" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_templates_org_type_unique" UNIQUE("org_id","template_type")
);
--> statement-breakpoint
ALTER TABLE "notification_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "billing_model" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "flat_rate_amount" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "autopay_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "autopay_method_id" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "qbo_customer_id" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "overdue_balance" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "checklist_templates" ADD COLUMN "is_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "route_stops" ADD COLUMN "checklist_template_id" uuid;--> statement-breakpoint
ALTER TABLE "schedule_rules" ADD COLUMN "checklist_template_id" uuid;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "stripe_account_id" text;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "stripe_onboarding_done" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "qbo_realm_id" text;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "qbo_access_token" text;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "qbo_refresh_token" text;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "qbo_token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "qbo_last_sync_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "qbo_connected" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "payment_provider" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "cc_surcharge_pct" numeric(5, 4);--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "cc_surcharge_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "default_payment_terms_days" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "invoice_footer_text" text;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "google_review_url" text;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "website_url" text;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "social_media_urls" jsonb;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "custom_email_footer" text;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "custom_sms_signature" text;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD COLUMN "visit_id" uuid;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD COLUMN "stop_date" date;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "billing_model" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "billing_period_start" date;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "billing_period_end" date;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "due_date" date;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "stripe_payment_intent_id" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "payment_method" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "surcharge_amount" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "qbo_invoice_id" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "sent_sms_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dunning_config" ADD CONSTRAINT "dunning_config_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_templates" ADD CONSTRAINT "notification_templates_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_records_org_id_idx" ON "payment_records" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "payment_records_invoice_id_idx" ON "payment_records" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "payment_records_status_idx" ON "payment_records" USING btree ("status");--> statement-breakpoint
CREATE INDEX "expenses_org_id_idx" ON "expenses" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "expenses_date_idx" ON "expenses" USING btree ("date");--> statement-breakpoint
CREATE INDEX "expenses_category_idx" ON "expenses" USING btree ("category");--> statement-breakpoint
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_checklist_template_id_checklist_templates_id_fk" FOREIGN KEY ("checklist_template_id") REFERENCES "public"."checklist_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_rules" ADD CONSTRAINT "schedule_rules_checklist_template_id_checklist_templates_id_fk" FOREIGN KEY ("checklist_template_id") REFERENCES "public"."checklist_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "payment_records_select_policy" ON "payment_records" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "payment_records_insert_policy" ON "payment_records" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "payment_records_update_policy" ON "payment_records" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "payment_records_delete_policy" ON "payment_records" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );--> statement-breakpoint
CREATE POLICY "dunning_config_select_policy" ON "dunning_config" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "dunning_config_insert_policy" ON "dunning_config" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );--> statement-breakpoint
CREATE POLICY "dunning_config_update_policy" ON "dunning_config" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );--> statement-breakpoint
CREATE POLICY "dunning_config_delete_policy" ON "dunning_config" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );--> statement-breakpoint
CREATE POLICY "expenses_select_policy" ON "expenses" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "expenses_insert_policy" ON "expenses" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "expenses_update_policy" ON "expenses" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );--> statement-breakpoint
CREATE POLICY "expenses_delete_policy" ON "expenses" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );--> statement-breakpoint
CREATE POLICY "notification_templates_select_policy" ON "notification_templates" AS PERMISSIVE FOR SELECT TO "authenticated" USING (org_id = (select auth.jwt() ->> 'org_id')::uuid);--> statement-breakpoint
CREATE POLICY "notification_templates_insert_policy" ON "notification_templates" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "notification_templates_update_policy" ON "notification_templates" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "notification_templates_delete_policy" ON "notification_templates" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );