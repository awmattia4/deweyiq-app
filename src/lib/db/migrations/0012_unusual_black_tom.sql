CREATE TABLE "break_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"time_entry_id" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"is_auto_detected" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "break_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "time_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"tech_id" uuid NOT NULL,
	"work_date" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"clocked_in_at" timestamp with time zone NOT NULL,
	"clocked_out_at" timestamp with time zone,
	"clock_in_lat" double precision,
	"clock_in_lng" double precision,
	"clock_out_lat" double precision,
	"clock_out_lng" double precision,
	"total_minutes" integer,
	"break_minutes" integer DEFAULT 0,
	"notes" text,
	"qbo_time_activity_id" text,
	"qbo_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "time_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "time_entry_stops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"time_entry_id" uuid NOT NULL,
	"route_stop_id" uuid NOT NULL,
	"arrived_at" timestamp with time zone,
	"departed_at" timestamp with time zone,
	"onsite_minutes" integer,
	"drive_minutes_to_stop" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "time_entry_stops" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "accounting_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounting_periods" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "chart_of_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"account_number" text NOT NULL,
	"account_name" text NOT NULL,
	"account_type" text NOT NULL,
	"display_name" text NOT NULL,
	"parent_id" uuid,
	"is_system" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chart_of_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"entry_date" date NOT NULL,
	"description" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text,
	"is_posted" boolean DEFAULT true NOT NULL,
	"is_reversed" boolean DEFAULT false NOT NULL,
	"reversal_of" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "journal_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "journal_entry_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"journal_entry_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "journal_entry_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"plaid_item_id" text NOT NULL,
	"plaid_access_token" text NOT NULL,
	"plaid_cursor" text,
	"plaid_account_id" text NOT NULL,
	"account_name" text NOT NULL,
	"account_type" text NOT NULL,
	"mask" text,
	"institution_name" text,
	"current_balance" numeric(12, 2),
	"available_balance" numeric(12, 2),
	"chart_of_accounts_id" uuid,
	"last_synced_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_accounts_plaid_account_unique" UNIQUE("plaid_account_id")
);
--> statement-breakpoint
ALTER TABLE "bank_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "bank_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"plaid_transaction_id" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"date" text NOT NULL,
	"name" text,
	"merchant_name" text,
	"category" text,
	"pending" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'unmatched' NOT NULL,
	"matched_entry_id" uuid,
	"matched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_transactions_plaid_transaction_id_unique" UNIQUE("plaid_transaction_id")
);
--> statement-breakpoint
ALTER TABLE "bank_transactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "employee_availability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"tech_id" uuid NOT NULL,
	"day_of_week" integer NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employee_availability" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "employee_blocked_dates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"tech_id" uuid NOT NULL,
	"blocked_date" date NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employee_blocked_dates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "employee_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"tech_id" uuid NOT NULL,
	"doc_type" text NOT NULL,
	"doc_name" text NOT NULL,
	"file_url" text,
	"expires_at" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employee_documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "mileage_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"tech_id" uuid NOT NULL,
	"work_date" text NOT NULL,
	"origin_address" text,
	"destination_address" text,
	"purpose" text,
	"miles" numeric(8, 2) NOT NULL,
	"rate_per_mile" numeric(6, 4) DEFAULT '0.7250' NOT NULL,
	"is_auto_calculated" boolean DEFAULT false NOT NULL,
	"time_entry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mileage_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pto_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"tech_id" uuid NOT NULL,
	"pto_type" text NOT NULL,
	"balance_hours" numeric(8, 2) DEFAULT '0' NOT NULL,
	"accrual_rate_hours" numeric(8, 2) DEFAULT '0' NOT NULL,
	"last_accrual_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pto_balances" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pto_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"tech_id" uuid NOT NULL,
	"pto_type" text NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"hours" numeric(8, 2) NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"notes" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pto_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"vendor_name" text NOT NULL,
	"contact_email" text,
	"contact_phone" text,
	"address" text,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vendors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "qbo_employee_id" text;--> statement-breakpoint
ALTER TABLE "checklist_tasks" ADD COLUMN "requires_photo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "checklist_tasks" ADD COLUMN "suppresses_task_id" uuid;--> statement-breakpoint
ALTER TABLE "checklist_templates" ADD COLUMN "is_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "schedule_rules" ADD COLUMN "checklist_template_id" uuid;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "time_tracking_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "geofence_radius_meters" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "break_auto_detect_minutes" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "pay_period_type" text DEFAULT 'bi_weekly' NOT NULL;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "overtime_threshold_hours" integer DEFAULT 40 NOT NULL;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "accountant_mode_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "accounting_start_date" date;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "broadcast_history" jsonb;--> statement-breakpoint
ALTER TABLE "work_orders" ADD COLUMN "labor_hours" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "work_orders" ADD COLUMN "labor_rate" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "work_orders" ADD COLUMN "labor_actual_hours" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "break_events" ADD CONSTRAINT "break_events_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "break_events" ADD CONSTRAINT "break_events_time_entry_id_time_entries_id_fk" FOREIGN KEY ("time_entry_id") REFERENCES "public"."time_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_tech_id_profiles_id_fk" FOREIGN KEY ("tech_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entry_stops" ADD CONSTRAINT "time_entry_stops_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entry_stops" ADD CONSTRAINT "time_entry_stops_time_entry_id_time_entries_id_fk" FOREIGN KEY ("time_entry_id") REFERENCES "public"."time_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entry_stops" ADD CONSTRAINT "time_entry_stops_route_stop_id_route_stops_id_fk" FOREIGN KEY ("route_stop_id") REFERENCES "public"."route_stops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_closed_by_profiles_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_chart_of_accounts_id_chart_of_accounts_id_fk" FOREIGN KEY ("chart_of_accounts_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_matched_entry_id_journal_entries_id_fk" FOREIGN KEY ("matched_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_availability" ADD CONSTRAINT "employee_availability_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_availability" ADD CONSTRAINT "employee_availability_tech_id_profiles_id_fk" FOREIGN KEY ("tech_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_blocked_dates" ADD CONSTRAINT "employee_blocked_dates_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_blocked_dates" ADD CONSTRAINT "employee_blocked_dates_tech_id_profiles_id_fk" FOREIGN KEY ("tech_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_tech_id_profiles_id_fk" FOREIGN KEY ("tech_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mileage_logs" ADD CONSTRAINT "mileage_logs_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mileage_logs" ADD CONSTRAINT "mileage_logs_tech_id_profiles_id_fk" FOREIGN KEY ("tech_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mileage_logs" ADD CONSTRAINT "mileage_logs_time_entry_id_time_entries_id_fk" FOREIGN KEY ("time_entry_id") REFERENCES "public"."time_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pto_balances" ADD CONSTRAINT "pto_balances_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pto_balances" ADD CONSTRAINT "pto_balances_tech_id_profiles_id_fk" FOREIGN KEY ("tech_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pto_requests" ADD CONSTRAINT "pto_requests_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pto_requests" ADD CONSTRAINT "pto_requests_tech_id_profiles_id_fk" FOREIGN KEY ("tech_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pto_requests" ADD CONSTRAINT "pto_requests_reviewed_by_profiles_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "break_events_time_entry_idx" ON "break_events" USING btree ("time_entry_id");--> statement-breakpoint
CREATE INDEX "time_entries_tech_id_idx" ON "time_entries" USING btree ("tech_id");--> statement-breakpoint
CREATE INDEX "time_entries_org_date_idx" ON "time_entries" USING btree ("org_id","work_date");--> statement-breakpoint
CREATE INDEX "time_entries_tech_date_idx" ON "time_entries" USING btree ("tech_id","work_date");--> statement-breakpoint
CREATE INDEX "time_entry_stops_entry_idx" ON "time_entry_stops" USING btree ("time_entry_id");--> statement-breakpoint
CREATE INDEX "time_entry_stops_stop_idx" ON "time_entry_stops" USING btree ("route_stop_id");--> statement-breakpoint
CREATE INDEX "accounting_periods_org_idx" ON "accounting_periods" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "chart_of_accounts_org_idx" ON "chart_of_accounts" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "chart_of_accounts_org_number_idx" ON "chart_of_accounts" USING btree ("org_id","account_number");--> statement-breakpoint
CREATE INDEX "journal_entries_org_date_idx" ON "journal_entries" USING btree ("org_id","entry_date");--> statement-breakpoint
CREATE INDEX "journal_entries_source_idx" ON "journal_entries" USING btree ("org_id","source_type","source_id");--> statement-breakpoint
CREATE INDEX "journal_entry_lines_entry_idx" ON "journal_entry_lines" USING btree ("journal_entry_id");--> statement-breakpoint
CREATE INDEX "journal_entry_lines_account_idx" ON "journal_entry_lines" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "bank_accounts_org_idx" ON "bank_accounts" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "bank_transactions_account_idx" ON "bank_transactions" USING btree ("bank_account_id");--> statement-breakpoint
CREATE INDEX "bank_transactions_org_date_idx" ON "bank_transactions" USING btree ("org_id","date");--> statement-breakpoint
CREATE INDEX "bank_transactions_status_idx" ON "bank_transactions" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "employee_availability_tech_idx" ON "employee_availability" USING btree ("tech_id");--> statement-breakpoint
CREATE INDEX "employee_blocked_dates_tech_idx" ON "employee_blocked_dates" USING btree ("tech_id");--> statement-breakpoint
CREATE INDEX "employee_blocked_dates_date_idx" ON "employee_blocked_dates" USING btree ("org_id","blocked_date");--> statement-breakpoint
CREATE INDEX "employee_documents_tech_idx" ON "employee_documents" USING btree ("tech_id");--> statement-breakpoint
CREATE INDEX "employee_documents_org_expires_idx" ON "employee_documents" USING btree ("org_id","expires_at");--> statement-breakpoint
CREATE INDEX "mileage_logs_tech_date_idx" ON "mileage_logs" USING btree ("tech_id","work_date");--> statement-breakpoint
CREATE INDEX "mileage_logs_org_date_idx" ON "mileage_logs" USING btree ("org_id","work_date");--> statement-breakpoint
CREATE INDEX "pto_balances_tech_idx" ON "pto_balances" USING btree ("tech_id");--> statement-breakpoint
CREATE INDEX "pto_balances_org_idx" ON "pto_balances" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "pto_requests_tech_idx" ON "pto_requests" USING btree ("tech_id");--> statement-breakpoint
CREATE INDEX "pto_requests_org_status_idx" ON "pto_requests" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "vendors_org_idx" ON "vendors" USING btree ("org_id");--> statement-breakpoint
ALTER TABLE "checklist_tasks" ADD CONSTRAINT "checklist_tasks_suppresses_task_id_checklist_tasks_id_fk" FOREIGN KEY ("suppresses_task_id") REFERENCES "public"."checklist_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_rules" ADD CONSTRAINT "schedule_rules_checklist_template_id_checklist_templates_id_fk" FOREIGN KEY ("checklist_template_id") REFERENCES "public"."checklist_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "break_events_select_policy" ON "break_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (
          (select tech_id FROM time_entries WHERE id = time_entry_id) = auth.uid()
          OR (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
        )
      );--> statement-breakpoint
CREATE POLICY "break_events_insert_policy" ON "break_events" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (
          (select tech_id FROM time_entries WHERE id = time_entry_id) = auth.uid()
          OR (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
        )
      );--> statement-breakpoint
CREATE POLICY "break_events_update_policy" ON "break_events" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (
          (select tech_id FROM time_entries WHERE id = time_entry_id) = auth.uid()
          OR (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
        )
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (
          (select tech_id FROM time_entries WHERE id = time_entry_id) = auth.uid()
          OR (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
        )
      );--> statement-breakpoint
CREATE POLICY "break_events_delete_policy" ON "break_events" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "time_entries_select_policy" ON "time_entries" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (
          tech_id = auth.uid()
          OR (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
        )
      );--> statement-breakpoint
CREATE POLICY "time_entries_insert_policy" ON "time_entries" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (
          tech_id = auth.uid()
          OR (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
        )
      );--> statement-breakpoint
CREATE POLICY "time_entries_update_policy" ON "time_entries" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (
          tech_id = auth.uid()
          OR (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
        )
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (
          tech_id = auth.uid()
          OR (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
        )
      );--> statement-breakpoint
CREATE POLICY "time_entries_delete_policy" ON "time_entries" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "time_entry_stops_select_policy" ON "time_entry_stops" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (
          (select tech_id FROM time_entries WHERE id = time_entry_id) = auth.uid()
          OR (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
        )
      );--> statement-breakpoint
CREATE POLICY "time_entry_stops_insert_policy" ON "time_entry_stops" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (
          (select tech_id FROM time_entries WHERE id = time_entry_id) = auth.uid()
          OR (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
        )
      );--> statement-breakpoint
CREATE POLICY "time_entry_stops_update_policy" ON "time_entry_stops" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (
          (select tech_id FROM time_entries WHERE id = time_entry_id) = auth.uid()
          OR (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
        )
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (
          (select tech_id FROM time_entries WHERE id = time_entry_id) = auth.uid()
          OR (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
        )
      );--> statement-breakpoint
CREATE POLICY "time_entry_stops_delete_policy" ON "time_entry_stops" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "accounting_periods_select_policy" ON "accounting_periods" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );--> statement-breakpoint
CREATE POLICY "accounting_periods_insert_policy" ON "accounting_periods" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );--> statement-breakpoint
CREATE POLICY "accounting_periods_update_policy" ON "accounting_periods" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );--> statement-breakpoint
CREATE POLICY "accounting_periods_delete_policy" ON "accounting_periods" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );--> statement-breakpoint
CREATE POLICY "chart_of_accounts_select_policy" ON "chart_of_accounts" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "chart_of_accounts_insert_policy" ON "chart_of_accounts" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );--> statement-breakpoint
CREATE POLICY "chart_of_accounts_update_policy" ON "chart_of_accounts" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );--> statement-breakpoint
CREATE POLICY "chart_of_accounts_delete_policy" ON "chart_of_accounts" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );--> statement-breakpoint
CREATE POLICY "journal_entries_select_policy" ON "journal_entries" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "journal_entries_insert_policy" ON "journal_entries" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "journal_entries_update_policy" ON "journal_entries" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "journal_entries_delete_policy" ON "journal_entries" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );--> statement-breakpoint
CREATE POLICY "journal_entry_lines_select_policy" ON "journal_entry_lines" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "journal_entry_lines_insert_policy" ON "journal_entry_lines" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "journal_entry_lines_update_policy" ON "journal_entry_lines" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "journal_entry_lines_delete_policy" ON "journal_entry_lines" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );--> statement-breakpoint
CREATE POLICY "bank_accounts_select_policy" ON "bank_accounts" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );--> statement-breakpoint
CREATE POLICY "bank_accounts_insert_policy" ON "bank_accounts" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );--> statement-breakpoint
CREATE POLICY "bank_accounts_update_policy" ON "bank_accounts" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );--> statement-breakpoint
CREATE POLICY "bank_accounts_delete_policy" ON "bank_accounts" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );--> statement-breakpoint
CREATE POLICY "bank_transactions_select_policy" ON "bank_transactions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "bank_transactions_insert_policy" ON "bank_transactions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );--> statement-breakpoint
CREATE POLICY "bank_transactions_update_policy" ON "bank_transactions" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );--> statement-breakpoint
CREATE POLICY "bank_transactions_delete_policy" ON "bank_transactions" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );--> statement-breakpoint
CREATE POLICY "employee_availability_select_policy" ON "employee_availability" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (
          tech_id = auth.uid()
          OR (select auth.jwt() ->> 'user_role') = 'owner'
        )
      );--> statement-breakpoint
CREATE POLICY "employee_availability_insert_policy" ON "employee_availability" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );--> statement-breakpoint
CREATE POLICY "employee_availability_update_policy" ON "employee_availability" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );--> statement-breakpoint
CREATE POLICY "employee_availability_delete_policy" ON "employee_availability" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );--> statement-breakpoint
CREATE POLICY "employee_blocked_dates_select_policy" ON "employee_blocked_dates" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (
          tech_id = auth.uid()
          OR (select auth.jwt() ->> 'user_role') = 'owner'
        )
      );--> statement-breakpoint
CREATE POLICY "employee_blocked_dates_insert_policy" ON "employee_blocked_dates" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );--> statement-breakpoint
CREATE POLICY "employee_blocked_dates_update_policy" ON "employee_blocked_dates" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );--> statement-breakpoint
CREATE POLICY "employee_blocked_dates_delete_policy" ON "employee_blocked_dates" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );--> statement-breakpoint
CREATE POLICY "employee_documents_select_policy" ON "employee_documents" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (
          tech_id = auth.uid()
          OR (select auth.jwt() ->> 'user_role') = 'owner'
        )
      );--> statement-breakpoint
CREATE POLICY "employee_documents_insert_policy" ON "employee_documents" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );--> statement-breakpoint
CREATE POLICY "employee_documents_update_policy" ON "employee_documents" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );--> statement-breakpoint
CREATE POLICY "employee_documents_delete_policy" ON "employee_documents" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );--> statement-breakpoint
CREATE POLICY "mileage_logs_select_policy" ON "mileage_logs" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (
          tech_id = auth.uid()
          OR (select auth.jwt() ->> 'user_role') = 'owner'
        )
      );--> statement-breakpoint
CREATE POLICY "mileage_logs_insert_policy" ON "mileage_logs" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (
          tech_id = auth.uid()
          OR (select auth.jwt() ->> 'user_role') = 'owner'
        )
      );--> statement-breakpoint
CREATE POLICY "mileage_logs_update_policy" ON "mileage_logs" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );--> statement-breakpoint
CREATE POLICY "mileage_logs_delete_policy" ON "mileage_logs" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );--> statement-breakpoint
CREATE POLICY "pto_balances_select_policy" ON "pto_balances" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (
          tech_id = auth.uid()
          OR (select auth.jwt() ->> 'user_role') = 'owner'
        )
      );--> statement-breakpoint
CREATE POLICY "pto_balances_insert_policy" ON "pto_balances" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );--> statement-breakpoint
CREATE POLICY "pto_balances_update_policy" ON "pto_balances" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );--> statement-breakpoint
CREATE POLICY "pto_balances_delete_policy" ON "pto_balances" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );--> statement-breakpoint
CREATE POLICY "pto_requests_select_policy" ON "pto_requests" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (
          tech_id = auth.uid()
          OR (select auth.jwt() ->> 'user_role') = 'owner'
        )
      );--> statement-breakpoint
CREATE POLICY "pto_requests_insert_policy" ON "pto_requests" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (
          tech_id = auth.uid()
          OR (select auth.jwt() ->> 'user_role') = 'owner'
        )
      );--> statement-breakpoint
CREATE POLICY "pto_requests_update_policy" ON "pto_requests" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );--> statement-breakpoint
CREATE POLICY "pto_requests_delete_policy" ON "pto_requests" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );--> statement-breakpoint
CREATE POLICY "vendors_select_policy" ON "vendors" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "vendors_insert_policy" ON "vendors" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "vendors_update_policy" ON "vendors" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "vendors_delete_policy" ON "vendors" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );