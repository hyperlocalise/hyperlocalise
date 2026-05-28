ALTER TABLE "provider_webhook_subscriptions" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "provider_webhook_subscriptions" ALTER COLUMN "status" SET DEFAULT 'pending'::text;--> statement-breakpoint
DROP TYPE "public"."provider_webhook_subscription_status";--> statement-breakpoint
CREATE TYPE "public"."provider_webhook_subscription_status" AS ENUM('pending', 'active', 'permission_error', 'provider_error', 'disabled', 'manual_required');--> statement-breakpoint
ALTER TABLE "provider_webhook_subscriptions" ALTER COLUMN "status" SET DEFAULT 'pending'::"public"."provider_webhook_subscription_status";--> statement-breakpoint
ALTER TABLE "provider_webhook_subscriptions" ALTER COLUMN "status" SET DATA TYPE "public"."provider_webhook_subscription_status" USING "status"::"public"."provider_webhook_subscription_status";--> statement-breakpoint
ALTER TABLE "provider_webhook_subscriptions" ADD COLUMN "manual_fallback" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_webhook_subscriptions" ADD COLUMN "last_audited_at" timestamp with time zone;