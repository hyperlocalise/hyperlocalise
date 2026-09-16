CREATE TABLE "domain_market_analysis_cache" (
	"domain_key" text PRIMARY KEY NOT NULL,
	"analysis" jsonb NOT NULL,
	"analyzed_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "linked_domains" ADD COLUMN "market_ids" text[] DEFAULT '{}' NOT NULL;