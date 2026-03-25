-- Make tech_id nullable on truck_inventory to support warehouse (tech_id IS NULL = warehouse)
ALTER TABLE truck_inventory ALTER COLUMN tech_id DROP NOT NULL;

-- Index for warehouse queries
CREATE INDEX IF NOT EXISTS truck_inventory_warehouse_idx 
  ON truck_inventory (org_id) 
  WHERE tech_id IS NULL;
