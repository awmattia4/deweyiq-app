CREATE TABLE "route_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"tech_id" uuid,
	"date" date NOT NULL,
	"stop_order" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "route_days_org_tech_date_unique" UNIQUE("org_id","tech_id","date")
);
--> statement-breakpoint
ALTER TABLE "route_days" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "checklist_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"template_id" uuid,
	"customer_id" uuid,
	"label" text NOT NULL,
	"is_required" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "checklist_tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "checklist_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"service_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "checklist_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "visit_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visit_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"storage_path" text NOT NULL,
	"tag" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "visit_photos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "chemical_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"chemical_type" text NOT NULL,
	"concentration_pct" real,
	"unit" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chemical_products" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "route_stops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"tech_id" uuid,
	"customer_id" uuid NOT NULL,
	"pool_id" uuid,
	"schedule_rule_id" uuid,
	"scheduled_date" text NOT NULL,
	"sort_index" integer NOT NULL,
	"position_locked" boolean DEFAULT false NOT NULL,
	"window_start" time,
	"window_end" time,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"pre_arrival_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "route_stops_org_customer_pool_date_unique" UNIQUE("org_id","customer_id","pool_id","scheduled_date")
);
--> statement-breakpoint
ALTER TABLE "route_stops" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "schedule_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"pool_id" uuid,
	"tech_id" uuid,
	"frequency" text NOT NULL,
	"custom_interval_days" integer,
	"anchor_date" text NOT NULL,
	"preferred_day_of_week" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "schedule_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"date" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "holidays_org_date_unique" UNIQUE("org_id","date")
);
--> statement-breakpoint
ALTER TABLE "holidays" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"alert_type" text NOT NULL,
	"severity" text DEFAULT 'warning' NOT NULL,
	"reference_id" uuid,
	"reference_type" text,
	"title" text NOT NULL,
	"description" text,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dismissed_at" timestamp with time zone,
	"snoozed_until" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alerts_org_type_ref_unique" UNIQUE("org_id","alert_type","reference_id")
);
--> statement-breakpoint
ALTER TABLE "alerts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "org_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"pre_arrival_sms_enabled" boolean DEFAULT true NOT NULL,
	"pre_arrival_email_enabled" boolean DEFAULT true NOT NULL,
	"service_report_email_enabled" boolean DEFAULT true NOT NULL,
	"alert_missed_stop_enabled" boolean DEFAULT true NOT NULL,
	"alert_declining_chemistry_enabled" boolean DEFAULT true NOT NULL,
	"alert_incomplete_data_enabled" boolean DEFAULT true NOT NULL,
	"required_chemistry_by_sanitizer" jsonb,
	"required_checklist_task_ids" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_settings_org_unique" UNIQUE("org_id")
);
--> statement-breakpoint
ALTER TABLE "org_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "lat" double precision;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "lng" double precision;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "notifications_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "service_visits" ADD COLUMN "chemistry_readings" jsonb;--> statement-breakpoint
ALTER TABLE "service_visits" ADD COLUMN "checklist_completion" jsonb;--> statement-breakpoint
ALTER TABLE "service_visits" ADD COLUMN "photo_urls" jsonb;--> statement-breakpoint
ALTER TABLE "service_visits" ADD COLUMN "status" text;--> statement-breakpoint
ALTER TABLE "service_visits" ADD COLUMN "skip_reason" text;--> statement-breakpoint
ALTER TABLE "service_visits" ADD COLUMN "report_html" text;--> statement-breakpoint
ALTER TABLE "service_visits" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "service_visits" ADD COLUMN "email_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "route_days" ADD CONSTRAINT "route_days_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_days" ADD CONSTRAINT "route_days_tech_id_profiles_id_fk" FOREIGN KEY ("tech_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_tasks" ADD CONSTRAINT "checklist_tasks_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_tasks" ADD CONSTRAINT "checklist_tasks_template_id_checklist_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."checklist_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_tasks" ADD CONSTRAINT "checklist_tasks_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_templates" ADD CONSTRAINT "checklist_templates_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_photos" ADD CONSTRAINT "visit_photos_visit_id_service_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."service_visits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_photos" ADD CONSTRAINT "visit_photos_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chemical_products" ADD CONSTRAINT "chemical_products_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_tech_id_profiles_id_fk" FOREIGN KEY ("tech_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_schedule_rule_id_schedule_rules_id_fk" FOREIGN KEY ("schedule_rule_id") REFERENCES "public"."schedule_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_rules" ADD CONSTRAINT "schedule_rules_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_rules" ADD CONSTRAINT "schedule_rules_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_rules" ADD CONSTRAINT "schedule_rules_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_rules" ADD CONSTRAINT "schedule_rules_tech_id_profiles_id_fk" FOREIGN KEY ("tech_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_settings" ADD CONSTRAINT "org_settings_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "route_days_tech_date_idx" ON "route_days" USING btree ("tech_id","date");--> statement-breakpoint
CREATE INDEX "checklist_tasks_org_id_idx" ON "checklist_tasks" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "checklist_tasks_template_id_idx" ON "checklist_tasks" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "checklist_tasks_customer_id_idx" ON "checklist_tasks" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "checklist_templates_org_id_idx" ON "checklist_templates" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "visit_photos_visit_id_idx" ON "visit_photos" USING btree ("visit_id");--> statement-breakpoint
CREATE INDEX "visit_photos_org_id_idx" ON "visit_photos" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "chemical_products_org_id_idx" ON "chemical_products" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "chemical_products_chemical_type_idx" ON "chemical_products" USING btree ("chemical_type");--> statement-breakpoint
CREATE INDEX "route_stops_org_date_idx" ON "route_stops" USING btree ("org_id","scheduled_date");--> statement-breakpoint
CREATE INDEX "route_stops_tech_date_idx" ON "route_stops" USING btree ("tech_id","scheduled_date");--> statement-breakpoint
CREATE INDEX "route_stops_schedule_rule_idx" ON "route_stops" USING btree ("schedule_rule_id");--> statement-breakpoint
CREATE INDEX "schedule_rules_org_idx" ON "schedule_rules" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "schedule_rules_customer_idx" ON "schedule_rules" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "schedule_rules_tech_idx" ON "schedule_rules" USING btree ("tech_id");--> statement-breakpoint
CREATE INDEX "holidays_org_date_idx" ON "holidays" USING btree ("org_id","date");--> statement-breakpoint
CREATE INDEX "alerts_org_dismissed_idx" ON "alerts" USING btree ("org_id","dismissed_at");--> statement-breakpoint
CREATE POLICY "route_days_select_policy" ON "route_days" AS PERMISSIVE FOR SELECT TO "authenticated" USING (org_id = (select auth.jwt() ->> 'org_id')::uuid);--> statement-breakpoint
CREATE POLICY "route_days_insert_policy" ON "route_days" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "route_days_update_policy" ON "route_days" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "route_days_delete_policy" ON "route_days" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "checklist_tasks_select_policy" ON "checklist_tasks" AS PERMISSIVE FOR SELECT TO "authenticated" USING (org_id = (select auth.jwt() ->> 'org_id')::uuid);--> statement-breakpoint
CREATE POLICY "checklist_tasks_insert_policy" ON "checklist_tasks" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "checklist_tasks_update_policy" ON "checklist_tasks" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "checklist_tasks_delete_policy" ON "checklist_tasks" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "checklist_templates_select_policy" ON "checklist_templates" AS PERMISSIVE FOR SELECT TO "authenticated" USING (org_id = (select auth.jwt() ->> 'org_id')::uuid);--> statement-breakpoint
CREATE POLICY "checklist_templates_insert_policy" ON "checklist_templates" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "checklist_templates_update_policy" ON "checklist_templates" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "checklist_templates_delete_policy" ON "checklist_templates" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "visit_photos_select_policy" ON "visit_photos" AS PERMISSIVE FOR SELECT TO "authenticated" USING (org_id = (select auth.jwt() ->> 'org_id')::uuid);--> statement-breakpoint
CREATE POLICY "visit_photos_insert_policy" ON "visit_photos" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      );--> statement-breakpoint
CREATE POLICY "visit_photos_update_policy" ON "visit_photos" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "visit_photos_delete_policy" ON "visit_photos" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "chemical_products_select_policy" ON "chemical_products" AS PERMISSIVE FOR SELECT TO "authenticated" USING (org_id = (select auth.jwt() ->> 'org_id')::uuid);--> statement-breakpoint
CREATE POLICY "chemical_products_insert_policy" ON "chemical_products" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "chemical_products_update_policy" ON "chemical_products" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "chemical_products_delete_policy" ON "chemical_products" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "route_stops_select_policy" ON "route_stops" AS PERMISSIVE FOR SELECT TO "authenticated" USING (org_id = (select auth.jwt() ->> 'org_id')::uuid);--> statement-breakpoint
CREATE POLICY "route_stops_insert_policy" ON "route_stops" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "route_stops_update_policy" ON "route_stops" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      );--> statement-breakpoint
CREATE POLICY "route_stops_delete_policy" ON "route_stops" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "schedule_rules_select_policy" ON "schedule_rules" AS PERMISSIVE FOR SELECT TO "authenticated" USING (org_id = (select auth.jwt() ->> 'org_id')::uuid);--> statement-breakpoint
CREATE POLICY "schedule_rules_insert_policy" ON "schedule_rules" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "schedule_rules_update_policy" ON "schedule_rules" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "schedule_rules_delete_policy" ON "schedule_rules" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "holidays_select_policy" ON "holidays" AS PERMISSIVE FOR SELECT TO "authenticated" USING (org_id = (select auth.jwt() ->> 'org_id')::uuid);--> statement-breakpoint
CREATE POLICY "holidays_insert_policy" ON "holidays" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "holidays_update_policy" ON "holidays" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "holidays_delete_policy" ON "holidays" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "alerts_select_policy" ON "alerts" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "alerts_insert_policy" ON "alerts" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "alerts_update_policy" ON "alerts" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "alerts_delete_policy" ON "alerts" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );--> statement-breakpoint
CREATE POLICY "org_settings_select_policy" ON "org_settings" AS PERMISSIVE FOR SELECT TO "authenticated" USING (org_id = (select auth.jwt() ->> 'org_id')::uuid);--> statement-breakpoint
CREATE POLICY "org_settings_insert_policy" ON "org_settings" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );--> statement-breakpoint
CREATE POLICY "org_settings_update_policy" ON "org_settings" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );--> statement-breakpoint
CREATE POLICY "org_settings_delete_policy" ON "org_settings" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );