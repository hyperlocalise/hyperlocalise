import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

const isTestEnv = process.env.VITEST === "true" || process.env.NODE_ENV === "test";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    INNGEST_EVENT_KEY: z.string().min(1),
    INNGEST_SIGNING_KEY: z.string().min(1),
  },
  client: {},
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    INNGEST_EVENT_KEY: process.env.INNGEST_EVENT_KEY ?? (isTestEnv ? "test-event-key" : undefined),
    INNGEST_SIGNING_KEY:
      process.env.INNGEST_SIGNING_KEY ?? (isTestEnv ? "test-signing-key" : undefined),
  },
});
