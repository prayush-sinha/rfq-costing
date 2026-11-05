CREATE FUNCTION forbid_snapshot_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'quote_snapshots are immutable';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER quote_snapshots_immutable
BEFORE UPDATE OR DELETE ON quote_snapshots
FOR EACH ROW EXECUTE FUNCTION forbid_snapshot_change();
