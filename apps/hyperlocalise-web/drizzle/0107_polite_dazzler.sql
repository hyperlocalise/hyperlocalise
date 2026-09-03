CREATE TYPE "public"."experiment_flag_kind" AS ENUM('experiment', 'config');--> statement-breakpoint
CREATE TYPE "public"."experiment_kind" AS ENUM('toggle', 'ab');--> statement-breakpoint
CREATE TYPE "public"."experiment_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TABLE "experiment_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"start" integer DEFAULT 0 NOT NULL,
	"end" integer DEFAULT 9999 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "experiment_allocations_range_check" CHECK ("experiment_allocations"."start" >= 0 AND "experiment_allocations"."end" <= 9999 AND "experiment_allocations"."start" <= "experiment_allocations"."end")
);
--> statement-breakpoint
CREATE TABLE "experiment_audiences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"criterion" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experiment_client_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" text NOT NULL,
	"created_by_user_id" uuid,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experiment_flag_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flag_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experiment_flag_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flag_id" uuid NOT NULL,
	"value" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experiment_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"key" text NOT NULL,
	"description" text,
	"kind" "experiment_flag_kind" DEFAULT 'experiment' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experiment_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_id" uuid NOT NULL,
	"key" text NOT NULL,
	"audience_id" uuid,
	"rollout_percentage" integer DEFAULT 10000 NOT NULL,
	"is_control" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "experiment_variants_rollout_percentage_check" CHECK ("experiment_variants"."rollout_percentage" >= 0 AND "experiment_variants"."rollout_percentage" <= 10000)
);
--> statement-breakpoint
CREATE TABLE "experiments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" "experiment_status" DEFAULT 'draft' NOT NULL,
	"kind" "experiment_kind" DEFAULT 'toggle' NOT NULL,
	"audience_id" uuid,
	"rollout_percentage" integer DEFAULT 10000 NOT NULL,
	"seed" integer NOT NULL,
	"start_at" timestamp with time zone DEFAULT now() NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "experiments_rollout_percentage_check" CHECK ("experiments"."rollout_percentage" >= 0 AND "experiments"."rollout_percentage" <= 10000)
);
--> statement-breakpoint
ALTER TABLE "experiment_allocations" ADD CONSTRAINT "experiment_allocations_variant_id_experiment_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."experiment_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_audiences" ADD CONSTRAINT "experiment_audiences_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_client_keys" ADD CONSTRAINT "experiment_client_keys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_client_keys" ADD CONSTRAINT "experiment_client_keys_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_flag_assignments" ADD CONSTRAINT "experiment_flag_assignments_flag_id_experiment_flags_id_fk" FOREIGN KEY ("flag_id") REFERENCES "public"."experiment_flags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_flag_assignments" ADD CONSTRAINT "experiment_flag_assignments_variant_id_experiment_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."experiment_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_flag_configs" ADD CONSTRAINT "experiment_flag_configs_flag_id_experiment_flags_id_fk" FOREIGN KEY ("flag_id") REFERENCES "public"."experiment_flags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_flags" ADD CONSTRAINT "experiment_flags_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_variants" ADD CONSTRAINT "experiment_variants_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_variants" ADD CONSTRAINT "experiment_variants_audience_id_experiment_audiences_id_fk" FOREIGN KEY ("audience_id") REFERENCES "public"."experiment_audiences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_audience_id_experiment_audiences_id_fk" FOREIGN KEY ("audience_id") REFERENCES "public"."experiment_audiences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_experiment_allocations_variant_id" ON "experiment_allocations" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "idx_experiment_allocations_range" ON "experiment_allocations" USING btree ("start","end");--> statement-breakpoint
CREATE INDEX "idx_experiment_audiences_org" ON "experiment_audiences" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "experiment_client_keys_key_hash_key" ON "experiment_client_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "idx_experiment_client_keys_org" ON "experiment_client_keys" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "experiment_flag_assignments_flag_variant_key" ON "experiment_flag_assignments" USING btree ("flag_id","variant_id");--> statement-breakpoint
CREATE INDEX "idx_experiment_flag_assignments_flag_id" ON "experiment_flag_assignments" USING btree ("flag_id");--> statement-breakpoint
CREATE INDEX "idx_experiment_flag_assignments_variant_id" ON "experiment_flag_assignments" USING btree ("variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "experiment_flag_configs_flag_id_key" ON "experiment_flag_configs" USING btree ("flag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "experiment_flags_org_key_key" ON "experiment_flags" USING btree ("organization_id","key");--> statement-breakpoint
CREATE INDEX "idx_experiment_flags_org_kind" ON "experiment_flags" USING btree ("organization_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "experiment_variants_experiment_key_key" ON "experiment_variants" USING btree ("experiment_id","key");--> statement-breakpoint
CREATE INDEX "idx_experiment_variants_experiment_id" ON "experiment_variants" USING btree ("experiment_id");--> statement-breakpoint
CREATE INDEX "idx_experiment_variants_audience_id" ON "experiment_variants" USING btree ("audience_id");--> statement-breakpoint
CREATE INDEX "idx_experiments_org_status" ON "experiments" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "idx_experiments_org_window" ON "experiments" USING btree ("organization_id","start_at","end_at");--> statement-breakpoint
CREATE INDEX "idx_experiments_audience_id" ON "experiments" USING btree ("audience_id");