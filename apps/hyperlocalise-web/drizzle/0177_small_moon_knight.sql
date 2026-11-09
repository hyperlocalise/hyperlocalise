CREATE TABLE "localisation_deep_audit_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"credit_id" text NOT NULL,
	"dimension" text NOT NULL,
	"severity" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"url" text,
	"template_key" text,
	"locale" text,
	"location" text,
	"evidence" text,
	"advice" text,
	"confidence" integer,
	"fingerprint" text NOT NULL,
	"diff_state" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "localisation_deep_audit_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"url" text NOT NULL,
	"final_url" text NOT NULL,
	"http_status" integer NOT NULL,
	"locale" text,
	"template_key" text NOT NULL,
	"artifact" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "localisation_deep_audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"linked_domain_id" uuid NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"trigger" text DEFAULT 'manual' NOT NULL,
	"requested_by_user_id" uuid,
	"page_limit" integer DEFAULT 100 NOT NULL,
	"pages_discovered" integer DEFAULT 0 NOT NULL,
	"pages_rendered" integer DEFAULT 0 NOT NULL,
	"score" integer,
	"dimension_scores" jsonb,
	"summary" jsonb,
	"previous_run_id" uuid,
	"workflow_run_id" text,
	"error_code" text,
	"error_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "localisation_deep_audit_findings" ADD CONSTRAINT "localisation_deep_audit_findings_run_id_localisation_deep_audits_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."localisation_deep_audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "localisation_deep_audit_findings" ADD CONSTRAINT "localisation_deep_audit_findings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "localisation_deep_audit_pages" ADD CONSTRAINT "localisation_deep_audit_pages_run_id_localisation_deep_audits_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."localisation_deep_audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "localisation_deep_audit_pages" ADD CONSTRAINT "localisation_deep_audit_pages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "localisation_deep_audits" ADD CONSTRAINT "localisation_deep_audits_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "localisation_deep_audits" ADD CONSTRAINT "localisation_deep_audits_linked_domain_id_linked_domains_id_fk" FOREIGN KEY ("linked_domain_id") REFERENCES "public"."linked_domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "localisation_deep_audits" ADD CONSTRAINT "localisation_deep_audits_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "localisation_deep_audits" ADD CONSTRAINT "localisation_deep_audits_previous_run_id_localisation_deep_audits_id_fk" FOREIGN KEY ("previous_run_id") REFERENCES "public"."localisation_deep_audits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_localisation_deep_audit_findings_run_credit" ON "localisation_deep_audit_findings" USING btree ("run_id","credit_id");--> statement-breakpoint
CREATE INDEX "idx_localisation_deep_audit_findings_run_fingerprint" ON "localisation_deep_audit_findings" USING btree ("run_id","fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_localisation_deep_audit_pages_run_url" ON "localisation_deep_audit_pages" USING btree ("run_id","url");--> statement-breakpoint
CREATE INDEX "idx_localisation_deep_audit_pages_run_template" ON "localisation_deep_audit_pages" USING btree ("run_id","template_key");--> statement-breakpoint
CREATE INDEX "idx_localisation_deep_audits_org" ON "localisation_deep_audits" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_localisation_deep_audits_domain_created" ON "localisation_deep_audits" USING btree ("linked_domain_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_localisation_deep_audits_in_flight" ON "localisation_deep_audits" USING btree ("linked_domain_id") WHERE "localisation_deep_audits"."status" in ('queued', 'crawling', 'scoring');