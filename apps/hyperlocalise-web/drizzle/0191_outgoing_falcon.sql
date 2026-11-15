CREATE TABLE "ota_experiment_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"distribution_id" uuid NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ota_distributions" ADD COLUMN "branch_name" text DEFAULT 'main' NOT NULL;--> statement-breakpoint
ALTER TABLE "ota_releases" ADD COLUMN "contents" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "ota_experiment_bindings" ADD CONSTRAINT "ota_experiment_bindings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ota_experiment_bindings" ADD CONSTRAINT "ota_experiment_bindings_variant_id_experiment_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."experiment_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ota_experiment_bindings" ADD CONSTRAINT "ota_experiment_bindings_distribution_id_ota_distributions_id_fk" FOREIGN KEY ("distribution_id") REFERENCES "public"."ota_distributions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ota_experiment_bindings" ADD CONSTRAINT "ota_experiment_bindings_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ota_experiment_bindings_variant_id_key" ON "ota_experiment_bindings" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "idx_ota_experiment_bindings_org" ON "ota_experiment_bindings" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_ota_experiment_bindings_distribution_id" ON "ota_experiment_bindings" USING btree ("distribution_id");--> statement-breakpoint
CREATE INDEX "idx_ota_distributions_project_branch" ON "ota_distributions" USING btree ("project_id","branch_name");