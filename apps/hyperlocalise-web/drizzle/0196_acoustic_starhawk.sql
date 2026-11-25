CREATE TABLE "brand_voices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_by_user_id" uuid,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"provider" text NOT NULL,
	"provider_voice_id" text NOT NULL,
	"source" text NOT NULL,
	"labels" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"language" text,
	"sample_asset_ids" text[] DEFAULT '{}' NOT NULL,
	"consent_by_user_id" uuid,
	"consented_at" timestamp with time zone,
	"consent_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "brand_voices_source_check" CHECK ("brand_voices"."source" IN ('clone', 'design')),
	CONSTRAINT "brand_voices_clone_consent_check" CHECK ("brand_voices"."source" <> 'clone' OR ("brand_voices"."consented_at" IS NOT NULL AND "brand_voices"."consent_version" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "brand_voices" ADD CONSTRAINT "brand_voices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_voices" ADD CONSTRAINT "brand_voices_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_voices" ADD CONSTRAINT "brand_voices_consent_by_user_id_users_id_fk" FOREIGN KEY ("consent_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "brand_voices_org_name_key_active_key" ON "brand_voices" USING btree ("organization_id","name_key") WHERE "brand_voices"."archived_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "brand_voices_provider_voice_id_key" ON "brand_voices" USING btree ("provider","provider_voice_id");--> statement-breakpoint
CREATE INDEX "idx_brand_voices_org_created_at" ON "brand_voices" USING btree ("organization_id","created_at");