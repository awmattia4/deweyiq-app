CREATE TABLE "portal_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"service_request_id" uuid,
	"sender_role" text NOT NULL,
	"sender_name" text NOT NULL,
	"body" text,
	"photo_path" text,
	"read_by_office_at" timestamp with time zone,
	"read_by_customer_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "portal_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "service_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"pool_id" uuid,
	"work_order_id" uuid,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"is_urgent" boolean DEFAULT false NOT NULL,
	"photo_paths" jsonb DEFAULT '[]'::jsonb,
	"preferred_date" text,
	"preferred_time_window" text,
	"status" text DEFAULT 'submitted' NOT NULL,
	"office_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "service_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "brand_color" text;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "favicon_path" text;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "portal_welcome_message" text;--> statement-breakpoint
ALTER TABLE "portal_messages" ADD CONSTRAINT "portal_messages_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_messages" ADD CONSTRAINT "portal_messages_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "portal_messages_customer_id_idx" ON "portal_messages" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "portal_messages_org_id_idx" ON "portal_messages" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "portal_messages_service_request_id_idx" ON "portal_messages" USING btree ("service_request_id");--> statement-breakpoint
CREATE INDEX "service_requests_org_id_idx" ON "service_requests" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "service_requests_customer_id_idx" ON "service_requests" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "service_requests_status_idx" ON "service_requests" USING btree ("status");--> statement-breakpoint
CREATE POLICY "portal_messages_office_policy" ON "portal_messages" AS PERMISSIVE FOR ALL TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "portal_messages_customer_policy" ON "portal_messages" AS PERMISSIVE FOR ALL TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'customer'
        AND customer_id IN (
          SELECT id FROM customers
          WHERE email = (select auth.email())
          AND org_id = (select auth.jwt() ->> 'org_id')::uuid
        )
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'customer'
        AND customer_id IN (
          SELECT id FROM customers
          WHERE email = (select auth.email())
          AND org_id = (select auth.jwt() ->> 'org_id')::uuid
        )
      );--> statement-breakpoint
CREATE POLICY "service_requests_office_policy" ON "service_requests" AS PERMISSIVE FOR ALL TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "service_requests_customer_select_policy" ON "service_requests" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'customer'
        AND customer_id IN (
          SELECT id FROM customers
          WHERE email = (select auth.email())
          AND org_id = (select auth.jwt() ->> 'org_id')::uuid
        )
      );--> statement-breakpoint
CREATE POLICY "service_requests_customer_insert_policy" ON "service_requests" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'customer'
        AND customer_id IN (
          SELECT id FROM customers
          WHERE email = (select auth.email())
          AND org_id = (select auth.jwt() ->> 'org_id')::uuid
        )
      );