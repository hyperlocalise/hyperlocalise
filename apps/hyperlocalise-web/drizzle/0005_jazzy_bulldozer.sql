-- Ephemeral OAuth rows cannot be backfilled with client_id; clear before NOT NULL columns.
DELETE FROM "mcp_auth_codes";--> statement-breakpoint
DELETE FROM "mcp_oauth_states";--> statement-breakpoint
ALTER TABLE "mcp_auth_codes" ADD COLUMN "client_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "mcp_oauth_states" ADD COLUMN "mcp_client_id" text NOT NULL;
