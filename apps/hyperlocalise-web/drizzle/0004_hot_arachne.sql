CREATE TABLE "used_authorization_codes" (
	"code_hash" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mcp_sessions" ADD COLUMN "scope" text DEFAULT 'mcp' NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_used_authorization_codes_expires_at" ON "used_authorization_codes" USING btree ("expires_at");