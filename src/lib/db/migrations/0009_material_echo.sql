ALTER TABLE "profiles" ADD COLUMN "pay_type" text DEFAULT 'per_stop';--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "pay_rate" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "service_visits" ADD COLUMN "dosing_amounts" jsonb;--> statement-breakpoint
ALTER TABLE "chemical_products" ADD COLUMN "cost_per_unit" numeric(10, 4);--> statement-breakpoint
ALTER TABLE "route_stops" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "chem_profit_margin_threshold_pct" numeric(5, 2) DEFAULT '20';--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "wo_upsell_commission_pct" numeric(5, 2) DEFAULT '0';