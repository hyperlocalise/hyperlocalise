import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

const isTestEnv = process.env.VITEST === "true" || process.env.NODE_ENV === "test";
const isCI = process.env.CI === "true";

export const env = createEnv({
  skipValidation: isCI,
  server: {
    DATABASE_URL: z.string().min(1),
    INNGEST_EVENT_KEY: z.string().min(1),
    INNGEST_SIGNING_KEY: z.string().min(1),
    OPENAI_API_KEY: z.string().min(1).optional(),
    WORKOS_API_KEY: z.string().min(1).optional(),
    WORKOS_CLIENT_ID: z.string().min(1).optional(),
    WORKOS_REDIRECT_URI: z.url().optional(),
    WORKOS_WEBHOOK_SECRET: z.string().min(1).optional(),
  },
  client: {
    NEXT_PUBLIC_WAITLIST_URL: z.url(),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    INNGEST_EVENT_KEY: process.env.INNGEST_EVENT_KEY ?? (isTestEnv ? "test-event-key" : undefined),
    INNGEST_SIGNING_KEY:
      process.env.INNGEST_SIGNING_KEY ?? (isTestEnv ? "test-signing-key" : undefined),
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? (isTestEnv ? "test-openai-api-key" : undefined),
    WORKOS_API_KEY: process.env.WORKOS_API_KEY ?? (isTestEnv ? "test-workos-api-key" : undefined),
    WORKOS_CLIENT_ID: process.env.WORKOS_CLIENT_ID ?? (isTestEnv ? "client_test" : undefined),
    WORKOS_REDIRECT_URI:
      process.env.WORKOS_REDIRECT_URI ?? (isTestEnv ? "http://localhost:3000/callback" : undefined),
    WORKOS_WEBHOOK_SECRET:
      process.env.WORKOS_WEBHOOK_SECRET ?? (isTestEnv ? "test-workos-webhook-secret" : undefined),
    NEXT_PUBLIC_WAITLIST_URL:
      process.env.NEXT_PUBLIC_WAITLIST_URL ??
      (isTestEnv ? "https://example.com/waitlist" : undefined),
  },
});
