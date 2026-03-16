CREATE TABLE "equipment_readings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"equipment_id" uuid NOT NULL,
	"pool_id" uuid NOT NULL,
	"service_visit_id" uuid,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metrics" jsonb NOT NULL,
	"recorded_by_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "equipment_readings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"notification_type" text NOT NULL,
	"urgency" text DEFAULT 'informational' NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link" text,
	"read_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"expires_at" timestamp with time zone DEFAULT now() + interval '30 days' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"device_hint" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
ALTER TABLE "push_subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"notification_type" text NOT NULL,
	"push_enabled" boolean DEFAULT true NOT NULL,
	"email_enabled" boolean DEFAULT true NOT NULL,
	"in_app_enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_prefs_user_org_type_unique" UNIQUE("user_id","org_id","notification_type")
);
--> statement-breakpoint
ALTER TABLE "notification_preferences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "service_visits" ADD COLUMN "internal_notes" text;--> statement-breakpoint
ALTER TABLE "service_visits" ADD COLUMN "internal_flags" jsonb;--> statement-breakpoint
ALTER TABLE "equipment_readings" ADD CONSTRAINT "equipment_readings_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_readings" ADD CONSTRAINT "equipment_readings_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_readings" ADD CONSTRAINT "equipment_readings_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_readings" ADD CONSTRAINT "equipment_readings_service_visit_id_service_visits_id_fk" FOREIGN KEY ("service_visit_id") REFERENCES "public"."service_visits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_readings" ADD CONSTRAINT "equipment_readings_recorded_by_id_profiles_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_recipient_id_profiles_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "equipment_readings_org_id_idx" ON "equipment_readings" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "equipment_readings_equipment_id_idx" ON "equipment_readings" USING btree ("equipment_id");--> statement-breakpoint
CREATE INDEX "equipment_readings_pool_id_idx" ON "equipment_readings" USING btree ("pool_id");--> statement-breakpoint
CREATE INDEX "equipment_readings_recorded_at_idx" ON "equipment_readings" USING btree ("recorded_at");--> statement-breakpoint
CREATE INDEX "user_notifications_recipient_read_idx" ON "user_notifications" USING btree ("recipient_id","read_at");--> statement-breakpoint
CREATE INDEX "user_notifications_recipient_created_idx" ON "user_notifications" USING btree ("recipient_id","created_at");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notification_prefs_user_org_idx" ON "notification_preferences" USING btree ("user_id","org_id");--> statement-breakpoint
CREATE POLICY "equipment_readings_select_policy" ON "equipment_readings" AS PERMISSIVE FOR SELECT TO "authenticated" USING (org_id = (select auth.jwt() ->> 'org_id')::uuid);--> statement-breakpoint
CREATE POLICY "equipment_readings_insert_policy" ON "equipment_readings" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (org_id = (select auth.jwt() ->> 'org_id')::uuid);--> statement-breakpoint
CREATE POLICY "equipment_readings_update_policy" ON "equipment_readings" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "equipment_readings_delete_policy" ON "equipment_readings" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "user_notifications_select_policy" ON "user_notifications" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
        recipient_id = auth.uid()
        AND org_id = (select auth.jwt() ->> 'org_id')::uuid
      );--> statement-breakpoint
CREATE POLICY "user_notifications_update_policy" ON "user_notifications" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        recipient_id = auth.uid()
        AND org_id = (select auth.jwt() ->> 'org_id')::uuid
      ) WITH CHECK (
        recipient_id = auth.uid()
        AND org_id = (select auth.jwt() ->> 'org_id')::uuid
      );--> statement-breakpoint
CREATE POLICY "push_subscriptions_select_policy" ON "push_subscriptions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (user_id = auth.uid());--> statement-breakpoint
CREATE POLICY "push_subscriptions_insert_policy" ON "push_subscriptions" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (user_id = auth.uid());--> statement-breakpoint
CREATE POLICY "push_subscriptions_delete_policy" ON "push_subscriptions" AS PERMISSIVE FOR DELETE TO "authenticated" USING (user_id = auth.uid());--> statement-breakpoint
CREATE POLICY "notification_prefs_select_policy" ON "notification_preferences" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
        user_id = auth.uid()
        AND org_id = (select auth.jwt() ->> 'org_id')::uuid
      );--> statement-breakpoint
CREATE POLICY "notification_prefs_insert_policy" ON "notification_preferences" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        user_id = auth.uid()
        AND org_id = (select auth.jwt() ->> 'org_id')::uuid
      );--> statement-breakpoint
CREATE POLICY "notification_prefs_update_policy" ON "notification_preferences" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        user_id = auth.uid()
        AND org_id = (select auth.jwt() ->> 'org_id')::uuid
      ) WITH CHECK (
        user_id = auth.uid()
        AND org_id = (select auth.jwt() ->> 'org_id')::uuid
      );--> statement-breakpoint
CREATE POLICY "notification_prefs_delete_policy" ON "notification_preferences" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        user_id = auth.uid()
        AND org_id = (select auth.jwt() ->> 'org_id')::uuid
      );