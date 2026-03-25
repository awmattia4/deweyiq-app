CREATE TABLE "daily_truck_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"tech_id" uuid NOT NULL,
	"truck_id" uuid,
	"override_date" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "daily_truck_overrides" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tech_truck_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"tech_id" uuid NOT NULL,
	"truck_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tech_truck_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "trucks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trucks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agreement_amendments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agreement_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"amendment_type" text NOT NULL,
	"change_summary" text NOT NULL,
	"changed_by_id" uuid,
	"status" text DEFAULT 'pending_signature' NOT NULL,
	"signed_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"snapshot_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agreement_amendments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agreement_pool_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agreement_id" uuid NOT NULL,
	"pool_id" uuid NOT NULL,
	"frequency" text NOT NULL,
	"custom_interval_days" integer,
	"preferred_day_of_week" integer,
	"pricing_model" text NOT NULL,
	"monthly_amount" numeric(10, 2),
	"per_visit_amount" numeric(10, 2),
	"tiered_threshold_visits" integer,
	"tiered_base_amount" numeric(10, 2),
	"tiered_overage_amount" numeric(10, 2),
	"checklist_task_ids" jsonb DEFAULT '[]'::jsonb,
	"notes" text,
	"schedule_rule_id" uuid
);
--> statement-breakpoint
ALTER TABLE "agreement_pool_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "service_agreements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"agreement_number" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"term_type" text NOT NULL,
	"start_date" text,
	"end_date" text,
	"auto_renew" boolean DEFAULT true NOT NULL,
	"template_id" uuid,
	"terms_and_conditions" text,
	"cancellation_policy" text,
	"liability_waiver" text,
	"internal_notes" text,
	"version" integer DEFAULT 1 NOT NULL,
	"sent_at" timestamp with time zone,
	"signed_at" timestamp with time zone,
	"declined_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"paused_at" timestamp with time zone,
	"paused_reason" text,
	"renewed_at" timestamp with time zone,
	"signature_name" text,
	"signature_image_base64" text,
	"signature_ip" text,
	"signature_user_agent" text,
	"decline_reason" text,
	"pending_amendment_id" uuid,
	"activity_log" jsonb DEFAULT '[]'::jsonb,
	"renewal_reminder_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "service_agreements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agreement_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"default_term_type" text,
	"default_frequency" text,
	"default_pricing_model" text,
	"default_monthly_amount" numeric(10, 2),
	"terms_and_conditions" text,
	"cancellation_policy" text,
	"liability_waiver" text,
	"service_description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agreement_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "truck_inventory" ALTER COLUMN "tech_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "agreement_notice_period_days" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "agreement_renewal_lead_days" jsonb DEFAULT '[30, 7]'::jsonb;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "next_agreement_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "agreement_number_prefix" text DEFAULT 'SA';--> statement-breakpoint
ALTER TABLE "daily_truck_overrides" ADD CONSTRAINT "daily_truck_overrides_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_truck_overrides" ADD CONSTRAINT "daily_truck_overrides_tech_id_profiles_id_fk" FOREIGN KEY ("tech_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_truck_overrides" ADD CONSTRAINT "daily_truck_overrides_truck_id_trucks_id_fk" FOREIGN KEY ("truck_id") REFERENCES "public"."trucks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tech_truck_assignments" ADD CONSTRAINT "tech_truck_assignments_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tech_truck_assignments" ADD CONSTRAINT "tech_truck_assignments_tech_id_profiles_id_fk" FOREIGN KEY ("tech_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tech_truck_assignments" ADD CONSTRAINT "tech_truck_assignments_truck_id_trucks_id_fk" FOREIGN KEY ("truck_id") REFERENCES "public"."trucks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trucks" ADD CONSTRAINT "trucks_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_amendments" ADD CONSTRAINT "agreement_amendments_agreement_id_service_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."service_agreements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_amendments" ADD CONSTRAINT "agreement_amendments_changed_by_id_profiles_id_fk" FOREIGN KEY ("changed_by_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_pool_entries" ADD CONSTRAINT "agreement_pool_entries_agreement_id_service_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."service_agreements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_pool_entries" ADD CONSTRAINT "agreement_pool_entries_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_pool_entries" ADD CONSTRAINT "agreement_pool_entries_schedule_rule_id_schedule_rules_id_fk" FOREIGN KEY ("schedule_rule_id") REFERENCES "public"."schedule_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_agreements" ADD CONSTRAINT "service_agreements_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_agreements" ADD CONSTRAINT "service_agreements_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_templates" ADD CONSTRAINT "agreement_templates_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "daily_truck_overrides_lookup_idx" ON "daily_truck_overrides" USING btree ("org_id","tech_id","override_date");--> statement-breakpoint
CREATE INDEX "tech_truck_assignments_org_tech_idx" ON "tech_truck_assignments" USING btree ("org_id","tech_id");--> statement-breakpoint
CREATE INDEX "tech_truck_assignments_truck_idx" ON "tech_truck_assignments" USING btree ("truck_id");--> statement-breakpoint
CREATE INDEX "trucks_org_idx" ON "trucks" USING btree ("org_id");--> statement-breakpoint
CREATE POLICY "daily_truck_overrides_select_policy" ON "daily_truck_overrides" AS PERMISSIVE FOR SELECT TO "authenticated" USING (org_id = (select auth.jwt() ->> 'org_id')::uuid);--> statement-breakpoint
CREATE POLICY "daily_truck_overrides_insert_policy" ON "daily_truck_overrides" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "daily_truck_overrides_update_policy" ON "daily_truck_overrides" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "daily_truck_overrides_delete_policy" ON "daily_truck_overrides" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "tech_truck_select_policy" ON "tech_truck_assignments" AS PERMISSIVE FOR SELECT TO "authenticated" USING (org_id = (select auth.jwt() ->> 'org_id')::uuid);--> statement-breakpoint
CREATE POLICY "tech_truck_insert_policy" ON "tech_truck_assignments" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "tech_truck_update_policy" ON "tech_truck_assignments" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "tech_truck_delete_policy" ON "tech_truck_assignments" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "trucks_select_policy" ON "trucks" AS PERMISSIVE FOR SELECT TO "authenticated" USING (org_id = (select auth.jwt() ->> 'org_id')::uuid);--> statement-breakpoint
CREATE POLICY "trucks_insert_policy" ON "trucks" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "trucks_update_policy" ON "trucks" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "trucks_delete_policy" ON "trucks" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "agreement_amendments_select_policy" ON "agreement_amendments" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
        EXISTS (
          SELECT 1 FROM service_agreements sa
          WHERE sa.id = agreement_id
            AND sa.org_id = (select auth.jwt() ->> 'org_id')::uuid
            AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
        )
      );--> statement-breakpoint
CREATE POLICY "agreement_amendments_insert_policy" ON "agreement_amendments" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        EXISTS (
          SELECT 1 FROM service_agreements sa
          WHERE sa.id = agreement_id
            AND sa.org_id = (select auth.jwt() ->> 'org_id')::uuid
            AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
        )
      );--> statement-breakpoint
CREATE POLICY "agreement_amendments_update_policy" ON "agreement_amendments" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        EXISTS (
          SELECT 1 FROM service_agreements sa
          WHERE sa.id = agreement_id
            AND sa.org_id = (select auth.jwt() ->> 'org_id')::uuid
            AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
        )
      ) WITH CHECK (
        EXISTS (
          SELECT 1 FROM service_agreements sa
          WHERE sa.id = agreement_id
            AND sa.org_id = (select auth.jwt() ->> 'org_id')::uuid
            AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
        )
      );--> statement-breakpoint
CREATE POLICY "agreement_amendments_delete_policy" ON "agreement_amendments" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        EXISTS (
          SELECT 1 FROM service_agreements sa
          WHERE sa.id = agreement_id
            AND sa.org_id = (select auth.jwt() ->> 'org_id')::uuid
            AND (select auth.jwt() ->> 'user_role') = 'owner'
        )
      );--> statement-breakpoint
CREATE POLICY "agreement_pool_entries_select_policy" ON "agreement_pool_entries" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
        EXISTS (
          SELECT 1 FROM service_agreements sa
          WHERE sa.id = agreement_id
            AND sa.org_id = (select auth.jwt() ->> 'org_id')::uuid
            AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
        )
      );--> statement-breakpoint
CREATE POLICY "agreement_pool_entries_insert_policy" ON "agreement_pool_entries" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        EXISTS (
          SELECT 1 FROM service_agreements sa
          WHERE sa.id = agreement_id
            AND sa.org_id = (select auth.jwt() ->> 'org_id')::uuid
            AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
        )
      );--> statement-breakpoint
CREATE POLICY "agreement_pool_entries_update_policy" ON "agreement_pool_entries" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        EXISTS (
          SELECT 1 FROM service_agreements sa
          WHERE sa.id = agreement_id
            AND sa.org_id = (select auth.jwt() ->> 'org_id')::uuid
            AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
        )
      ) WITH CHECK (
        EXISTS (
          SELECT 1 FROM service_agreements sa
          WHERE sa.id = agreement_id
            AND sa.org_id = (select auth.jwt() ->> 'org_id')::uuid
            AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
        )
      );--> statement-breakpoint
CREATE POLICY "agreement_pool_entries_delete_policy" ON "agreement_pool_entries" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        EXISTS (
          SELECT 1 FROM service_agreements sa
          WHERE sa.id = agreement_id
            AND sa.org_id = (select auth.jwt() ->> 'org_id')::uuid
            AND (select auth.jwt() ->> 'user_role') = 'owner'
        )
      );--> statement-breakpoint
CREATE POLICY "service_agreements_select_policy" ON "service_agreements" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "service_agreements_insert_policy" ON "service_agreements" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "service_agreements_update_policy" ON "service_agreements" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "service_agreements_delete_policy" ON "service_agreements" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );--> statement-breakpoint
CREATE POLICY "agreement_templates_select_policy" ON "agreement_templates" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "agreement_templates_insert_policy" ON "agreement_templates" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "agreement_templates_update_policy" ON "agreement_templates" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "agreement_templates_delete_policy" ON "agreement_templates" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );