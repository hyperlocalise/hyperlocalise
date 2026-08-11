CREATE TABLE "localisation_audit_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" uuid NOT NULL,
	"email" text NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"delivery_status" text DEFAULT 'pending' NOT NULL,
	"token_hash" text,
	"token_expires_at" timestamp with time zone,
	"email_sent_at" timestamp with time zone,
	"email_error" text,
	"last_email_queued_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "localisation_audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_key" text NOT NULL,
	"domain_slug" text NOT NULL,
	"source_url" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempt_number" integer DEFAULT 1 NOT NULL,
	"progress_stage" text,
	"status_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"workflow_run_id" text,
	"focus_locales" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"score" integer,
	"teaser" jsonb,
	"report" jsonb,
	"error_code" text,
	"error_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "localisation_audit_leads" ADD CONSTRAINT "localisation_audit_leads_audit_id_localisation_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."localisation_audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_localisation_audit_leads_audit_email" ON "localisation_audit_leads" USING btree ("audit_id","email");--> statement-breakpoint
CREATE INDEX "idx_localisation_audit_leads_audit" ON "localisation_audit_leads" USING btree ("audit_id");--> statement-breakpoint
CREATE INDEX "idx_localisation_audit_leads_token_hash" ON "localisation_audit_leads" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "idx_localisation_audit_leads_delivery_status" ON "localisation_audit_leads" USING btree ("delivery_status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_localisation_audits_domain_key" ON "localisation_audits" USING btree ("domain_key");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_localisation_audits_domain_slug" ON "localisation_audits" USING btree ("domain_slug");--> statement-breakpoint
CREATE INDEX "idx_localisation_audits_status" ON "localisation_audits" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_localisation_audits_completed_at" ON "localisation_audits" USING btree ("completed_at");--> statement-breakpoint
CREATE INDEX "idx_localisation_audits_status_updated_at" ON "localisation_audits" USING btree ("status_updated_at");--> statement-breakpoint
CREATE INDEX "idx_localisation_audits_score" ON "localisation_audits" USING btree ("score");