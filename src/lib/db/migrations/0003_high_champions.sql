ALTER TABLE "orgs" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "checklist_tasks" ADD COLUMN "requires_photo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "report_include_chemistry" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "report_include_checklist" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "report_include_photos" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "report_include_tech_name" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "custom_chemistry_targets" jsonb;