import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

const isTestEnv = process.env.VITEST === "true" || process.env.NODE_ENV === "test";
const isCI = process.env.CI === "true";

export const env = createEnv({
  skipValidation: isCI,
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().min(1),
    OPENAI_API_KEY: z.string().min(1).optional(),
    PROVIDER_CREDENTIALS_MASTER_KEY: z.string().min(1),
    GITHUB_APP_ID: z.string().min(1).optional(),
    GITHUB_APP_PRIVATE_KEY: z.string().min(1).optional(),
    GITHUB_APP_WEBHOOK_SECRET: z.string().min(1).optional(),
    REDIS_URL: z.url().optional(),
    WORKOS_API_KEY: z.string().min(1).optional(),
    WORKOS_CLIENT_ID: z.string().min(1).optional(),
    WORKOS_REDIRECT_URI: z.url().optional(),
    WORKOS_COOKIE_PASSWORD: z.string().min(32).optional(),
    WORKOS_WEBHOOK_SECRET: z.string().min(1).optional(),
  },
  client: {
    NEXT_PUBLIC_WAITLIST_URL: z.url(),
    NEXT_PUBLIC_APP_ENV: z.enum(["development", "test", "production"]).default("development"),
    NEXT_PUBLIC_WORKOS_REDIRECT_URI: z.url().optional(),
  },
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? (isTestEnv ? "test-openai-api-key" : undefined),
    PROVIDER_CREDENTIALS_MASTER_KEY:
      process.env.PROVIDER_CREDENTIALS_MASTER_KEY ??
      (isTestEnv ? "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=" : undefined),
    GITHUB_APP_ID: process.env.GITHUB_APP_ID ?? (isTestEnv ? "123" : undefined),
    GITHUB_APP_PRIVATE_KEY:
      process.env.GITHUB_APP_PRIVATE_KEY ?? (isTestEnv ? "test-github-app-private-key" : undefined),
    GITHUB_APP_WEBHOOK_SECRET:
      process.env.GITHUB_APP_WEBHOOK_SECRET ??
      (isTestEnv ? "test-github-app-webhook-secret" : undefined),
    REDIS_URL: process.env.REDIS_URL,
    WORKOS_API_KEY: process.env.WORKOS_API_KEY ?? (isTestEnv ? "test-workos-api-key" : undefined),
    WORKOS_CLIENT_ID: process.env.WORKOS_CLIENT_ID ?? (isTestEnv ? "client_test" : undefined),
    WORKOS_REDIRECT_URI:
      process.env.WORKOS_REDIRECT_URI ?? (isTestEnv ? "http://localhost:3000/callback" : undefined),
    WORKOS_COOKIE_PASSWORD:
      process.env.WORKOS_COOKIE_PASSWORD ??
      (isTestEnv ? "test-workos-cookie-password-at-least-32-chars" : undefined),
    WORKOS_WEBHOOK_SECRET:
      process.env.WORKOS_WEBHOOK_SECRET ?? (isTestEnv ? "test-workos-webhook-secret" : undefined),
    NEXT_PUBLIC_WAITLIST_URL:
      process.env.NEXT_PUBLIC_WAITLIST_URL ??
      (isTestEnv ? "https://example.com/waitlist" : undefined),
    NEXT_PUBLIC_WORKOS_REDIRECT_URI:
      process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI ??
      process.env.WORKOS_REDIRECT_URI ??
      (isTestEnv ? "http://localhost:3000/auth/callback" : undefined),
  },
});
