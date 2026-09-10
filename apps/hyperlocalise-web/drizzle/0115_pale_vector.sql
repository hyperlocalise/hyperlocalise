CREATE TABLE "domain_research_keywords" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"linked_domain_id" uuid NOT NULL,
	"keyword" text NOT NULL,
	"seed_keyword" text,
	"market_id" text NOT NULL,
	"location_code" integer NOT NULL,
	"language_code" text NOT NULL,
	"volume" integer DEFAULT 0 NOT NULL,
	"kd" integer DEFAULT 0 NOT NULL,
	"cpc" double precision DEFAULT 0 NOT NULL,
	"intent" text DEFAULT 'informational' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domain_research_rank_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tracked_keyword_id" uuid NOT NULL,
	"position" integer,
	"url" text DEFAULT '' NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domain_research_serp_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"linked_domain_id" uuid NOT NULL,
	"keyword" text NOT NULL,
	"location_code" integer NOT NULL,
	"language_code" text NOT NULL,
	"results" jsonb NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domain_research_tracked_keywords" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"linked_domain_id" uuid NOT NULL,
	"keyword" text NOT NULL,
	"market_id" text NOT NULL,
	"location_code" integer NOT NULL,
	"language_code" text NOT NULL,
	"device" text DEFAULT 'desktop' NOT NULL,
	"volume" integer DEFAULT 0 NOT NULL,
	"position" integer,
	"previous_position" integer,
	"url" text DEFAULT '' NOT NULL,
	"last_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "domain_research_keywords" ADD CONSTRAINT "domain_research_keywords_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_research_keywords" ADD CONSTRAINT "domain_research_keywords_linked_domain_id_linked_domains_id_fk" FOREIGN KEY ("linked_domain_id") REFERENCES "public"."linked_domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_research_rank_snapshots" ADD CONSTRAINT "domain_research_rank_snapshots_tracked_keyword_id_domain_research_tracked_keywords_id_fk" FOREIGN KEY ("tracked_keyword_id") REFERENCES "public"."domain_research_tracked_keywords"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_research_serp_snapshots" ADD CONSTRAINT "domain_research_serp_snapshots_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_research_serp_snapshots" ADD CONSTRAINT "domain_research_serp_snapshots_linked_domain_id_linked_domains_id_fk" FOREIGN KEY ("linked_domain_id") REFERENCES "public"."linked_domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_research_tracked_keywords" ADD CONSTRAINT "domain_research_tracked_keywords_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_research_tracked_keywords" ADD CONSTRAINT "domain_research_tracked_keywords_linked_domain_id_linked_domains_id_fk" FOREIGN KEY ("linked_domain_id") REFERENCES "public"."linked_domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_domain_research_keywords_domain_market_kw" ON "domain_research_keywords" USING btree ("linked_domain_id","location_code","language_code","keyword");--> statement-breakpoint
CREATE INDEX "idx_domain_research_keywords_org" ON "domain_research_keywords" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_domain_research_keywords_domain" ON "domain_research_keywords" USING btree ("linked_domain_id");--> statement-breakpoint
CREATE INDEX "idx_domain_research_rank_snapshots_tracked" ON "domain_research_rank_snapshots" USING btree ("tracked_keyword_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_domain_research_serp_domain_market_kw" ON "domain_research_serp_snapshots" USING btree ("linked_domain_id","location_code","language_code","keyword");--> statement-breakpoint
CREATE INDEX "idx_domain_research_serp_domain" ON "domain_research_serp_snapshots" USING btree ("linked_domain_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_domain_research_tracked_domain_market_kw" ON "domain_research_tracked_keywords" USING btree ("linked_domain_id","location_code","language_code","keyword","device");--> statement-breakpoint
CREATE INDEX "idx_domain_research_tracked_org" ON "domain_research_tracked_keywords" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_domain_research_tracked_domain" ON "domain_research_tracked_keywords" USING btree ("linked_domain_id");