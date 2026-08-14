CREATE TABLE "linked_domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by_user_id" uuid,
	"domain_key" text NOT NULL,
	"domain_slug" text NOT NULL,
	"source_url" text NOT NULL,
	"status" text DEFAULT 'pending_verification' NOT NULL,
	"verification_token" text NOT NULL,
	"preferred_method" text,
	"verified_method" text,
	"verified_at" timestamp with time zone,
	"localisation_audit_id" uuid,
	"project_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "localisation_audits" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "localisation_audits" ADD COLUMN "linked_domain_id" uuid;--> statement-breakpoint
ALTER TABLE "linked_domains" ADD CONSTRAINT "linked_domains_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linked_domains" ADD CONSTRAINT "linked_domains_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linked_domains" ADD CONSTRAINT "linked_domains_localisation_audit_id_localisation_audits_id_fk" FOREIGN KEY ("localisation_audit_id") REFERENCES "public"."localisation_audits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linked_domains" ADD CONSTRAINT "linked_domains_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_linked_domains_org_domain_key" ON "linked_domains" USING btree ("organization_id","domain_key");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_linked_domains_verified_domain_key" ON "linked_domains" USING btree ("domain_key") WHERE "linked_domains"."status" = 'verified';--> statement-breakpoint
CREATE INDEX "idx_linked_domains_org" ON "linked_domains" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_linked_domains_domain_slug" ON "linked_domains" USING btree ("domain_slug");--> statement-breakpoint
CREATE INDEX "idx_linked_domains_status" ON "linked_domains" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_linked_domains_localisation_audit_id" ON "linked_domains" USING btree ("localisation_audit_id");--> statement-breakpoint
ALTER TABLE "localisation_audits" ADD CONSTRAINT "localisation_audits_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_localisation_audits_organization_id" ON "localisation_audits" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_localisation_audits_linked_domain_id" ON "localisation_audits" USING btree ("linked_domain_id");