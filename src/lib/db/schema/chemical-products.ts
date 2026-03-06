import { boolean, index, pgTable, real, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { pgPolicy } from "drizzle-orm/pg-core"
import { authenticatedRole } from "drizzle-orm/supabase"
import { sql } from "drizzle-orm"
import { orgs } from "./orgs"

/**
 * Chemical products — office-configured product catalog for dosing calculations.
 *
 * Each product maps to a dosing engine key via `chemical_type`:
 * - "chlorine" — liquid chlorine (sodium hypochlorite)
 * - "shock" — calcium hypochlorite / granular shock
 * - "acid" — muriatic acid / pH down
 * - "soda_ash" — pH up / sodium carbonate
 * - "baking_soda" — alkalinity up / sodium bicarbonate
 * - "calcium" — calcium hardness increaser
 * - "cya" — cyanuric acid / stabilizer
 * - "algaecide" — algae prevention / treatment
 * - "salt" — sodium chloride for salt systems
 *
 * `concentration_pct` is required for acids and liquid chlorine (dosing depends on strength).
 * `unit` determines dosing output: "floz" | "lbs"
 *
 * RLS: all org members can view products; only owner+office can manage the catalog.
 */
export const chemicalProducts = pgTable(
  "chemical_products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    org_id: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    // Display name, e.g., "31.45% Muriatic Acid" or "10% Liquid Chlorine"
    name: text("name").notNull(),
    // Maps to dosing engine key: "chlorine" | "shock" | "acid" | "soda_ash" | "baking_soda" | "calcium" | "cya" | "algaecide" | "salt"
    chemical_type: text("chemical_type").notNull(),
    // Percentage concentration (0-100); null for solid products where concentration isn't a variable
    concentration_pct: real("concentration_pct"),
    // Dosing unit: "floz" (fluid ounces) | "lbs" (pounds/weight)
    unit: text("unit").notNull(),
    // Soft-disable retired products without deleting historical references
    is_active: boolean("is_active").notNull().default(true),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("chemical_products_org_id_idx").on(table.org_id),
    index("chemical_products_chemical_type_idx").on(table.chemical_type),

    // RLS: all org members can view the product catalog
    pgPolicy("chemical_products_select_policy", {
      for: "select",
      to: authenticatedRole,
      using: sql`org_id = (select auth.jwt() ->> 'org_id')::uuid`,
    }),
    // RLS: only owner+office can create products
    pgPolicy("chemical_products_insert_policy", {
      for: "insert",
      to: authenticatedRole,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    // RLS: only owner+office can update products
    pgPolicy("chemical_products_update_policy", {
      for: "update",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
      withCheck: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
    // RLS: only owner+office can delete products
    pgPolicy("chemical_products_delete_policy", {
      for: "delete",
      to: authenticatedRole,
      using: sql`
        org_id = (select auth.jwt() ->> 'org_id')::uuid
        AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
      `,
    }),
  ]
).enableRLS()
