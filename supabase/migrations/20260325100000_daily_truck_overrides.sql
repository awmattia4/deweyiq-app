-- Migration: Add daily_truck_overrides for per-day truck reassignment
-- Allows office to override a tech's truck assignment for a specific day
-- (e.g. Mike rides solo today instead of sharing Truck 1)

CREATE TABLE IF NOT EXISTS daily_truck_overrides (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  tech_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  truck_id UUID REFERENCES trucks(id) ON DELETE CASCADE, -- NULL = solo for this day
  override_date TEXT NOT NULL, -- YYYY-MM-DD
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, tech_id, override_date)
);

CREATE INDEX IF NOT EXISTS daily_truck_overrides_lookup_idx
  ON daily_truck_overrides(org_id, tech_id, override_date);

ALTER TABLE daily_truck_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY daily_truck_overrides_select_policy ON daily_truck_overrides
  FOR SELECT TO authenticated
  USING (org_id = (select auth.jwt() ->> 'org_id')::uuid);

CREATE POLICY daily_truck_overrides_insert_policy ON daily_truck_overrides
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = (select auth.jwt() ->> 'org_id')::uuid
    AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
  );

CREATE POLICY daily_truck_overrides_update_policy ON daily_truck_overrides
  FOR UPDATE TO authenticated
  USING (
    org_id = (select auth.jwt() ->> 'org_id')::uuid
    AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
  )
  WITH CHECK (
    org_id = (select auth.jwt() ->> 'org_id')::uuid
    AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
  );

CREATE POLICY daily_truck_overrides_delete_policy ON daily_truck_overrides
  FOR DELETE TO authenticated
  USING (
    org_id = (select auth.jwt() ->> 'org_id')::uuid
    AND (select auth.jwt() ->> 'user_role') IN ('owner', 'office')
  );
