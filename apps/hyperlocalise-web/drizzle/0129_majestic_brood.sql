ALTER TYPE "public"."usage_event_status" ADD VALUE 'settlement_unknown';--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "estimated_amount_usd" numeric(20, 9);--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "amount_usd" numeric(20, 9);--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "model_id" text;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "provider_generation_id" text;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "credential_source" text;--> statement-breakpoint
ALTER TABLE "usage_events" ADD COLUMN "reservation_key" text;