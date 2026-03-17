CREATE TABLE "project_phase_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"phase_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"completed_by" uuid,
	"notes" text,
	"is_required" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_phase_tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "project_phases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'not_started' NOT NULL,
	"dependency_phase_id" uuid,
	"dependency_type" text DEFAULT 'hard',
	"assigned_tech_id" uuid,
	"estimated_start_date" text,
	"estimated_end_date" text,
	"actual_start_date" text,
	"actual_end_date" text,
	"estimated_labor_hours" numeric(8, 2),
	"actual_labor_hours" numeric(8, 2),
	"is_outdoor" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_phases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "project_surveys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"route_stop_id" uuid,
	"surveyed_by" uuid,
	"surveyed_at" timestamp with time zone,
	"measurements" jsonb,
	"existing_conditions" jsonb,
	"access_constraints" text,
	"utility_locations" text,
	"hoa_requirements" text,
	"photos" jsonb,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_surveys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "project_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"project_type" text DEFAULT 'renovation' NOT NULL,
	"default_phases" jsonb,
	"default_payment_schedule" jsonb,
	"tier_config" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"pool_id" uuid,
	"project_number" text,
	"name" text NOT NULL,
	"project_type" text DEFAULT 'renovation' NOT NULL,
	"template_id" uuid,
	"stage" text DEFAULT 'lead' NOT NULL,
	"stage_entered_at" timestamp with time zone DEFAULT now(),
	"status" text DEFAULT 'active' NOT NULL,
	"on_hold_reason" text,
	"suspended_at" timestamp with time zone,
	"contract_amount" numeric(12, 2),
	"retainage_pct" numeric(5, 2) DEFAULT '10',
	"estimated_start_date" text,
	"estimated_completion_date" text,
	"actual_start_date" text,
	"actual_completion_date" text,
	"site_notes" jsonb,
	"lead_source" text,
	"lead_notes" text,
	"financing_status" text,
	"activity_log" jsonb,
	"last_activity_at" timestamp with time zone,
	"cancellation_policy" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "project_payment_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"proposal_id" uuid,
	"name" text NOT NULL,
	"trigger_phase_id" uuid,
	"percentage" numeric(5, 2),
	"amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"due_date" text,
	"invoice_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_payment_milestones" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "project_proposal_addons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"proposal_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"is_selected" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_proposal_addons" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "project_proposal_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"proposal_id" uuid NOT NULL,
	"tier_id" uuid,
	"category" text DEFAULT 'material' NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(10, 3) DEFAULT '1' NOT NULL,
	"unit_price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"markup_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_proposal_line_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "project_proposal_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"proposal_id" uuid NOT NULL,
	"tier_level" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"features" jsonb,
	"photo_urls" jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_proposal_tiers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "project_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"pricing_method" text DEFAULT 'lump_sum' NOT NULL,
	"show_line_item_detail" boolean DEFAULT true NOT NULL,
	"scope_description" text,
	"terms_and_conditions" text,
	"warranty_info" text,
	"cancellation_policy" text,
	"selected_tier" text,
	"signature_data_url" text,
	"signed_at" timestamp with time zone,
	"signed_name" text,
	"signed_ip" text,
	"approved_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"total_amount" numeric(12, 2) DEFAULT '0',
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_proposals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "proposal_change_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"proposal_id" uuid NOT NULL,
	"customer_notes" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "proposal_change_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "project_material_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"po_id" uuid,
	"quantity_received" numeric(10, 3) NOT NULL,
	"received_by" uuid,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"photo_url" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_material_receipts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "project_material_returns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"quantity_returned" numeric(10, 3) NOT NULL,
	"return_reason" text,
	"credit_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"returned_by" uuid,
	"returned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_material_returns" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "project_material_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"phase_id" uuid,
	"logged_by" uuid,
	"quantity_used" numeric(10, 3) NOT NULL,
	"used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_material_usage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "project_materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"proposal_line_item_id" uuid,
	"name" text NOT NULL,
	"category" text DEFAULT 'other' NOT NULL,
	"quantity_estimated" numeric(10, 3) DEFAULT '0' NOT NULL,
	"quantity_ordered" numeric(10, 3) DEFAULT '0' NOT NULL,
	"quantity_received" numeric(10, 3) DEFAULT '0' NOT NULL,
	"quantity_used" numeric(10, 3) DEFAULT '0' NOT NULL,
	"unit" text DEFAULT 'each' NOT NULL,
	"unit_cost_estimated" numeric(12, 2),
	"unit_cost_actual" numeric(12, 2),
	"supplier" text,
	"order_status" text DEFAULT 'not_ordered' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_materials" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "project_po_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"po_id" uuid NOT NULL,
	"material_id" uuid,
	"quantity" numeric(10, 3) DEFAULT '1' NOT NULL,
	"unit_price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_po_line_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "project_purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"po_number" text,
	"supplier_name" text NOT NULL,
	"supplier_contact" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"total_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_purchase_orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "project_change_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"change_order_number" text,
	"description" text NOT NULL,
	"reason" text DEFAULT 'scope_change' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"cost_impact" numeric(12, 2) DEFAULT '0' NOT NULL,
	"schedule_impact_days" integer DEFAULT 0 NOT NULL,
	"cost_allocation" text DEFAULT 'add_to_final' NOT NULL,
	"line_items" jsonb,
	"issue_flag_id" uuid,
	"approved_at" timestamp with time zone,
	"approved_signature" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_change_orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "project_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"document_type" text DEFAULT 'other' NOT NULL,
	"file_path" text NOT NULL,
	"file_name" text NOT NULL,
	"uploaded_by" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "project_inspections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"phase_id" uuid,
	"inspection_type" text NOT NULL,
	"scheduled_date" text,
	"actual_date" text,
	"inspector_name" text,
	"inspector_contact" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"result_notes" text,
	"correction_tasks" jsonb,
	"documents" jsonb,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_inspections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "project_permits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"permit_type" text NOT NULL,
	"permit_number" text,
	"status" text DEFAULT 'not_applied' NOT NULL,
	"applied_date" text,
	"approved_date" text,
	"expiration_date" text,
	"inspector_name" text,
	"inspector_phone" text,
	"fee" numeric(12, 2),
	"documents" jsonb,
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_permits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "project_punch_list" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"item_description" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"assigned_to" uuid,
	"photo_urls" jsonb,
	"resolution_notes" text,
	"resolved_at" timestamp with time zone,
	"customer_accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_punch_list" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "project_warranty_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_type" text NOT NULL,
	"warranty_type" text NOT NULL,
	"duration_months" integer NOT NULL,
	"what_covered" text NOT NULL,
	"exclusions" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_warranty_terms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "warranty_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"warranty_term_id" uuid,
	"work_order_id" uuid,
	"customer_description" text NOT NULL,
	"status" text DEFAULT 'submitted' NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolution_notes" text,
	"is_warranty_covered" boolean DEFAULT true NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "warranty_claims" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "project_phase_subcontractors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"phase_id" uuid NOT NULL,
	"subcontractor_id" uuid NOT NULL,
	"scope_of_work" text,
	"agreed_price" numeric(12, 2),
	"status" text DEFAULT 'not_started' NOT NULL,
	"payment_status" text DEFAULT 'unpaid' NOT NULL,
	"amount_paid" numeric(12, 2) DEFAULT '0' NOT NULL,
	"lien_waiver_path" text,
	"scheduled_start" text,
	"scheduled_end" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_phase_subcontractors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "subcontractors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"trade" text DEFAULT 'other' NOT NULL,
	"contact_name" text,
	"email" text,
	"phone" text,
	"address" text,
	"insurance_cert_path" text,
	"insurance_expiry" text,
	"license_number" text,
	"license_expiry" text,
	"payment_terms" text,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subcontractors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "project_equipment_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"equipment_description" text NOT NULL,
	"assigned_date" text NOT NULL,
	"returned_date" text,
	"assigned_by" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_equipment_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "project_issue_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"phase_id" uuid,
	"task_id" uuid,
	"flagged_by" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"severity" text DEFAULT 'medium' NOT NULL,
	"photo_urls" jsonb,
	"status" text DEFAULT 'open' NOT NULL,
	"change_order_id" uuid,
	"alert_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_issue_flags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "project_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"phase_id" uuid,
	"task_id" uuid,
	"tag" text DEFAULT 'during' NOT NULL,
	"file_path" text NOT NULL,
	"thumbnail_path" text,
	"caption" text,
	"taken_by" uuid,
	"taken_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_photos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "project_time_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"phase_id" uuid,
	"task_id" uuid,
	"tech_id" uuid NOT NULL,
	"time_entry_id" uuid,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone,
	"duration_minutes" integer,
	"entry_type" text DEFAULT 'timer' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_time_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "project_inactivity_alert_days" integer DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "invoice_type" text DEFAULT 'service' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "project_milestone_id" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "retainage_held" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "retainage_released" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "project_phase_tasks" ADD CONSTRAINT "project_phase_tasks_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_phase_tasks" ADD CONSTRAINT "project_phase_tasks_phase_id_project_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."project_phases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_phase_tasks" ADD CONSTRAINT "project_phase_tasks_completed_by_profiles_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_phases" ADD CONSTRAINT "project_phases_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_phases" ADD CONSTRAINT "project_phases_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_phases" ADD CONSTRAINT "project_phases_assigned_tech_id_profiles_id_fk" FOREIGN KEY ("assigned_tech_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_surveys" ADD CONSTRAINT "project_surveys_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_surveys" ADD CONSTRAINT "project_surveys_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_surveys" ADD CONSTRAINT "project_surveys_route_stop_id_route_stops_id_fk" FOREIGN KEY ("route_stop_id") REFERENCES "public"."route_stops"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_surveys" ADD CONSTRAINT "project_surveys_surveyed_by_profiles_id_fk" FOREIGN KEY ("surveyed_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_templates" ADD CONSTRAINT "project_templates_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_payment_milestones" ADD CONSTRAINT "project_payment_milestones_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_payment_milestones" ADD CONSTRAINT "project_payment_milestones_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_payment_milestones" ADD CONSTRAINT "project_payment_milestones_proposal_id_project_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."project_proposals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_payment_milestones" ADD CONSTRAINT "project_payment_milestones_trigger_phase_id_project_phases_id_fk" FOREIGN KEY ("trigger_phase_id") REFERENCES "public"."project_phases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_payment_milestones" ADD CONSTRAINT "project_payment_milestones_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_proposal_addons" ADD CONSTRAINT "project_proposal_addons_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_proposal_addons" ADD CONSTRAINT "project_proposal_addons_proposal_id_project_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."project_proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_proposal_line_items" ADD CONSTRAINT "project_proposal_line_items_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_proposal_line_items" ADD CONSTRAINT "project_proposal_line_items_proposal_id_project_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."project_proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_proposal_line_items" ADD CONSTRAINT "project_proposal_line_items_tier_id_project_proposal_tiers_id_fk" FOREIGN KEY ("tier_id") REFERENCES "public"."project_proposal_tiers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_proposal_tiers" ADD CONSTRAINT "project_proposal_tiers_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_proposal_tiers" ADD CONSTRAINT "project_proposal_tiers_proposal_id_project_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."project_proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_proposals" ADD CONSTRAINT "project_proposals_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_proposals" ADD CONSTRAINT "project_proposals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_change_requests" ADD CONSTRAINT "proposal_change_requests_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_change_requests" ADD CONSTRAINT "proposal_change_requests_proposal_id_project_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."project_proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_material_receipts" ADD CONSTRAINT "project_material_receipts_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_material_receipts" ADD CONSTRAINT "project_material_receipts_material_id_project_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."project_materials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_material_receipts" ADD CONSTRAINT "project_material_receipts_po_id_project_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."project_purchase_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_material_receipts" ADD CONSTRAINT "project_material_receipts_received_by_profiles_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_material_returns" ADD CONSTRAINT "project_material_returns_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_material_returns" ADD CONSTRAINT "project_material_returns_material_id_project_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."project_materials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_material_returns" ADD CONSTRAINT "project_material_returns_returned_by_profiles_id_fk" FOREIGN KEY ("returned_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_material_usage" ADD CONSTRAINT "project_material_usage_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_material_usage" ADD CONSTRAINT "project_material_usage_material_id_project_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."project_materials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_material_usage" ADD CONSTRAINT "project_material_usage_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_material_usage" ADD CONSTRAINT "project_material_usage_phase_id_project_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."project_phases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_material_usage" ADD CONSTRAINT "project_material_usage_logged_by_profiles_id_fk" FOREIGN KEY ("logged_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_materials" ADD CONSTRAINT "project_materials_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_materials" ADD CONSTRAINT "project_materials_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_materials" ADD CONSTRAINT "project_materials_proposal_line_item_id_project_proposal_line_items_id_fk" FOREIGN KEY ("proposal_line_item_id") REFERENCES "public"."project_proposal_line_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_po_line_items" ADD CONSTRAINT "project_po_line_items_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_po_line_items" ADD CONSTRAINT "project_po_line_items_po_id_project_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."project_purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_po_line_items" ADD CONSTRAINT "project_po_line_items_material_id_project_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."project_materials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_purchase_orders" ADD CONSTRAINT "project_purchase_orders_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_purchase_orders" ADD CONSTRAINT "project_purchase_orders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_change_orders" ADD CONSTRAINT "project_change_orders_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_change_orders" ADD CONSTRAINT "project_change_orders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_uploaded_by_profiles_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_inspections" ADD CONSTRAINT "project_inspections_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_inspections" ADD CONSTRAINT "project_inspections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_inspections" ADD CONSTRAINT "project_inspections_phase_id_project_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."project_phases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_permits" ADD CONSTRAINT "project_permits_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_permits" ADD CONSTRAINT "project_permits_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_punch_list" ADD CONSTRAINT "project_punch_list_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_punch_list" ADD CONSTRAINT "project_punch_list_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_punch_list" ADD CONSTRAINT "project_punch_list_assigned_to_profiles_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_warranty_terms" ADD CONSTRAINT "project_warranty_terms_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warranty_claims" ADD CONSTRAINT "warranty_claims_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warranty_claims" ADD CONSTRAINT "warranty_claims_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warranty_claims" ADD CONSTRAINT "warranty_claims_warranty_term_id_project_warranty_terms_id_fk" FOREIGN KEY ("warranty_term_id") REFERENCES "public"."project_warranty_terms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warranty_claims" ADD CONSTRAINT "warranty_claims_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_phase_subcontractors" ADD CONSTRAINT "project_phase_subcontractors_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_phase_subcontractors" ADD CONSTRAINT "project_phase_subcontractors_phase_id_project_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."project_phases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_phase_subcontractors" ADD CONSTRAINT "project_phase_subcontractors_subcontractor_id_subcontractors_id_fk" FOREIGN KEY ("subcontractor_id") REFERENCES "public"."subcontractors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcontractors" ADD CONSTRAINT "subcontractors_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_equipment_assignments" ADD CONSTRAINT "project_equipment_assignments_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_equipment_assignments" ADD CONSTRAINT "project_equipment_assignments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_equipment_assignments" ADD CONSTRAINT "project_equipment_assignments_assigned_by_profiles_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_issue_flags" ADD CONSTRAINT "project_issue_flags_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_issue_flags" ADD CONSTRAINT "project_issue_flags_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_issue_flags" ADD CONSTRAINT "project_issue_flags_phase_id_project_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."project_phases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_issue_flags" ADD CONSTRAINT "project_issue_flags_task_id_project_phase_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_phase_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_issue_flags" ADD CONSTRAINT "project_issue_flags_flagged_by_profiles_id_fk" FOREIGN KEY ("flagged_by") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_issue_flags" ADD CONSTRAINT "project_issue_flags_change_order_id_project_change_orders_id_fk" FOREIGN KEY ("change_order_id") REFERENCES "public"."project_change_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_issue_flags" ADD CONSTRAINT "project_issue_flags_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_photos" ADD CONSTRAINT "project_photos_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_photos" ADD CONSTRAINT "project_photos_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_photos" ADD CONSTRAINT "project_photos_phase_id_project_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."project_phases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_photos" ADD CONSTRAINT "project_photos_task_id_project_phase_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_phase_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_photos" ADD CONSTRAINT "project_photos_taken_by_profiles_id_fk" FOREIGN KEY ("taken_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_time_logs" ADD CONSTRAINT "project_time_logs_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_time_logs" ADD CONSTRAINT "project_time_logs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_time_logs" ADD CONSTRAINT "project_time_logs_phase_id_project_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."project_phases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_time_logs" ADD CONSTRAINT "project_time_logs_task_id_project_phase_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_phase_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_time_logs" ADD CONSTRAINT "project_time_logs_tech_id_profiles_id_fk" FOREIGN KEY ("tech_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_time_logs" ADD CONSTRAINT "project_time_logs_time_entry_id_time_entries_id_fk" FOREIGN KEY ("time_entry_id") REFERENCES "public"."time_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_phase_tasks_phase_id_idx" ON "project_phase_tasks" USING btree ("phase_id");--> statement-breakpoint
CREATE INDEX "project_phases_project_id_idx" ON "project_phases" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_phases_org_id_idx" ON "project_phases" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "project_surveys_project_id_idx" ON "project_surveys" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_templates_org_id_idx" ON "project_templates" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "projects_org_id_idx" ON "projects" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "projects_customer_id_idx" ON "projects" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "projects_stage_idx" ON "projects" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "projects_status_idx" ON "projects" USING btree ("status");--> statement-breakpoint
CREATE INDEX "project_payment_milestones_project_id_idx" ON "project_payment_milestones" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_proposal_addons_proposal_id_idx" ON "project_proposal_addons" USING btree ("proposal_id");--> statement-breakpoint
CREATE INDEX "project_proposal_li_proposal_id_idx" ON "project_proposal_line_items" USING btree ("proposal_id");--> statement-breakpoint
CREATE INDEX "project_proposal_tiers_proposal_id_idx" ON "project_proposal_tiers" USING btree ("proposal_id");--> statement-breakpoint
CREATE INDEX "project_proposals_project_id_idx" ON "project_proposals" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_proposals_org_id_idx" ON "project_proposals" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "proposal_change_requests_proposal_id_idx" ON "proposal_change_requests" USING btree ("proposal_id");--> statement-breakpoint
CREATE INDEX "project_material_receipts_material_id_idx" ON "project_material_receipts" USING btree ("material_id");--> statement-breakpoint
CREATE INDEX "project_material_returns_material_id_idx" ON "project_material_returns" USING btree ("material_id");--> statement-breakpoint
CREATE INDEX "project_material_usage_material_id_idx" ON "project_material_usage" USING btree ("material_id");--> statement-breakpoint
CREATE INDEX "project_material_usage_project_id_idx" ON "project_material_usage" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_materials_project_id_idx" ON "project_materials" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_materials_org_id_idx" ON "project_materials" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "project_po_line_items_po_id_idx" ON "project_po_line_items" USING btree ("po_id");--> statement-breakpoint
CREATE INDEX "project_purchase_orders_project_id_idx" ON "project_purchase_orders" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_change_orders_project_id_idx" ON "project_change_orders" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_documents_project_id_idx" ON "project_documents" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_inspections_project_id_idx" ON "project_inspections" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_permits_project_id_idx" ON "project_permits" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_punch_list_project_id_idx" ON "project_punch_list" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_warranty_terms_org_id_idx" ON "project_warranty_terms" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "warranty_claims_project_id_idx" ON "warranty_claims" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "warranty_claims_org_id_idx" ON "warranty_claims" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "project_phase_subcontractors_phase_id_idx" ON "project_phase_subcontractors" USING btree ("phase_id");--> statement-breakpoint
CREATE INDEX "project_phase_subcontractors_sub_id_idx" ON "project_phase_subcontractors" USING btree ("subcontractor_id");--> statement-breakpoint
CREATE INDEX "subcontractors_org_id_idx" ON "subcontractors" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "project_equipment_assignments_project_id_idx" ON "project_equipment_assignments" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_issue_flags_project_id_idx" ON "project_issue_flags" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_issue_flags_org_id_idx" ON "project_issue_flags" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "project_photos_project_id_idx" ON "project_photos" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_photos_phase_id_idx" ON "project_photos" USING btree ("phase_id");--> statement-breakpoint
CREATE INDEX "project_time_logs_project_id_idx" ON "project_time_logs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_time_logs_tech_id_idx" ON "project_time_logs" USING btree ("tech_id");--> statement-breakpoint
CREATE POLICY "project_phase_tasks_select_policy" ON "project_phase_tasks" AS PERMISSIVE FOR SELECT TO "authenticated" USING (org_id = (select auth.jwt() ->> 'org_id')::uuid);--> statement-breakpoint
CREATE POLICY "project_phase_tasks_insert_policy" ON "project_phase_tasks" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      );--> statement-breakpoint
CREATE POLICY "project_phase_tasks_update_policy" ON "project_phase_tasks" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      );--> statement-breakpoint
CREATE POLICY "project_phase_tasks_delete_policy" ON "project_phase_tasks" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_phases_select_policy" ON "project_phases" AS PERMISSIVE FOR SELECT TO "authenticated" USING (org_id = (select auth.jwt() ->> 'org_id')::uuid);--> statement-breakpoint
CREATE POLICY "project_phases_insert_policy" ON "project_phases" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_phases_update_policy" ON "project_phases" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_phases_delete_policy" ON "project_phases" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_surveys_select_policy" ON "project_surveys" AS PERMISSIVE FOR SELECT TO "authenticated" USING (org_id = (select auth.jwt() ->> 'org_id')::uuid);--> statement-breakpoint
CREATE POLICY "project_surveys_insert_policy" ON "project_surveys" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      );--> statement-breakpoint
CREATE POLICY "project_surveys_update_policy" ON "project_surveys" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_surveys_delete_policy" ON "project_surveys" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_templates_select_policy" ON "project_templates" AS PERMISSIVE FOR SELECT TO "authenticated" USING (org_id = (select auth.jwt() ->> 'org_id')::uuid);--> statement-breakpoint
CREATE POLICY "project_templates_insert_policy" ON "project_templates" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_templates_update_policy" ON "project_templates" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_templates_delete_policy" ON "project_templates" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "projects_select_policy" ON "projects" AS PERMISSIVE FOR SELECT TO "authenticated" USING (org_id = (select auth.jwt() ->> 'org_id')::uuid);--> statement-breakpoint
CREATE POLICY "projects_insert_policy" ON "projects" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "projects_update_policy" ON "projects" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "projects_delete_policy" ON "projects" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );--> statement-breakpoint
CREATE POLICY "project_payment_milestones_select_policy" ON "project_payment_milestones" AS PERMISSIVE FOR SELECT TO "authenticated" USING (org_id = (select auth.jwt() ->> 'org_id')::uuid);--> statement-breakpoint
CREATE POLICY "project_payment_milestones_insert_policy" ON "project_payment_milestones" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_payment_milestones_update_policy" ON "project_payment_milestones" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_payment_milestones_delete_policy" ON "project_payment_milestones" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_proposal_addons_select_policy" ON "project_proposal_addons" AS PERMISSIVE FOR SELECT TO "authenticated" USING (org_id = (select auth.jwt() ->> 'org_id')::uuid);--> statement-breakpoint
CREATE POLICY "project_proposal_addons_insert_policy" ON "project_proposal_addons" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_proposal_addons_update_policy" ON "project_proposal_addons" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_proposal_addons_delete_policy" ON "project_proposal_addons" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_proposal_li_select_policy" ON "project_proposal_line_items" AS PERMISSIVE FOR SELECT TO "authenticated" USING (org_id = (select auth.jwt() ->> 'org_id')::uuid);--> statement-breakpoint
CREATE POLICY "project_proposal_li_insert_policy" ON "project_proposal_line_items" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_proposal_li_update_policy" ON "project_proposal_line_items" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_proposal_li_delete_policy" ON "project_proposal_line_items" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_proposal_tiers_select_policy" ON "project_proposal_tiers" AS PERMISSIVE FOR SELECT TO "authenticated" USING (org_id = (select auth.jwt() ->> 'org_id')::uuid);--> statement-breakpoint
CREATE POLICY "project_proposal_tiers_insert_policy" ON "project_proposal_tiers" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_proposal_tiers_update_policy" ON "project_proposal_tiers" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_proposal_tiers_delete_policy" ON "project_proposal_tiers" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_proposals_select_policy" ON "project_proposals" AS PERMISSIVE FOR SELECT TO "authenticated" USING (org_id = (select auth.jwt() ->> 'org_id')::uuid);--> statement-breakpoint
CREATE POLICY "project_proposals_insert_policy" ON "project_proposals" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_proposals_update_policy" ON "project_proposals" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_proposals_delete_policy" ON "project_proposals" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );--> statement-breakpoint
CREATE POLICY "proposal_change_requests_select_policy" ON "proposal_change_requests" AS PERMISSIVE FOR SELECT TO "authenticated" USING (org_id = (select auth.jwt() ->> 'org_id')::uuid);--> statement-breakpoint
CREATE POLICY "proposal_change_requests_insert_policy" ON "proposal_change_requests" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "proposal_change_requests_update_policy" ON "proposal_change_requests" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "proposal_change_requests_delete_policy" ON "proposal_change_requests" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_material_receipts_select_policy" ON "project_material_receipts" AS PERMISSIVE FOR SELECT TO "authenticated" USING (org_id = (select auth.jwt() ->> 'org_id')::uuid);--> statement-breakpoint
CREATE POLICY "project_material_receipts_insert_policy" ON "project_material_receipts" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      );--> statement-breakpoint
CREATE POLICY "project_material_receipts_update_policy" ON "project_material_receipts" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_material_receipts_delete_policy" ON "project_material_receipts" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_material_returns_select_policy" ON "project_material_returns" AS PERMISSIVE FOR SELECT TO "authenticated" USING (org_id = (select auth.jwt() ->> 'org_id')::uuid);--> statement-breakpoint
CREATE POLICY "project_material_returns_insert_policy" ON "project_material_returns" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      );--> statement-breakpoint
CREATE POLICY "project_material_returns_update_policy" ON "project_material_returns" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_material_returns_delete_policy" ON "project_material_returns" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_material_usage_select_policy" ON "project_material_usage" AS PERMISSIVE FOR SELECT TO "authenticated" USING (org_id = (select auth.jwt() ->> 'org_id')::uuid);--> statement-breakpoint
CREATE POLICY "project_material_usage_insert_policy" ON "project_material_usage" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      );--> statement-breakpoint
CREATE POLICY "project_material_usage_update_policy" ON "project_material_usage" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_material_usage_delete_policy" ON "project_material_usage" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_materials_select_policy" ON "project_materials" AS PERMISSIVE FOR SELECT TO "authenticated" USING (org_id = (select auth.jwt() ->> 'org_id')::uuid);--> statement-breakpoint
CREATE POLICY "project_materials_insert_policy" ON "project_materials" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_materials_update_policy" ON "project_materials" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_materials_delete_policy" ON "project_materials" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_po_line_items_select_policy" ON "project_po_line_items" AS PERMISSIVE FOR SELECT TO "authenticated" USING (org_id = (select auth.jwt() ->> 'org_id')::uuid);--> statement-breakpoint
CREATE POLICY "project_po_line_items_insert_policy" ON "project_po_line_items" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_po_line_items_update_policy" ON "project_po_line_items" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_po_line_items_delete_policy" ON "project_po_line_items" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_purchase_orders_select_policy" ON "project_purchase_orders" AS PERMISSIVE FOR SELECT TO "authenticated" USING (org_id = (select auth.jwt() ->> 'org_id')::uuid);--> statement-breakpoint
CREATE POLICY "project_purchase_orders_insert_policy" ON "project_purchase_orders" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_purchase_orders_update_policy" ON "project_purchase_orders" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_purchase_orders_delete_policy" ON "project_purchase_orders" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_change_orders_select_policy" ON "project_change_orders" AS PERMISSIVE FOR SELECT TO "authenticated" USING (org_id = (select auth.jwt() ->> 'org_id')::uuid);--> statement-breakpoint
CREATE POLICY "project_change_orders_insert_policy" ON "project_change_orders" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_change_orders_update_policy" ON "project_change_orders" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_change_orders_delete_policy" ON "project_change_orders" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );--> statement-breakpoint
CREATE POLICY "project_documents_select_policy" ON "project_documents" AS PERMISSIVE FOR SELECT TO "authenticated" USING (org_id = (select auth.jwt() ->> 'org_id')::uuid);--> statement-breakpoint
CREATE POLICY "project_documents_insert_policy" ON "project_documents" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      );--> statement-breakpoint
CREATE POLICY "project_documents_update_policy" ON "project_documents" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_documents_delete_policy" ON "project_documents" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_inspections_select_policy" ON "project_inspections" AS PERMISSIVE FOR SELECT TO "authenticated" USING (org_id = (select auth.jwt() ->> 'org_id')::uuid);--> statement-breakpoint
CREATE POLICY "project_inspections_insert_policy" ON "project_inspections" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_inspections_update_policy" ON "project_inspections" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_inspections_delete_policy" ON "project_inspections" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );--> statement-breakpoint
CREATE POLICY "project_permits_select_policy" ON "project_permits" AS PERMISSIVE FOR SELECT TO "authenticated" USING (org_id = (select auth.jwt() ->> 'org_id')::uuid);--> statement-breakpoint
CREATE POLICY "project_permits_insert_policy" ON "project_permits" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_permits_update_policy" ON "project_permits" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_permits_delete_policy" ON "project_permits" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );--> statement-breakpoint
CREATE POLICY "project_punch_list_select_policy" ON "project_punch_list" AS PERMISSIVE FOR SELECT TO "authenticated" USING (org_id = (select auth.jwt() ->> 'org_id')::uuid);--> statement-breakpoint
CREATE POLICY "project_punch_list_insert_policy" ON "project_punch_list" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_punch_list_update_policy" ON "project_punch_list" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      );--> statement-breakpoint
CREATE POLICY "project_punch_list_delete_policy" ON "project_punch_list" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_warranty_terms_select_policy" ON "project_warranty_terms" AS PERMISSIVE FOR SELECT TO "authenticated" USING (org_id = (select auth.jwt() ->> 'org_id')::uuid);--> statement-breakpoint
CREATE POLICY "project_warranty_terms_insert_policy" ON "project_warranty_terms" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_warranty_terms_update_policy" ON "project_warranty_terms" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_warranty_terms_delete_policy" ON "project_warranty_terms" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "warranty_claims_select_policy" ON "warranty_claims" AS PERMISSIVE FOR SELECT TO "authenticated" USING (org_id = (select auth.jwt() ->> 'org_id')::uuid);--> statement-breakpoint
CREATE POLICY "warranty_claims_insert_policy" ON "warranty_claims" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "warranty_claims_update_policy" ON "warranty_claims" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "warranty_claims_delete_policy" ON "warranty_claims" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') = 'owner'
      );--> statement-breakpoint
CREATE POLICY "project_phase_subcontractors_select_policy" ON "project_phase_subcontractors" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_phase_subcontractors_insert_policy" ON "project_phase_subcontractors" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_phase_subcontractors_update_policy" ON "project_phase_subcontractors" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_phase_subcontractors_delete_policy" ON "project_phase_subcontractors" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "subcontractors_select_policy" ON "subcontractors" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "subcontractors_insert_policy" ON "subcontractors" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "subcontractors_update_policy" ON "subcontractors" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "subcontractors_delete_policy" ON "subcontractors" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_equipment_assignments_select_policy" ON "project_equipment_assignments" AS PERMISSIVE FOR SELECT TO "authenticated" USING (org_id = (select auth.jwt() ->> 'org_id')::uuid);--> statement-breakpoint
CREATE POLICY "project_equipment_assignments_insert_policy" ON "project_equipment_assignments" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_equipment_assignments_update_policy" ON "project_equipment_assignments" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_equipment_assignments_delete_policy" ON "project_equipment_assignments" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_issue_flags_select_policy" ON "project_issue_flags" AS PERMISSIVE FOR SELECT TO "authenticated" USING (org_id = (select auth.jwt() ->> 'org_id')::uuid);--> statement-breakpoint
CREATE POLICY "project_issue_flags_insert_policy" ON "project_issue_flags" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      );--> statement-breakpoint
CREATE POLICY "project_issue_flags_update_policy" ON "project_issue_flags" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_issue_flags_delete_policy" ON "project_issue_flags" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_photos_select_policy" ON "project_photos" AS PERMISSIVE FOR SELECT TO "authenticated" USING (org_id = (select auth.jwt() ->> 'org_id')::uuid);--> statement-breakpoint
CREATE POLICY "project_photos_insert_policy" ON "project_photos" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      );--> statement-breakpoint
CREATE POLICY "project_photos_update_policy" ON "project_photos" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_photos_delete_policy" ON "project_photos" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );--> statement-breakpoint
CREATE POLICY "project_time_logs_select_policy" ON "project_time_logs" AS PERMISSIVE FOR SELECT TO "authenticated" USING (org_id = (select auth.jwt() ->> 'org_id')::uuid);--> statement-breakpoint
CREATE POLICY "project_time_logs_insert_policy" ON "project_time_logs" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      );--> statement-breakpoint
CREATE POLICY "project_time_logs_update_policy" ON "project_time_logs" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      );--> statement-breakpoint
CREATE POLICY "project_time_logs_delete_policy" ON "project_time_logs" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );