import "dotenv/config";

import { sql } from "drizzle-orm";

import { db } from "@/lib/database";

/**
 * Run once before `vp run db:migrate` on databases that already applied migration 0023
 * with the legacy `error` subscription status enum value.
 */
async function prepareProviderWebhookSubscriptionMigration() {
  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'provider_webhook_subscription_status'
          AND e.enumlabel = 'error'
      ) THEN
        ALTER TYPE provider_webhook_subscription_status ADD VALUE IF NOT EXISTS 'provider_error';
        UPDATE provider_webhook_subscriptions
        SET status = 'provider_error'
        WHERE status::text = 'error';
      END IF;
    END $$;
  `);
}

await prepareProviderWebhookSubscriptionMigration();
