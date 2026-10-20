ALTER TABLE "sanity_plugin_oauth_handoffs" ADD COLUMN "studio_origin" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "sanity_plugin_oauth_handoffs" ALTER COLUMN "studio_origin" DROP DEFAULT;
