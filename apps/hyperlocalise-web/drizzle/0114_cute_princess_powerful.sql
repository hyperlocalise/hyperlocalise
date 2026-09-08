CREATE TABLE "memory_import_attempt_diagnostics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"severity" text NOT NULL,
	"code" text NOT NULL,
	"message" text NOT NULL,
	"unit_index" integer,
	"tuid" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_import_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"memory_id" uuid NOT NULL,
	"created_by_user_id" uuid,
	"status" text DEFAULT 'running' NOT NULL,
	"format" text NOT NULL,
	"options" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_filename" text,
	"source_byte_size" integer,
	"source_sha256" text NOT NULL,
	"counts" jsonb,
	"header_srclang" text,
	"diagnostics_truncated" boolean DEFAULT false NOT NULL,
	"diagnostics_availability" text DEFAULT 'available' NOT NULL,
	"diagnostics_expires_at" timestamp with time zone,
	"failure_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "memory_import_attempt_diagnostics" ADD CONSTRAINT "memory_import_attempt_diagnostics_attempt_id_memory_import_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."memory_import_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_import_attempts" ADD CONSTRAINT "memory_import_attempts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_import_attempts" ADD CONSTRAINT "memory_import_attempts_memory_id_memories_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_import_attempts" ADD CONSTRAINT "memory_import_attempts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_memory_import_attempt_diagnostics_attempt" ON "memory_import_attempt_diagnostics" USING btree ("attempt_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_memory_import_attempts_memory_created_at_id" ON "memory_import_attempts" USING btree ("memory_id","created_at","id");--> statement-breakpoint
CREATE INDEX "idx_memory_import_attempts_org_created_at" ON "memory_import_attempts" USING btree ("organization_id","created_at");