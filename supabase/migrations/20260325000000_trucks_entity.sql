-- Migration: Add trucks entity for shared truck inventory
-- Allows multiple techs to share the same truck and inventory pool.
-- Does NOT modify existing truck_inventory table — uses junction table approach.

-- 1. Create trucks table
CREATE TABLE IF NOT EXISTS trucks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trucks_org_idx ON trucks(org_id);

ALTER TABLE trucks ENABLE ROW LEVEL SECURITY;

CREATE POLICY trucks_select_policy ON trucks
  FOR SELECT TO authenticated
  USING (org_id = (select auth.jwt() ->> 'org_id')::uuid);

CREATE POLICY trucks_insert_policy ON trucks
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = (select auth.jwt() ->> 'org_id')::uuid
    AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
  );

CREATE POLICY trucks_update_policy ON trucks
  FOR UPDATE TO authenticated
  USING (
    org_id = (select auth.jwt() ->> 'org_id')::uuid
    AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
  )
  WITH CHECK (
    org_id = (select auth.jwt() ->> 'org_id')::uuid
    AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
  );

CREATE POLICY trucks_delete_policy ON trucks
  FOR DELETE TO authenticated
  USING (
    org_id = (select auth.jwt() ->> 'org_id')::uuid
    AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
  );

-- 2. Create tech_truck_assignments junction table
CREATE TABLE IF NOT EXISTS tech_truck_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  tech_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  truck_id UUID NOT NULL REFERENCES trucks(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Each tech can only be assigned to one truck
  UNIQUE(org_id, tech_id)
);

CREATE INDEX IF NOT EXISTS tech_truck_assignments_org_tech_idx ON tech_truck_assignments(org_id, tech_id);
CREATE INDEX IF NOT EXISTS tech_truck_assignments_truck_idx ON tech_truck_assignments(truck_id);

ALTER TABLE tech_truck_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY tech_truck_select_policy ON tech_truck_assignments
  FOR SELECT TO authenticated
  USING (org_id = (select auth.jwt() ->> 'org_id')::uuid);

CREATE POLICY tech_truck_insert_policy ON tech_truck_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = (select auth.jwt() ->> 'org_id')::uuid
    AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
  );

CREATE POLICY tech_truck_update_policy ON tech_truck_assignments
  FOR UPDATE TO authenticated
  USING (
    org_id = (select auth.jwt() ->> 'org_id')::uuid
    AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
  )
  WITH CHECK (
    org_id = (select auth.jwt() ->> 'org_id')::uuid
    AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
  );

CREATE POLICY tech_truck_delete_policy ON tech_truck_assignments
  FOR DELETE TO authenticated
  USING (
    org_id = (select auth.jwt() ->> 'org_id')::uuid
    AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
  );
