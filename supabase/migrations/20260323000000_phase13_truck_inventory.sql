CREATE TABLE "truck_inventory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"tech_id" uuid NOT NULL,
	"catalog_item_id" uuid,
	"chemical_product_id" uuid,
	"item_name" text NOT NULL,
	"category" text DEFAULT 'other' NOT NULL,
	"quantity" numeric(10, 3) DEFAULT '0' NOT NULL,
	"unit" text NOT NULL,
	"min_threshold" numeric(10, 3) DEFAULT '0' NOT NULL,
	"on_truck" boolean DEFAULT true NOT NULL,
	"barcode" text,
	"reorder_alert_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "truck_inventory" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "truck_inventory_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"truck_inventory_item_id" uuid NOT NULL,
	"tech_id" uuid NOT NULL,
	"change_type" text NOT NULL,
	"quantity_before" numeric(10, 3) NOT NULL,
	"quantity_change" numeric(10, 3) NOT NULL,
	"quantity_after" numeric(10, 3) NOT NULL,
	"source_type" text,
	"source_id" uuid,
	"transfer_to_tech_id" uuid,
	"transfer_from_tech_id" uuid,
	"transfer_confirmed_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "truck_inventory_log" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "truck_load_template_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"catalog_item_id" uuid,
	"chemical_product_id" uuid,
	"item_name" text NOT NULL,
	"category" text NOT NULL,
	"default_quantity" numeric(10, 3) NOT NULL,
	"unit" text NOT NULL,
	"min_threshold" numeric(10, 3) DEFAULT '0' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "truck_load_template_items" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "truck_load_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"target_role" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "truck_load_templates" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "po_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"po_id" uuid NOT NULL,
	"shopping_list_item_id" uuid,
	"item_name" text NOT NULL,
	"quantity" numeric(10, 3) DEFAULT '1' NOT NULL,
	"unit" text DEFAULT 'each' NOT NULL,
	"unit_price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "po_line_items" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"po_number" text,
	"supplier_name" text NOT NULL,
	"supplier_contact" text,
	"supplier_email" text,
	"mode" text DEFAULT 'checklist' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"total_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"sent_at" timestamp with time zone,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "purchase_orders" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "shopping_list_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"tech_id" uuid,
	"catalog_item_id" uuid,
	"chemical_product_id" uuid,
	"item_name" text NOT NULL,
	"category" text NOT NULL,
	"quantity_needed" numeric(10, 3) NOT NULL,
	"unit" text NOT NULL,
	"source_type" text,
	"source_work_order_id" uuid,
	"source_project_id" uuid,
	"source_inventory_item_id" uuid,
	"status" text DEFAULT 'needed' NOT NULL,
	"ordered_at" timestamp with time zone,
	"ordered_by_id" uuid,
	"vendor" text,
	"po_reference" text,
	"received_at" timestamp with time zone,
	"received_by_id" uuid,
	"loaded_at" timestamp with time zone,
	"loaded_by_id" uuid,
	"used_at" timestamp with time zone,
	"used_by_id" uuid,
	"is_urgent" boolean DEFAULT false NOT NULL,
	"urgent_reason" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "shopping_list_items" ENABLE ROW LEVEL SECURITY;
CREATE TABLE "barcode_catalog_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"barcode" text NOT NULL,
	"catalog_item_id" uuid,
	"chemical_product_id" uuid,
	"item_name" text NOT NULL,
	"upc_lookup_ran_at" timestamp with time zone,
	"upc_lookup_succeeded" boolean,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "barcode_catalog_links_org_barcode_unique" UNIQUE("org_id","barcode")
);

ALTER TABLE "barcode_catalog_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "org_settings" ADD COLUMN "next_po_number" integer DEFAULT 1 NOT NULL;
ALTER TABLE "parts_catalog" ADD COLUMN "qbo_item_id" text;
ALTER TABLE "truck_inventory" ADD CONSTRAINT "truck_inventory_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "truck_inventory" ADD CONSTRAINT "truck_inventory_tech_id_profiles_id_fk" FOREIGN KEY ("tech_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "truck_inventory" ADD CONSTRAINT "truck_inventory_catalog_item_id_parts_catalog_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."parts_catalog"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "truck_inventory" ADD CONSTRAINT "truck_inventory_chemical_product_id_chemical_products_id_fk" FOREIGN KEY ("chemical_product_id") REFERENCES "public"."chemical_products"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "truck_inventory_log" ADD CONSTRAINT "truck_inventory_log_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "truck_inventory_log" ADD CONSTRAINT "truck_inventory_log_truck_inventory_item_id_truck_inventory_id_fk" FOREIGN KEY ("truck_inventory_item_id") REFERENCES "public"."truck_inventory"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "truck_inventory_log" ADD CONSTRAINT "truck_inventory_log_tech_id_profiles_id_fk" FOREIGN KEY ("tech_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "truck_inventory_log" ADD CONSTRAINT "truck_inventory_log_transfer_to_tech_id_profiles_id_fk" FOREIGN KEY ("transfer_to_tech_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "truck_inventory_log" ADD CONSTRAINT "truck_inventory_log_transfer_from_tech_id_profiles_id_fk" FOREIGN KEY ("transfer_from_tech_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "truck_load_template_items" ADD CONSTRAINT "truck_load_template_items_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "truck_load_template_items" ADD CONSTRAINT "truck_load_template_items_template_id_truck_load_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."truck_load_templates"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "truck_load_template_items" ADD CONSTRAINT "truck_load_template_items_catalog_item_id_parts_catalog_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."parts_catalog"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "truck_load_template_items" ADD CONSTRAINT "truck_load_template_items_chemical_product_id_chemical_products_id_fk" FOREIGN KEY ("chemical_product_id") REFERENCES "public"."chemical_products"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "truck_load_templates" ADD CONSTRAINT "truck_load_templates_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "po_line_items" ADD CONSTRAINT "po_line_items_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "po_line_items" ADD CONSTRAINT "po_line_items_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "po_line_items" ADD CONSTRAINT "po_line_items_shopping_list_item_id_shopping_list_items_id_fk" FOREIGN KEY ("shopping_list_item_id") REFERENCES "public"."shopping_list_items"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_id_profiles_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_tech_id_profiles_id_fk" FOREIGN KEY ("tech_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_catalog_item_id_parts_catalog_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."parts_catalog"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_chemical_product_id_chemical_products_id_fk" FOREIGN KEY ("chemical_product_id") REFERENCES "public"."chemical_products"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_source_work_order_id_work_orders_id_fk" FOREIGN KEY ("source_work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_source_inventory_item_id_truck_inventory_id_fk" FOREIGN KEY ("source_inventory_item_id") REFERENCES "public"."truck_inventory"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_ordered_by_id_profiles_id_fk" FOREIGN KEY ("ordered_by_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_received_by_id_profiles_id_fk" FOREIGN KEY ("received_by_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_loaded_by_id_profiles_id_fk" FOREIGN KEY ("loaded_by_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_used_by_id_profiles_id_fk" FOREIGN KEY ("used_by_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "barcode_catalog_links" ADD CONSTRAINT "barcode_catalog_links_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "barcode_catalog_links" ADD CONSTRAINT "barcode_catalog_links_catalog_item_id_parts_catalog_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."parts_catalog"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "barcode_catalog_links" ADD CONSTRAINT "barcode_catalog_links_chemical_product_id_chemical_products_id_fk" FOREIGN KEY ("chemical_product_id") REFERENCES "public"."chemical_products"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "barcode_catalog_links" ADD CONSTRAINT "barcode_catalog_links_created_by_id_profiles_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
CREATE INDEX "truck_inventory_org_tech_idx" ON "truck_inventory" USING btree ("org_id","tech_id");
CREATE INDEX "truck_inventory_chemical_product_idx" ON "truck_inventory" USING btree ("chemical_product_id");
CREATE INDEX "truck_inventory_log_item_idx" ON "truck_inventory_log" USING btree ("truck_inventory_item_id");
CREATE INDEX "truck_inventory_log_tech_idx" ON "truck_inventory_log" USING btree ("tech_id");
CREATE INDEX "truck_load_template_items_template_idx" ON "truck_load_template_items" USING btree ("template_id");
CREATE INDEX "truck_load_templates_org_idx" ON "truck_load_templates" USING btree ("org_id");
CREATE INDEX "po_line_items_po_idx" ON "po_line_items" USING btree ("po_id");
CREATE INDEX "purchase_orders_org_idx" ON "purchase_orders" USING btree ("org_id");
CREATE INDEX "purchase_orders_status_idx" ON "purchase_orders" USING btree ("status");
CREATE INDEX "shopping_list_items_org_idx" ON "shopping_list_items" USING btree ("org_id");
CREATE INDEX "shopping_list_items_tech_idx" ON "shopping_list_items" USING btree ("tech_id");
CREATE INDEX "shopping_list_items_status_idx" ON "shopping_list_items" USING btree ("status");
CREATE POLICY "truck_inventory_select_policy" ON "truck_inventory" AS PERMISSIVE FOR SELECT TO "authenticated" USING (org_id = (select auth.jwt() ->> 'org_id')::uuid);
CREATE POLICY "truck_inventory_insert_policy" ON "truck_inventory" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      );
CREATE POLICY "truck_inventory_update_policy" ON "truck_inventory" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      );
CREATE POLICY "truck_inventory_delete_policy" ON "truck_inventory" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );
CREATE POLICY "truck_inventory_log_select_policy" ON "truck_inventory_log" AS PERMISSIVE FOR SELECT TO "authenticated" USING (org_id = (select auth.jwt() ->> 'org_id')::uuid);
CREATE POLICY "truck_inventory_log_insert_policy" ON "truck_inventory_log" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      );
CREATE POLICY "truck_load_template_items_select_policy" ON "truck_load_template_items" AS PERMISSIVE FOR SELECT TO "authenticated" USING (org_id = (select auth.jwt() ->> 'org_id')::uuid);
CREATE POLICY "truck_load_template_items_insert_policy" ON "truck_load_template_items" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );
CREATE POLICY "truck_load_template_items_update_policy" ON "truck_load_template_items" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );
CREATE POLICY "truck_load_template_items_delete_policy" ON "truck_load_template_items" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );
CREATE POLICY "truck_load_templates_select_policy" ON "truck_load_templates" AS PERMISSIVE FOR SELECT TO "authenticated" USING (org_id = (select auth.jwt() ->> 'org_id')::uuid);
CREATE POLICY "truck_load_templates_insert_policy" ON "truck_load_templates" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );
CREATE POLICY "truck_load_templates_update_policy" ON "truck_load_templates" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );
CREATE POLICY "truck_load_templates_delete_policy" ON "truck_load_templates" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );
CREATE POLICY "po_line_items_select_policy" ON "po_line_items" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );
CREATE POLICY "po_line_items_insert_policy" ON "po_line_items" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );
CREATE POLICY "po_line_items_update_policy" ON "po_line_items" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );
CREATE POLICY "po_line_items_delete_policy" ON "po_line_items" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );
CREATE POLICY "purchase_orders_select_policy" ON "purchase_orders" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );
CREATE POLICY "purchase_orders_insert_policy" ON "purchase_orders" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );
CREATE POLICY "purchase_orders_update_policy" ON "purchase_orders" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );
CREATE POLICY "purchase_orders_delete_policy" ON "purchase_orders" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );
CREATE POLICY "shopping_list_items_select_policy" ON "shopping_list_items" AS PERMISSIVE FOR SELECT TO "authenticated" USING (org_id = (select auth.jwt() ->> 'org_id')::uuid);
CREATE POLICY "shopping_list_items_insert_policy" ON "shopping_list_items" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      );
CREATE POLICY "shopping_list_items_update_policy" ON "shopping_list_items" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      );
CREATE POLICY "shopping_list_items_delete_policy" ON "shopping_list_items" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      );
CREATE POLICY "barcode_catalog_links_select_policy" ON "barcode_catalog_links" AS PERMISSIVE FOR SELECT TO "authenticated" USING (org_id = (select auth.jwt() ->> 'org_id')::uuid);
CREATE POLICY "barcode_catalog_links_insert_policy" ON "barcode_catalog_links" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      );
CREATE POLICY "barcode_catalog_links_update_policy" ON "barcode_catalog_links" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      ) WITH CHECK (
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      );