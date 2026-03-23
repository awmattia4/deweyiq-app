/**
 * Phase 13: Truck Inventory & Shopping Lists — Barcode Catalog Schema
 *
 * Table: barcode_catalog_links
 *
 * Maps scanned barcodes to catalog items (parts_catalog or chemical_products).
 * Org-wide: once any tech scans and registers a barcode, all techs in the org
 * can recognize it. UPC lookup results are cached to avoid repeated API calls.
 *
 * RLS:
 * - SELECT: all org members
 * - INSERT/UPDATE: owner+office+tech
 */
import {
  boolean,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"
import { pgPolicy } from "drizzle-orm/pg-core"
import { authenticatedRole } from "drizzle-orm/supabase"
import { sql } from "drizzle-orm"
import { orgs } from "./orgs"
import { partsCatalog } from "./parts-catalog"
import { chemicalProducts } from "./chemical-products"
import { profiles } from "./profiles"

// ---------------------------------------------------------------------------
// barcode_catalog_links
// ---------------------------------------------------------------------------

export const barcodeCatalogLinks = pgTable(
  "barcode_catalog_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    barcode: text("barcode").notNull(),
    // At most one of these will be set — either links to a catalog item or a chemical product
    catalog_item_id: uuid("catalog_item_id").references(() => partsCatalog.id, {
      onDelete: "set null",
    }),
    chemical_product_id: uuid("chemical_product_id").references(
      () => chemicalProducts.id,
      { onDelete: "set null" }
    ),
    // Display name — copied from catalog or filled by UPC lookup
    item_name: text("item_name").notNull(),
    // UPC lookup metadata
    upc_lookup_ran_at: timestamp("upc_lookup_ran_at", { withTimezone: true }),
    upc_lookup_succeeded: boolean("upc_lookup_succeeded"),
    created_by_id: uuid("created_by_id").references(() => profiles.id, {
      onDelete: "set null",
    }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // One barcode per org — deduplicates scan registrations
    unique("barcode_catalog_links_org_barcode_unique").on(table.org_id, table.barcode),

    // RLS: all org members can look up barcodes
    pgPolicy("barcode_catalog_links_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    // RLS: owner+office+tech can register barcodes
    pgPolicy("barcode_catalog_links_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      `,
    }),
    pgPolicy("barcode_catalog_links_update_policy", {
      for: "update",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      `,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office', 'tech')
      `,
    }),
  ]
).enableRLS()
