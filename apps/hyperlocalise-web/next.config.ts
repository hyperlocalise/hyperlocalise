import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

import { AGENT_MARKDOWN_TRACE_GLOB } from "./src/agents/_runtime/paths";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Agent prompts load from src/agents/**/*.md at runtime via process.cwd() (see paths.ts).
  outputFileTracingIncludes: {
    "/*": [AGENT_MARKDOWN_TRACE_GLOB, "_posts/**/*.md"],
  },
};

export default withSentryConfig(withWorkflow(nextConfig), {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "hyperlocalise",

  project: "hyperlocalise-web",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
  // See the following for more information:
  // https://docs.sentry.io/product/crons/
  // https://vercel.com/docs/cron-jobs
  automaticVercelMonitors: true,

  // Automatically tree-shake Sentry logger statements to reduce bundle size
  disableLogger: true,
});
