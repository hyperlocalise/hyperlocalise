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

    /** GitHub App slug used in the GitHub App installation URL. Required for GitHub bot integration. */
    GITHUB_APP_SLUG: z.string().min(1).optional(),

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

    /** Enables live WorkOS API calls such as membership reconciliation. */
    WORKOS_ENABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),

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
    RESEND_FROM_ADDRESS: z.email().optional(),

    /** Display name for outbound emails sent by the email bot. */
    RESEND_FROM_NAME: z.string().min(1).optional(),

    /** Slack OAuth client ID for multi-workspace adapter. Required for Slack bot integration. */
    SLACK_CLIENT_ID: z.string().min(1).optional(),

    /** Slack OAuth client secret for multi-workspace adapter. Required for Slack bot integration. */
    SLACK_CLIENT_SECRET: z.string().min(1).optional(),

    /** Slack signing secret for webhook verification. Required for secure Slack webhook handling. */
    SLACK_SIGNING_SECRET: z.string().min(1).optional(),

    /** Secret used to sign Slack OAuth state parameters. Required for Slack workspace installation. */
    SLACK_OAUTH_STATE_SECRET: z.string().min(1).optional(),

    /** Slack OAuth redirect URI. Optional — falls back to the current request origin. */
    SLACK_REDIRECT_URI: z.url().optional(),

    /** Autumn secret key for server-side usage checks and tracking. */
    AUTUMN_API_KEY: z.string().min(1).optional(),

    /** Object storage adapter for durable uploaded and generated files. */
    FILE_STORAGE_PROVIDER: z.enum(["vercel_blob"]).default("vercel_blob"),

    /** Default access level used for new stored files. */
    FILE_STORAGE_ACCESS: z.enum(["private", "public"]).default("private"),

    /** Vercel Blob read/write token used by the Vercel Blob storage adapter. */
    BLOB_READ_WRITE_TOKEN: z.string().min(1).optional(),

    /** Enables MCP OAuth and transport endpoints. */
    MCP_AUTH_ENABLED: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),

    /** Allows public dynamic MCP OAuth client registration. Opt in for development. */
    MCP_ALLOW_DYNAMIC_REGISTRATION: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),

    /** MCP opaque access token lifetime in minutes. */
    MCP_TOKEN_LIFETIME_MINUTES: z.coerce.number().int().positive().default(60),

    /** MCP refresh token lifetime in days. */
    MCP_REFRESH_TOKEN_LIFETIME_DAYS: z.coerce.number().int().positive().default(30),

    /** AES-256-GCM key for MCP token encryption at rest. */
    MCP_ENCRYPTION_KEY: z.string().min(1).optional(),

    /**
     * Public base URL for inbound TMS webhooks (e.g. https://app.hyperlocalise.com).
     * When set, hosted deployments attempt automatic provider webhook registration.
     */
    HYPERLOCALISE_PUBLIC_APP_URL: z.url().optional(),

    /**
     * Shared secret for Vercel Cron and manual cron invocations.
     * Vercel sends `Authorization: Bearer <CRON_SECRET>` when this env var is set.
     */
    CRON_SECRET: z.string().min(1).optional(),

    /** Interval for lightweight file/job scans in minutes. */
    TMS_SCHEDULED_RECONCILIATION_INCREMENTAL_INTERVAL_MINUTES: z.coerce
      .number()
      .int()
      .positive()
      .default(15),

    /** Interval for TM/glossary import scans in minutes. */
    TMS_SCHEDULED_RECONCILIATION_TM_GLOSSARY_INTERVAL_MINUTES: z.coerce
      .number()
      .int()
      .positive()
      .default(60),

    /** Interval for full reconciliation in minutes. */
    TMS_SCHEDULED_RECONCILIATION_FULL_INTERVAL_MINUTES: z.coerce
      .number()
      .int()
      .positive()
      .default(24 * 60),

    /** Interval for provider health and webhook audits in minutes. */
    TMS_SCHEDULED_RECONCILIATION_AUDIT_INTERVAL_MINUTES: z.coerce
      .number()
      .int()
      .positive()
      .default(24 * 60),

    /** UTC hour for nightly full reconciliation. */
    TMS_SCHEDULED_RECONCILIATION_FULL_HOUR_UTC: z.coerce.number().int().min(0).max(23).default(3),

    /** UTC hour for daily provider health and webhook audits. */
    TMS_SCHEDULED_RECONCILIATION_AUDIT_HOUR_UTC: z.coerce.number().int().min(0).max(23).default(4),

    /** Maximum sync intents enqueued per cron tick. */
    TMS_SCHEDULED_RECONCILIATION_MAX_INTENTS_PER_TICK: z.coerce
      .number()
      .int()
      .positive()
      .default(500),

    /** Maximum repositories processed per GitHub automation dispatch cron tick. */
    GITHUB_REPOSITORY_AUTOMATION_DISPATCH_MAX_REPOS_PER_TICK: z.coerce
      .number()
      .int()
      .positive()
      .default(100),

    /**
     * Opt in to TMS provider shell mode (live provider reads, background sync off).
     * Prefer NEXT_PUBLIC_TMS_PROVIDER_SHELL_MODE for client-visible behavior.
     */
    TMS_PROVIDER_SHELL_MODE: z.enum(["true", "false"]).transform((value) => value === "true"),

    /**
     * Enables background TMS reconciliation while keeping live API reads for fresh data.
     */
    TMS_HYBRID_SYNC_ENABLED: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),
  },
  client: {
    /** Public URL for the waitlist/sign-up page. Required for client-side redirects. */
    NEXT_PUBLIC_WAITLIST_URL: z.url(),

    /** Public runtime environment exposed to the browser. Mirrors NODE_ENV. */
    NEXT_PUBLIC_APP_ENV: z.enum(["development", "test", "production"]).default("development"),

    /** Public WorkOS OAuth redirect URI exposed to the browser. Optional — falls back to WORKOS_REDIRECT_URI. */
    NEXT_PUBLIC_WORKOS_REDIRECT_URI: z.url().optional(),

    /** Exposes TMS provider shell mode to client components. Falls back to TMS_PROVIDER_SHELL_MODE. */
    NEXT_PUBLIC_TMS_PROVIDER_SHELL_MODE: z
      .enum(["true", "false"])
      .transform((value) => value === "true"),

    /** Exposes hybrid TMS sync to client components. Falls back to TMS_HYBRID_SYNC_ENABLED. */
    NEXT_PUBLIC_TMS_HYBRID_SYNC_ENABLED: z
      .enum(["true", "false"])
      .transform((value) => value === "true"),
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
    GITHUB_APP_SLUG: process.env.GITHUB_APP_SLUG ?? (isTestEnv ? "hyperlocalise" : undefined),
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
    WORKOS_ENABLED: isTestEnv ? "false" : (process.env.WORKOS_ENABLED ?? "false"),
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
    SLACK_CLIENT_ID:
      process.env.SLACK_CLIENT_ID ?? (isTestEnv ? "test-slack-client-id" : undefined),
    SLACK_CLIENT_SECRET:
      process.env.SLACK_CLIENT_SECRET ?? (isTestEnv ? "test-slack-client-secret" : undefined),
    SLACK_SIGNING_SECRET:
      process.env.SLACK_SIGNING_SECRET ?? (isTestEnv ? "test-slack-signing-secret" : undefined),
    SLACK_OAUTH_STATE_SECRET:
      process.env.SLACK_OAUTH_STATE_SECRET ??
      (isTestEnv ? "test-slack-oauth-state-secret" : undefined),
    SLACK_REDIRECT_URI: process.env.SLACK_REDIRECT_URI,
    AUTUMN_API_KEY: process.env.AUTUMN_API_KEY,
    FILE_STORAGE_PROVIDER: process.env.FILE_STORAGE_PROVIDER,
    FILE_STORAGE_ACCESS: process.env.FILE_STORAGE_ACCESS,
    BLOB_READ_WRITE_TOKEN:
      process.env.BLOB_READ_WRITE_TOKEN ?? (isTestEnv ? "test-blob-read-write-token" : undefined),
    MCP_AUTH_ENABLED: process.env.MCP_AUTH_ENABLED ?? "true",
    MCP_ALLOW_DYNAMIC_REGISTRATION:
      process.env.MCP_ALLOW_DYNAMIC_REGISTRATION ?? (isTestEnv ? "true" : "false"),
    MCP_TOKEN_LIFETIME_MINUTES: process.env.MCP_TOKEN_LIFETIME_MINUTES,
    MCP_REFRESH_TOKEN_LIFETIME_DAYS: process.env.MCP_REFRESH_TOKEN_LIFETIME_DAYS,
    MCP_ENCRYPTION_KEY:
      process.env.MCP_ENCRYPTION_KEY ??
      (isTestEnv ? "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=" : undefined),
    HYPERLOCALISE_PUBLIC_APP_URL:
      process.env.HYPERLOCALISE_PUBLIC_APP_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined) ??
      (isTestEnv ? "https://app.example.test" : undefined),
    CRON_SECRET: process.env.CRON_SECRET ?? (isTestEnv ? "test-cron-secret" : undefined),
    TMS_SCHEDULED_RECONCILIATION_INCREMENTAL_INTERVAL_MINUTES:
      process.env.TMS_SCHEDULED_RECONCILIATION_INCREMENTAL_INTERVAL_MINUTES,
    TMS_SCHEDULED_RECONCILIATION_TM_GLOSSARY_INTERVAL_MINUTES:
      process.env.TMS_SCHEDULED_RECONCILIATION_TM_GLOSSARY_INTERVAL_MINUTES,
    TMS_SCHEDULED_RECONCILIATION_FULL_INTERVAL_MINUTES:
      process.env.TMS_SCHEDULED_RECONCILIATION_FULL_INTERVAL_MINUTES,
    TMS_SCHEDULED_RECONCILIATION_AUDIT_INTERVAL_MINUTES:
      process.env.TMS_SCHEDULED_RECONCILIATION_AUDIT_INTERVAL_MINUTES,
    TMS_SCHEDULED_RECONCILIATION_FULL_HOUR_UTC:
      process.env.TMS_SCHEDULED_RECONCILIATION_FULL_HOUR_UTC,
    TMS_SCHEDULED_RECONCILIATION_AUDIT_HOUR_UTC:
      process.env.TMS_SCHEDULED_RECONCILIATION_AUDIT_HOUR_UTC,
    TMS_SCHEDULED_RECONCILIATION_MAX_INTENTS_PER_TICK:
      process.env.TMS_SCHEDULED_RECONCILIATION_MAX_INTENTS_PER_TICK,
    GITHUB_REPOSITORY_AUTOMATION_DISPATCH_MAX_REPOS_PER_TICK:
      process.env.GITHUB_REPOSITORY_AUTOMATION_DISPATCH_MAX_REPOS_PER_TICK,
    TMS_PROVIDER_SHELL_MODE:
      process.env.TMS_PROVIDER_SHELL_MODE ??
      process.env.NEXT_PUBLIC_TMS_PROVIDER_SHELL_MODE ??
      "true",
    TMS_HYBRID_SYNC_ENABLED: process.env.TMS_HYBRID_SYNC_ENABLED ?? "true",
    NEXT_PUBLIC_TMS_PROVIDER_SHELL_MODE:
      process.env.NEXT_PUBLIC_TMS_PROVIDER_SHELL_MODE ??
      process.env.TMS_PROVIDER_SHELL_MODE ??
      "true",
    NEXT_PUBLIC_TMS_HYBRID_SYNC_ENABLED:
      process.env.NEXT_PUBLIC_TMS_HYBRID_SYNC_ENABLED ??
      process.env.TMS_HYBRID_SYNC_ENABLED ??
      "true",
    NEXT_PUBLIC_WAITLIST_URL:
      process.env.NEXT_PUBLIC_WAITLIST_URL ??
      (isTestEnv ? "https://example.com/waitlist" : undefined),
    NEXT_PUBLIC_WORKOS_REDIRECT_URI:
      process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI ??
      process.env.WORKOS_REDIRECT_URI ??
      (isTestEnv ? "http://localhost:3000/auth/callback" : undefined),
  },
});
