DROP INDEX "uq_domain_research_serp_domain_market_kw";--> statement-breakpoint
ALTER TABLE "domain_research_keywords" ADD COLUMN "competition" double precision;--> statement-breakpoint
ALTER TABLE "domain_research_keywords" ADD COLUMN "monthly_searches" jsonb;--> statement-breakpoint
ALTER TABLE "domain_research_keywords" ADD COLUMN "cpc_currency" text DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE "domain_research_keywords" ADD COLUMN "metrics_captured_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "domain_research_serp_snapshots" ADD COLUMN "device" text DEFAULT 'desktop' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_domain_research_serp_domain_market_kw_device" ON "domain_research_serp_snapshots" USING btree ("linked_domain_id","location_code","language_code","keyword","device");