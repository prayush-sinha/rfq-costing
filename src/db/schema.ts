import { sql } from "drizzle-orm";
import {
  pgTable, pgEnum, serial, integer, text, numeric, date, jsonb, timestamp, check, unique, primaryKey, index,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["estimator", "sales_head"]);
export const rfqStatusEnum = pgEnum("rfq_status", ["estimating", "sent", "won", "lost"]);
export const quoteStatusEnum = pgEnum("quote_status", ["draft", "pending_approval", "approved", "sent", "rejected"]);
export const suggestionStatusEnum = pgEnum("suggestion_status", ["pending", "accepted", "rejected"]);
export const pastOutcomeEnum = pgEnum("past_outcome", ["won", "lost", "open"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
});

export const rfqs = pgTable("rfqs", {
  id: serial("id").primaryKey(),
  rfqNo: text("rfq_no").notNull().unique(),
  customerId: integer("customer_id").notNull().references(() => customers.id),
  dueDate: date("due_date").notNull(),
  ownerId: integer("owner_id").notNull().references(() => users.id),
  status: rfqStatusEnum("status").notNull().default("estimating"),
  lostReason: text("lost_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  check("rfqs_lost_reason_required",
    sql`${t.status} <> 'lost' or (${t.lostReason} is not null and length(trim(${t.lostReason})) > 0)`),
  index("rfqs_status_idx").on(t.status),
  index("rfqs_owner_idx").on(t.ownerId),
]);

export const parts = pgTable("parts", {
  id: serial("id").primaryKey(),
  rfqId: integer("rfq_id").notNull().references(() => rfqs.id),
  name: text("name").notNull(),
  material: text("material").notNull(),
  grossWtKg: numeric("gross_wt_kg", { precision: 10, scale: 3 }).notNull(),
  scrapPct: numeric("scrap_pct", { precision: 5, scale: 4 }).notNull().default("0"),
  annualVolume: integer("annual_volume").notNull(),
  toolingCost: numeric("tooling_cost", { precision: 14, scale: 2 }).notNull().default("0"),
  toolingYears: numeric("tooling_years", { precision: 4, scale: 1 }).notNull().default("2"),
  drawingRef: text("drawing_ref"),
}, (t) => [
  check("parts_gross_wt_pos", sql`${t.grossWtKg} > 0`),
  check("parts_volume_pos", sql`${t.annualVolume} > 0`),
  check("parts_scrap_pct_range", sql`${t.scrapPct} >= 0 and ${t.scrapPct} <= 0.5`),
  check("parts_tooling_cost_nonneg", sql`${t.toolingCost} >= 0`),
  check("parts_tooling_years_pos", sql`${t.toolingYears} > 0`),
  index("parts_rfq_idx").on(t.rfqId),
]);

export const rateMaterials = pgTable("rate_materials", {
  id: serial("id").primaryKey(),
  grade: text("grade").notNull(),
  ratePerKg: numeric("rate_per_kg", { precision: 12, scale: 4 }).notNull(),
  scrapRatePerKg: numeric("scrap_rate_per_kg", { precision: 12, scale: 4 }).notNull(),
  effectiveFrom: date("effective_from").notNull(),
}, (t) => [
  unique("rate_materials_grade_date").on(t.grade, t.effectiveFrom),
  check("rate_materials_rate_pos", sql`${t.ratePerKg} > 0`),
  check("rate_materials_scrap_nonneg", sql`${t.scrapRatePerKg} >= 0`),
]);

export const rateMachines = pgTable("rate_machines", {
  id: serial("id").primaryKey(),
  machineCode: text("machine_code").notNull(),
  hourRate: numeric("hour_rate", { precision: 12, scale: 2 }).notNull(),
  effectiveFrom: date("effective_from").notNull(),
}, (t) => [
  unique("rate_machines_code_date").on(t.machineCode, t.effectiveFrom),
  check("rate_machines_rate_pos", sql`${t.hourRate} > 0`),
]);

export const rateParams = pgTable("rate_params", {
  id: serial("id").primaryKey(),
  key: text("key").notNull(),
  value: numeric("value", { precision: 14, scale: 6 }).notNull(),
  effectiveFrom: date("effective_from").notNull(),
}, (t) => [
  unique("rate_params_key_date").on(t.key, t.effectiveFrom),
  check("rate_params_key_valid",
    sql`${t.key} in ('overhead_pct','packing_per_unit','freight_per_kg','gst_pct','default_margin_pct')`),
  check("rate_params_value_nonneg", sql`${t.value} >= 0`),
  check("rate_params_margin_below_one", sql`${t.key} <> 'default_margin_pct' or ${t.value} < 1`),
]);

export const routingOps = pgTable("routing_ops", {
  id: serial("id").primaryKey(),
  partId: integer("part_id").notNull().references(() => parts.id),
  seq: integer("seq").notNull(),
  opName: text("op_name").notNull(),
  machineCode: text("machine_code").notNull(),
  cycleMin: numeric("cycle_min", { precision: 10, scale: 3 }).notNull(),
  setupMin: numeric("setup_min", { precision: 10, scale: 2 }).notNull().default("0"),
}, (t) => [
  unique("routing_ops_part_seq").on(t.partId, t.seq),
  check("routing_ops_cycle_pos", sql`${t.cycleMin} > 0`),
  check("routing_ops_setup_nonneg", sql`${t.setupMin} >= 0`),
]);

export const quotes = pgTable("quotes", {
  id: serial("id").primaryKey(),
  rfqId: integer("rfq_id").notNull().references(() => rfqs.id),
  status: quoteStatusEnum("status").notNull().default("draft"),
  version: integer("version").notNull().default(1),
  asOfDate: date("as_of_date").notNull(),
  rejectionReason: text("rejection_reason"),
  submittedAt: timestamp("submitted_at"),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  check("quotes_version_pos", sql`${t.version} >= 1`),
  index("quotes_rfq_idx").on(t.rfqId),
  index("quotes_status_idx").on(t.status),
]);

export const quotePartTiers = pgTable("quote_part_tiers", {
  quoteId: integer("quote_id").notNull().references(() => quotes.id),
  partId: integer("part_id").notNull().references(() => parts.id),
  tierNo: integer("tier_no").notNull(),
  volume: integer("volume").notNull(),
  lotSize: numeric("lot_size", { precision: 14, scale: 2 }).notNull(),
  marginPct: numeric("margin_pct", { precision: 5, scale: 4 }).notNull(),
}, (t) => [
  primaryKey({ columns: [t.quoteId, t.partId, t.tierNo] }),
  check("tiers_tier_no_range", sql`${t.tierNo} between 1 and 3`),
  check("tiers_volume_pos", sql`${t.volume} > 0`),
  check("tiers_lot_size_pos", sql`${t.lotSize} > 0`),
  check("tiers_margin_range", sql`${t.marginPct} >= 0 and ${t.marginPct} < 1`),
]);

export const quoteSnapshots = pgTable("quote_snapshots", {
  id: serial("id").primaryKey(),
  quoteId: integer("quote_id").notNull().references(() => quotes.id),
  snapshotNo: integer("snapshot_no").notNull(),
  asOfDate: date("as_of_date").notNull(),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  unique("quote_snapshots_quote_no").on(t.quoteId, t.snapshotNo),
]);

export const aiSuggestions = pgTable("ai_suggestions", {
  id: serial("id").primaryKey(),
  rfqId: integer("rfq_id").notNull().references(() => rfqs.id),
  partRef: text("part_ref").notNull(),
  field: text("field").notNull(),
  value: text("value").notNull(),
  sourceText: text("source_text").notNull(),
  confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull(),
  status: suggestionStatusEnum("status").notNull().default("pending"),
  decidedBy: integer("decided_by").references(() => users.id),
  decidedAt: timestamp("decided_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  check("ai_confidence_range", sql`${t.confidence} >= 0 and ${t.confidence} <= 1`),
  check("ai_decision_has_actor",
    sql`${t.status} = 'pending' or (${t.decidedBy} is not null and ${t.decidedAt} is not null)`),
  index("ai_suggestions_rfq_idx").on(t.rfqId),
]);

export const pastQuotes = pgTable("past_quotes", {
  id: serial("id").primaryKey(),
  quoteNo: text("quote_no").notNull(),
  quoteDate: date("quote_date").notNull(),
  customer: text("customer").notNull(),
  partName: text("part_name").notNull(),
  material: text("material").notNull(),
  grossWtKg: numeric("gross_wt_kg", { precision: 10, scale: 3 }).notNull(),
  annualVolume: integer("annual_volume").notNull(),
  cycleTimeMin: numeric("cycle_time_min", { precision: 10, scale: 3 }),
  unitPrice: numeric("unit_price", { precision: 14, scale: 2 }),
  outcome: pastOutcomeEnum("outcome").notNull().default("open"),
}, (t) => [
  unique("past_quotes_natural_key").on(t.quoteNo, t.partName),
  check("past_quotes_wt_pos", sql`${t.grossWtKg} > 0`),
  check("past_quotes_volume_pos", sql`${t.annualVolume} > 0`),
  check("past_quotes_cycle_pos", sql`${t.cycleTimeMin} is null or ${t.cycleTimeMin} > 0`),
  check("past_quotes_price_pos", sql`${t.unitPrice} is null or ${t.unitPrice} > 0`),
  index("past_quotes_material_idx").on(t.material),
  index("past_quotes_customer_idx").on(t.customer),
]);

export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  actorId: integer("actor_id").references(() => users.id),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id").notNull(),
  detail: jsonb("detail").notNull().default(sql`'{}'::jsonb`),
  at: timestamp("at").notNull().defaultNow(),
}, (t) => [index("audit_entity_idx").on(t.entity, t.entityId)]);

export const loginAttempts = pgTable("login_attempts", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  ip: text("ip").notNull(),
  at: timestamp("at").notNull().defaultNow(),
}, (t) => [index("login_attempts_lookup_idx").on(t.email, t.ip, t.at)]);

export const aiUsage = pgTable("ai_usage", {
  userId: integer("user_id").notNull().references(() => users.id),
  day: date("day").notNull(),
  calls: integer("calls").notNull().default(0),
}, (t) => [
  primaryKey({ columns: [t.userId, t.day] }),
  check("ai_usage_calls_nonneg", sql`${t.calls} >= 0`),
]);
