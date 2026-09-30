/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type { NextConfig } from "next";
import { withBotId } from "botid/next/config";
import { withDatadogTurbopack } from "dd-trace/next";
import { withWorkflow } from "workflow/next";

import { AGENT_MARKDOWN_TRACE_GLOB } from "./src/agents/_runtime/paths";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  // Keep the tracer and the dependencies whose load hooks provide the spans we
  // rely on as native Node.js modules instead of folding them into route bundles.
  serverExternalPackages: ["dd-trace", "pg", "undici"],
  typescript: {
    // Exclude tests and typed-app.ts so next build does not instantiate AppType (TS2589).
    tsconfigPath: "tsconfig.build.json",
  },
  experimental: {
    exposeTestingApiInProductionBuild: true,
  },
  async rewrites() {
    const authkitDomain = process.env.WORKOS_AUTHKIT_DOMAIN;
    if (!authkitDomain) {
      return [];
    }

    return [
      {
        source: "/auth.md",
        destination: `https://${authkitDomain}/agent/auth.md`,
      },
    ];
  },
  // View transitions work without config in Next.js 16.3+ (experimental.viewTransition removed).
  // Agent prompts load from src/agents/**/*.md at runtime via process.cwd() (see paths.ts).
  outputFileTracingIncludes: {
    "/*": [AGENT_MARKDOWN_TRACE_GLOB, "_posts/**/*.md", "datadog-init.mjs"],
  },
  // Crowdin App frame-ancestors CSP is set at runtime in `src/proxy.ts`
  // (defaults ∪ CROWDIN_APP_FRAME_ANCESTORS). Do not also set CSP here —
  // multiple CSP headers intersect and would block Enterprise custom domains.
};

// BotID Deep Analysis must also be enabled in the Vercel Firewall dashboard.
// withWorkflow returns a Next.js plugin function; cast for BotID's NextConfigOrFunction.
// Datadog stays outermost so its Turbopack rules apply to the composed config.
export default withDatadogTurbopack(withBotId(withWorkflow(nextConfig) as unknown as NextConfig));
