import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "./test-pool";

afterAll(() => pool.end());

const fails = (sql: string, params: unknown[], re: RegExp) =>
  expect(pool.query(sql, params)).rejects.toThrow(re);

describe("schema constraints", () => {
  let rfqId: number;
  let userId: number;
  let partId: number;
  let quoteId: number;

  beforeAll(async () => {
    await pool.query(
      "truncate users, customers, rate_materials, rate_params, past_quotes restart identity cascade");
    const u = await pool.query(
      "insert into users(email,password_hash,role) values('t@x.test','h','estimator') returning id");
    userId = u.rows[0].id;
    const c = await pool.query("insert into customers(name) values('Company B') returning id");
    const r = await pool.query(
      "insert into rfqs(rfq_no,customer_id,due_date,owner_id) values('RFQ-T-1',$1,'2026-12-01',$2) returning id",
      [c.rows[0].id, userId]);
    rfqId = r.rows[0].id;
    const p = await pool.query(
      "insert into parts(rfq_id,name,material,gross_wt_kg,annual_volume) values($1,'Spindle','EN8',0.61,180000) returning id",
      [rfqId]);
    partId = p.rows[0].id;
    const q = await pool.query(
      "insert into quotes(rfq_id,as_of_date) values($1,'2026-11-04') returning id", [rfqId]);
    quoteId = q.rows[0].id;
  });

  describe("parts", () => {
    it("rejects non-positive gross weight", () =>
      fails("insert into parts(rfq_id,name,material,gross_wt_kg,annual_volume) values($1,'p','EN8',0,100)", [rfqId], /parts_gross_wt_pos/));
    it("rejects scrap_pct above 0.5", () =>
      fails("insert into parts(rfq_id,name,material,gross_wt_kg,scrap_pct,annual_volume) values($1,'p','EN8',1,0.6,100)", [rfqId], /parts_scrap_pct_range/));
    it("rejects zero tooling years", () =>
      fails("insert into parts(rfq_id,name,material,gross_wt_kg,annual_volume,tooling_years) values($1,'p','EN8',1,100,0)", [rfqId], /parts_tooling_years_pos/));
  });

  describe("rfqs", () => {
    it("requires a lost_reason when status is lost", () =>
      fails("update rfqs set status='lost', lost_reason=null where id=$1", [rfqId], /rfqs_lost_reason_required/));
    it("rejects a blank lost_reason", () =>
      fails("update rfqs set status='lost', lost_reason='   ' where id=$1", [rfqId], /rfqs_lost_reason_required/));
    it("rejects a duplicate rfq_no", () =>
      fails("insert into rfqs(rfq_no,customer_id,due_date,owner_id) select 'RFQ-T-1',customer_id,due_date,owner_id from rfqs where id=$1", [rfqId], /unique/i));
  });

  describe("rates", () => {
    it("rejects two rates for the same grade and date", async () => {
      await pool.query("insert into rate_materials(grade,rate_per_kg,scrap_rate_per_kg,effective_from) values('EN8',68,24,'2026-01-01')");
      await fails("insert into rate_materials(grade,rate_per_kg,scrap_rate_per_kg,effective_from) values('EN8',70,24,'2026-01-01')", [], /unique/i);
    });
    it("rejects a non-positive material rate", () =>
      fails("insert into rate_materials(grade,rate_per_kg,scrap_rate_per_kg,effective_from) values('X',0,0,'2026-01-01')", [], /rate_materials_rate_pos/));
    it("rejects an unknown parameter key", () =>
      fails("insert into rate_params(key,value,effective_from) values('mystery',1,'2026-01-01')", [], /rate_params_key_valid/));
    it("rejects a default margin of 100%", () =>
      fails("insert into rate_params(key,value,effective_from) values('default_margin_pct',1,'2026-01-01')", [], /rate_params_margin_below_one/));
  });

  describe("routing and tiers", () => {
    it("rejects a duplicate operation sequence on a part", async () => {
      await pool.query("insert into routing_ops(part_id,seq,op_name,machine_code,cycle_min) values($1,1,'Turning','M-850',3.2)", [partId]);
      await fails("insert into routing_ops(part_id,seq,op_name,machine_code,cycle_min) values($1,1,'Drilling','M-850',1)", [partId], /unique/i);
    });
    it("rejects a zero cycle time", () =>
      fails("insert into routing_ops(part_id,seq,op_name,machine_code,cycle_min) values($1,2,'Op','M-850',0)", [partId], /routing_ops_cycle_pos/));
    it("rejects tier number 4", () =>
      fails("insert into quote_part_tiers(quote_id,part_id,tier_no,volume,lot_size,margin_pct) values($1,$2,4,100,10,0.1)", [quoteId, partId], /tiers_tier_no_range/));
    it("rejects a tier margin of 100%", () =>
      fails("insert into quote_part_tiers(quote_id,part_id,tier_no,volume,lot_size,margin_pct) values($1,$2,1,100,10,1)", [quoteId, partId], /tiers_margin_range/));
    it("rejects a duplicate tier for the same quote and part", async () => {
      await pool.query("insert into quote_part_tiers(quote_id,part_id,tier_no,volume,lot_size,margin_pct) values($1,$2,2,100,10,0.1)", [quoteId, partId]);
      await fails("insert into quote_part_tiers(quote_id,part_id,tier_no,volume,lot_size,margin_pct) values($1,$2,2,200,20,0.1)", [quoteId, partId], /duplicate|unique|pkey/i);
    });
  });

  describe("ai suggestions, imports and snapshots", () => {
    it("requires a decider once a suggestion is decided", () =>
      fails("insert into ai_suggestions(rfq_id,part_ref,field,value,source_text,confidence,status) values($1,'1','material','EN8','EN8',0.9,'accepted')", [rfqId], /ai_decision_has_actor/));
    it("accepts a decided suggestion with a decider", async () => {
      await pool.query("insert into ai_suggestions(rfq_id,part_ref,field,value,source_text,confidence,status,decided_by,decided_at) values($1,'1','material','EN8','EN8',0.9,'accepted',$2,now())", [rfqId, userId]);
    });
    it("rejects confidence above 1", () =>
      fails("insert into ai_suggestions(rfq_id,part_ref,field,value,source_text,confidence) values($1,'1','material','EN8','EN8',1.5)", [rfqId], /ai_confidence_range|numeric field overflow/));
    it("rejects a duplicate past quote (quote_no + part_name)", async () => {
      await pool.query("insert into past_quotes(quote_no,quote_date,customer,part_name,material,gross_wt_kg,annual_volume) values('QT-1','2026-03-14','Company B','Spindle','EN8',0.61,180000)");
      await fails("insert into past_quotes(quote_no,quote_date,customer,part_name,material,gross_wt_kg,annual_volume) values('QT-1','2026-03-14','Company B','Spindle','EN8',0.61,180000)", [], /unique/i);
    });
    it("forbids updating or deleting a snapshot", async () => {
      const s = await pool.query("insert into quote_snapshots(quote_id,snapshot_no,as_of_date,payload) values($1,1,'2026-11-04','{}') returning id", [quoteId]);
      await fails("update quote_snapshots set payload='{\"x\":1}' where id=$1", [s.rows[0].id], /immutable/);
      await fails("delete from quote_snapshots where id=$1", [s.rows[0].id], /immutable/);
    });
    it("rejects a second snapshot with the same number", () =>
      fails("insert into quote_snapshots(quote_id,snapshot_no,as_of_date,payload) values($1,1,'2026-11-04','{}')", [quoteId], /unique/i));
  });
});
