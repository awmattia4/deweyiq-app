CREATE TABLE "orgs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orgs_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "orgs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "profiles_org_id_idx" ON "profiles" USING btree ("org_id");--> statement-breakpoint
CREATE POLICY "orgs_select_policy" ON "orgs" AS PERMISSIVE FOR SELECT TO "authenticated" USING (id = (select auth.jwt() ->> 'org_id')::uuid);--> statement-breakpoint
CREATE POLICY "orgs_update_policy" ON "orgs" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (id = (select auth.jwt() ->> 'org_id')::uuid AND (select auth.jwt() ->> 'user_role') = 'owner') WITH CHECK (id = (select auth.jwt() ->> 'org_id')::uuid AND (select auth.jwt() ->> 'user_role') = 'owner');--> statement-breakpoint
CREATE POLICY "profiles_select_policy" ON "profiles" AS PERMISSIVE FOR SELECT TO "authenticated" USING (org_id = (select auth.jwt() ->> 'org_id')::uuid);--> statement-breakpoint
CREATE POLICY "profiles_insert_policy" ON "profiles" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (org_id = (select auth.jwt() ->> 'org_id')::uuid);--> statement-breakpoint
CREATE POLICY "profiles_update_policy" ON "profiles" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        id = auth.uid()
        OR (
          (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
          AND org_id = (select auth.jwt() ->> 'org_id')::uuid
        )
      ) WITH CHECK (
        id = auth.uid()
        OR (
          (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
          AND org_id = (select auth.jwt() ->> 'org_id')::uuid
        )
      );--> statement-breakpoint
CREATE POLICY "profiles_delete_policy" ON "profiles" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        (select auth.jwt() ->> 'user_role') = 'owner'
        AND org_id = (select auth.jwt() ->> 'org_id')::uuid
      );