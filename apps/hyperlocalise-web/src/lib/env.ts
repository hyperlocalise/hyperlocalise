import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

const isTestEnv = process.env.VITEST === "true" || process.env.NODE_ENV === "test";
const isCI = process.env.CI === "true";

export const env = createEnv({
  skipValidation: isCI,
  server: {
    /** Runtime environment: development, test, or production. */
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

    /** Postgres connection string for Drizzle ORM. */
    DATABASE_URL: z.string().min(1),

    /** OpenAI API key used for LLM-powered features. Optional when AI features are disabled. */
    OPENAI_API_KEY: z.string().min(1).optional(),

    /** Master encryption key for provider credentials. Must be a high-entropy 32-byte base64 value. */
    PROVIDER_CREDENTIALS_MASTER_KEY: z.string().min(1),

    /** GitHub App ID from the GitHub App settings page. Required for GitHub bot integration. */
    GITHUB_APP_ID: z.string().min(1).optional(),

    /** GitHub App private key (PEM format). Required for GitHub bot integration. */
    GITHUB_APP_PRIVATE_KEY: z.string().min(1).optional(),

    /** Secret used by GitHub to sign webhook payloads. Required for secure webhook handling. */
    GITHUB_APP_WEBHOOK_SECRET: z.string().min(1).optional(),

    /** Server-generated secret for signing OAuth `state` parameters during GitHub App installation. */
    GITHUB_OAUTH_STATE_SECRET: z.string().min(1).optional(),

    /** Postgres URL dedicated to chat state persistence. Optional — falls back to in-memory adapters. */
    CHAT_STATE_DATABASE_URL: z.string().min(1).optional(),

    /** WorkOS API key for authentication and organization management. */
    WORKOS_API_KEY: z.string().min(1).optional(),

    /** WorkOS client ID for OAuth flows. */
    WORKOS_CLIENT_ID: z.string().min(1).optional(),

    /** Redirect URI registered in WorkOS for OAuth callbacks. */
    WORKOS_REDIRECT_URI: z.url().optional(),

    /** Password for encrypting WorkOS session cookies. Must be at least 32 characters. */
    WORKOS_COOKIE_PASSWORD: z.string().min(32).optional(),

    /** Secret used by WorkOS to sign webhook payloads. Required for secure WorkOS webhook handling. */
    WORKOS_WEBHOOK_SECRET: z.string().min(1).optional(),

    /** Resend API key for sending and receiving emails. Required for email bot integration. */
    RESEND_API_KEY: z.string().min(1).optional(),

    /** Resend webhook secret for verifying inbound email webhooks. Required for secure email handling. */
    RESEND_WEBHOOK_SECRET: z.string().min(1).optional(),

    /** From address for outbound emails sent by the email bot. */
    RESEND_FROM_ADDRESS: z.string().email().optional(),

    /** Display name for outbound emails sent by the email bot. */
    RESEND_FROM_NAME: z.string().min(1).optional(),
  },
  client: {
    /** Public URL for the waitlist/sign-up page. Required for client-side redirects. */
    NEXT_PUBLIC_WAITLIST_URL: z.url(),

    /** Public runtime environment exposed to the browser. Mirrors NODE_ENV. */
    NEXT_PUBLIC_APP_ENV: z.enum(["development", "test", "production"]).default("development"),

    /** Public WorkOS OAuth redirect URI exposed to the browser. Optional — falls back to WORKOS_REDIRECT_URI. */
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
    GITHUB_OAUTH_STATE_SECRET:
      process.env.GITHUB_OAUTH_STATE_SECRET ??
      (isTestEnv ? "test-github-oauth-state-secret" : undefined),
    CHAT_STATE_DATABASE_URL: process.env.CHAT_STATE_DATABASE_URL,
    WORKOS_API_KEY: process.env.WORKOS_API_KEY ?? (isTestEnv ? "test-workos-api-key" : undefined),
    WORKOS_CLIENT_ID: process.env.WORKOS_CLIENT_ID ?? (isTestEnv ? "client_test" : undefined),
    WORKOS_REDIRECT_URI:
      process.env.WORKOS_REDIRECT_URI ?? (isTestEnv ? "http://localhost:3000/callback" : undefined),
    WORKOS_COOKIE_PASSWORD:
      process.env.WORKOS_COOKIE_PASSWORD ??
      (isTestEnv ? "test-workos-cookie-password-at-least-32-chars" : undefined),
    WORKOS_WEBHOOK_SECRET:
      process.env.WORKOS_WEBHOOK_SECRET ?? (isTestEnv ? "test-workos-webhook-secret" : undefined),
    RESEND_API_KEY: process.env.RESEND_API_KEY ?? (isTestEnv ? "test-resend-api-key" : undefined),
    RESEND_WEBHOOK_SECRET:
      process.env.RESEND_WEBHOOK_SECRET ?? (isTestEnv ? "test-resend-webhook-secret" : undefined),
    RESEND_FROM_ADDRESS:
      process.env.RESEND_FROM_ADDRESS ?? (isTestEnv ? "bot@example.com" : undefined),
    RESEND_FROM_NAME: process.env.RESEND_FROM_NAME ?? (isTestEnv ? "Hyperlocalise Bot" : undefined),
    NEXT_PUBLIC_WAITLIST_URL:
      process.env.NEXT_PUBLIC_WAITLIST_URL ??
      (isTestEnv ? "https://example.com/waitlist" : undefined),
    NEXT_PUBLIC_WORKOS_REDIRECT_URI:
      process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI ??
      process.env.WORKOS_REDIRECT_URI ??
      (isTestEnv ? "http://localhost:3000/auth/callback" : undefined),
  },
});
