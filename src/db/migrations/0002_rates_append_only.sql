CREATE OR REPLACE FUNCTION forbid_rate_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS rate_materials_append_only ON rate_materials;
--> statement-breakpoint
CREATE TRIGGER rate_materials_append_only
BEFORE UPDATE OR DELETE ON rate_materials
FOR EACH ROW EXECUTE FUNCTION forbid_rate_change();
--> statement-breakpoint
DROP TRIGGER IF EXISTS rate_machines_append_only ON rate_machines;
--> statement-breakpoint
CREATE TRIGGER rate_machines_append_only
BEFORE UPDATE OR DELETE ON rate_machines
FOR EACH ROW EXECUTE FUNCTION forbid_rate_change();
--> statement-breakpoint
DROP TRIGGER IF EXISTS rate_params_append_only ON rate_params;
--> statement-breakpoint
CREATE TRIGGER rate_params_append_only
BEFORE UPDATE OR DELETE ON rate_params
FOR EACH ROW EXECUTE FUNCTION forbid_rate_change();
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS rate_materials_grade_ci ON rate_materials (upper(grade), effective_from);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS rate_machines_code_ci ON rate_machines (upper(machine_code), effective_from);
