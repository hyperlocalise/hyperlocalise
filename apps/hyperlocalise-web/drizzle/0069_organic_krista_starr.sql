CREATE TYPE "public"."localisation_audit_category" AS ENUM('technical', 'linguistic', 'market');--> statement-breakpoint
CREATE TYPE "public"."localisation_audit_event_type" AS ENUM('submitted', 'prepared', 'confirmed', 'completed', 'viewed', 'unlocked', 'shared', 'booked', 'workspace_converted', 'email_delivery_failed');--> statement-breakpoint
CREATE TYPE "public"."localisation_audit_evidence_kind" AS ENUM('observed', 'judgement');--> statement-breakpoint
CREATE TYPE "public"."localisation_audit_indexing_state" AS ENUM('noindex', 'eligible', 'indexed', 'removed');--> statement-breakpoint
CREATE TYPE "public"."localisation_audit_page_status" AS ENUM('extracted', 'blocked', 'failed');--> statement-breakpoint
CREATE TYPE "public"."localisation_audit_report_visibility" AS ENUM('private', 'public');--> statement-breakpoint
CREATE TYPE "public"."localisation_audit_severity" AS ENUM('info', 'low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."localisation_audit_status" AS ENUM('preparing', 'awaiting_confirmation', 'running', 'completed', 'partial', 'failed');--> statement-breakpoint
CREATE TABLE "localisation_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" uuid NOT NULL,
	"lead_id" uuid,
	"event_type" "localisation_audit_event_type" NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "localisation_audit_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" uuid NOT NULL,
	"page_id" uuid,
	"rule_code" text NOT NULL,
	"category" "localisation_audit_category" NOT NULL,
	"severity" "localisation_audit_severity" NOT NULL,
	"confidence" double precision NOT NULL,
	"evidence_kind" "localisation_audit_evidence_kind" NOT NULL,
	"title" text NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"impact" text NOT NULL,
	"recommendation" text NOT NULL,
	"available_points" integer NOT NULL,
	"earned_points" integer NOT NULL,
	"public_preview_eligible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "localisation_audit_findings_confidence_check" CHECK ("localisation_audit_findings"."confidence" >= 0 and "localisation_audit_findings"."confidence" <= 1),
	CONSTRAINT "localisation_audit_findings_points_check" CHECK ("localisation_audit_findings"."available_points" >= 0 and "localisation_audit_findings"."earned_points" >= 0 and "localisation_audit_findings"."earned_points" <= "localisation_audit_findings"."available_points")
);
--> statement-breakpoint
CREATE TABLE "localisation_audit_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"email_delivery_status" text DEFAULT 'pending' NOT NULL,
	"unlocked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "localisation_audit_leads_delivery_status_check" CHECK ("localisation_audit_leads"."email_delivery_status" in ('pending', 'sent', 'skipped', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "localisation_audit_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" uuid NOT NULL,
	"normalized_url" text NOT NULL,
	"locale" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"status" "localisation_audit_page_status" NOT NULL,
	"http_status" integer,
	"content_fingerprint" text,
	"extraction" jsonb,
	"failure_code" text,
	"fetched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "localisation_audit_pages_http_status_check" CHECK ("localisation_audit_pages"."http_status" is null or ("localisation_audit_pages"."http_status" >= 100 and "localisation_audit_pages"."http_status" <= 599))
);
--> statement-breakpoint
CREATE TABLE "localisation_audit_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" uuid NOT NULL,
	"public_slug" text NOT NULL,
	"visibility" "localisation_audit_report_visibility" DEFAULT 'public' NOT NULL,
	"indexing_state" "localisation_audit_indexing_state" DEFAULT 'noindex' NOT NULL,
	"score_version" text NOT NULL,
	"report_version" text NOT NULL,
	"public_report" jsonb NOT NULL,
	"private_report" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "localisation_audit_reports_public_slug_check" CHECK (char_length("localisation_audit_reports"."public_slug") >= 16 and char_length("localisation_audit_reports"."public_slug") <= 64)
);
--> statement-breakpoint
CREATE TABLE "localisation_audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "localisation_audit_status" DEFAULT 'preparing' NOT NULL,
	"submitted_url" text NOT NULL,
	"normalized_url" text NOT NULL,
	"domain" text NOT NULL,
	"domain_hash" text NOT NULL,
	"ip_hash" text NOT NULL,
	"detected_locale" text,
	"target_locale" text,
	"target_market" text,
	"alternatives" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"score_version" text NOT NULL,
	"report_version" text NOT NULL,
	"failure_code" text,
	"confirmed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "localisation_audits_domain_hash_check" CHECK (char_length("localisation_audits"."domain_hash") = 64),
	CONSTRAINT "localisation_audits_ip_hash_check" CHECK (char_length("localisation_audits"."ip_hash") = 64),
	CONSTRAINT "localisation_audits_score_version_check" CHECK (char_length("localisation_audits"."score_version") > 0),
	CONSTRAINT "localisation_audits_report_version_check" CHECK (char_length("localisation_audits"."report_version") > 0)
);
--> statement-breakpoint
ALTER TABLE "localisation_audit_events" ADD CONSTRAINT "localisation_audit_events_audit_id_localisation_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."localisation_audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "localisation_audit_events" ADD CONSTRAINT "localisation_audit_events_lead_id_localisation_audit_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."localisation_audit_leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "localisation_audit_findings" ADD CONSTRAINT "localisation_audit_findings_audit_id_localisation_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."localisation_audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "localisation_audit_findings" ADD CONSTRAINT "localisation_audit_findings_page_id_localisation_audit_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."localisation_audit_pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "localisation_audit_leads" ADD CONSTRAINT "localisation_audit_leads_audit_id_localisation_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."localisation_audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "localisation_audit_pages" ADD CONSTRAINT "localisation_audit_pages_audit_id_localisation_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."localisation_audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "localisation_audit_reports" ADD CONSTRAINT "localisation_audit_reports_audit_id_localisation_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."localisation_audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_localisation_audit_events_audit_time" ON "localisation_audit_events" USING btree ("audit_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_localisation_audit_events_type_time" ON "localisation_audit_events" USING btree ("event_type","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_localisation_audit_findings_rule_page" ON "localisation_audit_findings" USING btree ("audit_id","rule_code","page_id");--> statement-breakpoint
CREATE INDEX "idx_localisation_audit_findings_audit_category" ON "localisation_audit_findings" USING btree ("audit_id","category");--> statement-breakpoint
CREATE INDEX "idx_localisation_audit_leads_audit" ON "localisation_audit_leads" USING btree ("audit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_localisation_audit_pages_audit_url" ON "localisation_audit_pages" USING btree ("audit_id","normalized_url");--> statement-breakpoint
CREATE INDEX "idx_localisation_audit_pages_audit" ON "localisation_audit_pages" USING btree ("audit_id");--> statement-breakpoint
CREATE INDEX "idx_localisation_audit_pages_fingerprint" ON "localisation_audit_pages" USING btree ("content_fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_localisation_audit_reports_audit" ON "localisation_audit_reports" USING btree ("audit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_localisation_audit_reports_public_slug" ON "localisation_audit_reports" USING btree ("public_slug");--> statement-breakpoint
CREATE INDEX "idx_localisation_audit_reports_visibility" ON "localisation_audit_reports" USING btree ("visibility","indexing_state");--> statement-breakpoint
CREATE INDEX "idx_localisation_audits_ip_budget" ON "localisation_audits" USING btree ("ip_hash","created_at");--> statement-breakpoint
CREATE INDEX "idx_localisation_audits_domain_budget" ON "localisation_audits" USING btree ("domain_hash","created_at");--> statement-breakpoint
CREATE INDEX "idx_localisation_audits_status_created" ON "localisation_audits" USING btree ("status","created_at");