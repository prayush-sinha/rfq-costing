CREATE TYPE "public"."past_outcome" AS ENUM('won', 'lost', 'open');--> statement-breakpoint
CREATE TYPE "public"."quote_status" AS ENUM('draft', 'pending_approval', 'approved', 'sent', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."rfq_status" AS ENUM('estimating', 'sent', 'won', 'lost');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('estimator', 'sales_head');--> statement-breakpoint
CREATE TYPE "public"."suggestion_status" AS ENUM('pending', 'accepted', 'rejected');--> statement-breakpoint
CREATE TABLE "ai_suggestions" (
	"id" serial PRIMARY KEY NOT NULL,
	"rfq_id" integer NOT NULL,
	"part_ref" text NOT NULL,
	"field" text NOT NULL,
	"value" text NOT NULL,
	"source_text" text NOT NULL,
	"confidence" numeric(4, 3) NOT NULL,
	"status" "suggestion_status" DEFAULT 'pending' NOT NULL,
	"decided_by" integer,
	"decided_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ai_confidence_range" CHECK ("ai_suggestions"."confidence" >= 0 and "ai_suggestions"."confidence" <= 1),
	CONSTRAINT "ai_decision_has_actor" CHECK ("ai_suggestions"."status" = 'pending' or ("ai_suggestions"."decided_by" is not null and "ai_suggestions"."decided_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"user_id" integer NOT NULL,
	"day" date NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ai_usage_user_id_day_pk" PRIMARY KEY("user_id","day"),
	CONSTRAINT "ai_usage_calls_nonneg" CHECK ("ai_usage"."calls" >= 0)
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_id" integer,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "customers_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"ip" text NOT NULL,
	"at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parts" (
	"id" serial PRIMARY KEY NOT NULL,
	"rfq_id" integer NOT NULL,
	"name" text NOT NULL,
	"material" text NOT NULL,
	"gross_wt_kg" numeric(10, 3) NOT NULL,
	"scrap_pct" numeric(5, 4) DEFAULT '0' NOT NULL,
	"annual_volume" integer NOT NULL,
	"tooling_cost" numeric(14, 2) DEFAULT '0' NOT NULL,
	"tooling_years" numeric(4, 1) DEFAULT '2' NOT NULL,
	"drawing_ref" text,
	CONSTRAINT "parts_gross_wt_pos" CHECK ("parts"."gross_wt_kg" > 0),
	CONSTRAINT "parts_volume_pos" CHECK ("parts"."annual_volume" > 0),
	CONSTRAINT "parts_scrap_pct_range" CHECK ("parts"."scrap_pct" >= 0 and "parts"."scrap_pct" <= 0.5),
	CONSTRAINT "parts_tooling_cost_nonneg" CHECK ("parts"."tooling_cost" >= 0),
	CONSTRAINT "parts_tooling_years_pos" CHECK ("parts"."tooling_years" > 0)
);
--> statement-breakpoint
CREATE TABLE "past_quotes" (
	"id" serial PRIMARY KEY NOT NULL,
	"quote_no" text NOT NULL,
	"quote_date" date NOT NULL,
	"customer" text NOT NULL,
	"part_name" text NOT NULL,
	"material" text NOT NULL,
	"gross_wt_kg" numeric(10, 3) NOT NULL,
	"annual_volume" integer NOT NULL,
	"cycle_time_min" numeric(10, 3),
	"unit_price" numeric(14, 2),
	"outcome" "past_outcome" DEFAULT 'open' NOT NULL,
	CONSTRAINT "past_quotes_natural_key" UNIQUE("quote_no","part_name"),
	CONSTRAINT "past_quotes_wt_pos" CHECK ("past_quotes"."gross_wt_kg" > 0),
	CONSTRAINT "past_quotes_volume_pos" CHECK ("past_quotes"."annual_volume" > 0),
	CONSTRAINT "past_quotes_cycle_pos" CHECK ("past_quotes"."cycle_time_min" is null or "past_quotes"."cycle_time_min" > 0),
	CONSTRAINT "past_quotes_price_pos" CHECK ("past_quotes"."unit_price" is null or "past_quotes"."unit_price" > 0)
);
--> statement-breakpoint
CREATE TABLE "quote_part_tiers" (
	"quote_id" integer NOT NULL,
	"part_id" integer NOT NULL,
	"tier_no" integer NOT NULL,
	"volume" integer NOT NULL,
	"lot_size" numeric(14, 2) NOT NULL,
	"margin_pct" numeric(5, 4) NOT NULL,
	CONSTRAINT "quote_part_tiers_quote_id_part_id_tier_no_pk" PRIMARY KEY("quote_id","part_id","tier_no"),
	CONSTRAINT "tiers_tier_no_range" CHECK ("quote_part_tiers"."tier_no" between 1 and 3),
	CONSTRAINT "tiers_volume_pos" CHECK ("quote_part_tiers"."volume" > 0),
	CONSTRAINT "tiers_lot_size_pos" CHECK ("quote_part_tiers"."lot_size" > 0),
	CONSTRAINT "tiers_margin_range" CHECK ("quote_part_tiers"."margin_pct" >= 0 and "quote_part_tiers"."margin_pct" < 1)
);
--> statement-breakpoint
CREATE TABLE "quote_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"quote_id" integer NOT NULL,
	"snapshot_no" integer NOT NULL,
	"as_of_date" date NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "quote_snapshots_quote_no" UNIQUE("quote_id","snapshot_no")
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" serial PRIMARY KEY NOT NULL,
	"rfq_id" integer NOT NULL,
	"status" "quote_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"as_of_date" date NOT NULL,
	"rejection_reason" text,
	"submitted_at" timestamp,
	"approved_by" integer,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "quotes_version_pos" CHECK ("quotes"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "rate_machines" (
	"id" serial PRIMARY KEY NOT NULL,
	"machine_code" text NOT NULL,
	"hour_rate" numeric(12, 2) NOT NULL,
	"effective_from" date NOT NULL,
	CONSTRAINT "rate_machines_code_date" UNIQUE("machine_code","effective_from"),
	CONSTRAINT "rate_machines_rate_pos" CHECK ("rate_machines"."hour_rate" > 0)
);
--> statement-breakpoint
CREATE TABLE "rate_materials" (
	"id" serial PRIMARY KEY NOT NULL,
	"grade" text NOT NULL,
	"rate_per_kg" numeric(12, 4) NOT NULL,
	"scrap_rate_per_kg" numeric(12, 4) NOT NULL,
	"effective_from" date NOT NULL,
	CONSTRAINT "rate_materials_grade_date" UNIQUE("grade","effective_from"),
	CONSTRAINT "rate_materials_rate_pos" CHECK ("rate_materials"."rate_per_kg" > 0),
	CONSTRAINT "rate_materials_scrap_nonneg" CHECK ("rate_materials"."scrap_rate_per_kg" >= 0)
);
--> statement-breakpoint
CREATE TABLE "rate_params" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" numeric(14, 6) NOT NULL,
	"effective_from" date NOT NULL,
	CONSTRAINT "rate_params_key_date" UNIQUE("key","effective_from"),
	CONSTRAINT "rate_params_key_valid" CHECK ("rate_params"."key" in ('overhead_pct','packing_per_unit','freight_per_kg','gst_pct','default_margin_pct')),
	CONSTRAINT "rate_params_value_nonneg" CHECK ("rate_params"."value" >= 0),
	CONSTRAINT "rate_params_margin_below_one" CHECK ("rate_params"."key" <> 'default_margin_pct' or "rate_params"."value" < 1)
);
--> statement-breakpoint
CREATE TABLE "rfqs" (
	"id" serial PRIMARY KEY NOT NULL,
	"rfq_no" text NOT NULL,
	"customer_id" integer NOT NULL,
	"due_date" date NOT NULL,
	"owner_id" integer NOT NULL,
	"status" "rfq_status" DEFAULT 'estimating' NOT NULL,
	"lost_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rfqs_rfq_no_unique" UNIQUE("rfq_no"),
	CONSTRAINT "rfqs_lost_reason_required" CHECK ("rfqs"."status" <> 'lost' or ("rfqs"."lost_reason" is not null and length(trim("rfqs"."lost_reason")) > 0))
);
--> statement-breakpoint
CREATE TABLE "routing_ops" (
	"id" serial PRIMARY KEY NOT NULL,
	"part_id" integer NOT NULL,
	"seq" integer NOT NULL,
	"op_name" text NOT NULL,
	"machine_code" text NOT NULL,
	"cycle_min" numeric(10, 3) NOT NULL,
	"setup_min" numeric(10, 2) DEFAULT '0' NOT NULL,
	CONSTRAINT "routing_ops_part_seq" UNIQUE("part_id","seq"),
	CONSTRAINT "routing_ops_cycle_pos" CHECK ("routing_ops"."cycle_min" > 0),
	CONSTRAINT "routing_ops_setup_nonneg" CHECK ("routing_ops"."setup_min" >= 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "role" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "ai_suggestions" ADD CONSTRAINT "ai_suggestions_rfq_id_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."rfqs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_suggestions" ADD CONSTRAINT "ai_suggestions_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parts" ADD CONSTRAINT "parts_rfq_id_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."rfqs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_part_tiers" ADD CONSTRAINT "quote_part_tiers_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_part_tiers" ADD CONSTRAINT "quote_part_tiers_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_snapshots" ADD CONSTRAINT "quote_snapshots_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_rfq_id_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."rfqs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routing_ops" ADD CONSTRAINT "routing_ops_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_suggestions_rfq_idx" ON "ai_suggestions" USING btree ("rfq_id");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "login_attempts_lookup_idx" ON "login_attempts" USING btree ("email","ip","at");--> statement-breakpoint
CREATE INDEX "parts_rfq_idx" ON "parts" USING btree ("rfq_id");--> statement-breakpoint
CREATE INDEX "past_quotes_material_idx" ON "past_quotes" USING btree ("material");--> statement-breakpoint
CREATE INDEX "past_quotes_customer_idx" ON "past_quotes" USING btree ("customer");--> statement-breakpoint
CREATE INDEX "quotes_rfq_idx" ON "quotes" USING btree ("rfq_id");--> statement-breakpoint
CREATE INDEX "quotes_status_idx" ON "quotes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "rfqs_status_idx" ON "rfqs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "rfqs_owner_idx" ON "rfqs" USING btree ("owner_id");