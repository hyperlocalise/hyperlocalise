ALTER TABLE "domain_research_keywords"
  ADD COLUMN "competition" double precision,
  ADD COLUMN "monthly_searches" jsonb,
  ADD COLUMN "cpc_currency" text DEFAULT 'USD' NOT NULL,
  ADD COLUMN "metrics_captured_at" timestamp with time zone;
