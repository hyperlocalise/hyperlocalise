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
import { withWorkflow } from "workflow/next";

import { AGENT_MARKDOWN_TRACE_GLOB } from "./src/agents/_runtime/paths";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  experimental: {
    viewTransition: true,
  },
  // Agent prompts load from src/agents/**/*.md at runtime via process.cwd() (see paths.ts).
  outputFileTracingIncludes: {
    "/*": [AGENT_MARKDOWN_TRACE_GLOB, "_posts/**/*.md"],
  },
  // Crowdin App frame-ancestors CSP is set at runtime in `src/proxy.ts`
  // (defaults ∪ CROWDIN_APP_FRAME_ANCESTORS). Do not also set CSP here —
  // multiple CSP headers intersect and would block Enterprise custom domains.
};

export default withWorkflow(nextConfig);
