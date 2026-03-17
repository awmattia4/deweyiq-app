DROP INDEX "chart_of_accounts_org_number_idx";--> statement-breakpoint
ALTER TABLE "route_stops" ADD COLUMN "stop_type" text DEFAULT 'service' NOT NULL;--> statement-breakpoint
ALTER TABLE "route_stops" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "portal_messages" ADD COLUMN "project_id" uuid;--> statement-breakpoint
CREATE INDEX "route_stops_project_id_idx" ON "route_stops" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "portal_messages_project_id_idx" ON "portal_messages" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chart_of_accounts_org_number_idx" ON "chart_of_accounts" USING btree ("org_id","account_number");